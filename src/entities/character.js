// Procedural retirees on a real skeleton: one skinned mesh (vertex-colored) + one shirt mesh.
// Smooth capsule limbs with knees & elbows, a sculpted lathe torso, and detailed faces that blink.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M, shirtMaterial } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { clamp, lerp, damp, pick } from '../core/utils.js';
import { makeHair } from './hair.js';

export const SKINS = ['#f1c7a5', '#e8b996', '#d9a07c', '#c68863', '#9a6545', '#f5d3b8', '#eab8a0', '#7a4a32'];
export const HAIR_M = ['#f2f2f2', '#d9d9d9', '#bdbdbd', '#9a9a9a', '#1c1c1c', '#f2f2f2', '#e8e4dc'];
export const HAIR_F = ['#b9c7f0', '#c9b3e6', '#f2f2f2', '#e2e2e2', '#d96d3b', '#f0d7a1', '#8e5a3c', '#ff9ec7'];
const SHORTS = ['#c8b48a', '#e7dfca', '#4a5a7a', '#8a9a6a', '#f2f2f2', '#b0463c', '#6b8fb0'];
const EYES = ['#3a6ea5', '#5a3a22', '#4a7a4a', '#6a6a6a', '#2f4f6f'];
const SLEEVES = ['#1fa39a', '#c9303a', '#23408e', '#f2c14e', '#f7a1c4', '#6a4c93', '#f4f1de', '#3a86ff'];

export const HIP = 0.86;

// ---------------------------------------------------------------- shared primitive templates
const T = {
  hi: new THREE.SphereGeometry(1, 20, 14),
  sph: new THREE.SphereGeometry(1, 12, 9),
  lo: new THREE.SphereGeometry(1, 8, 6),
  vlo: new THREE.SphereGeometry(1, 7, 5),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 10),
  taper: new THREE.CylinderGeometry(0.8, 1, 1, 16),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 24),
  box: new THREE.BoxGeometry(1, 1, 1),
  tri: new THREE.ConeGeometry(1, 1, 3),
};
const capCache = new Map();
function capsule(r, len, lod = false) {
  const k = `${r.toFixed(3)}:${len.toFixed(3)}:${lod}`;
  if (!capCache.has(k)) capCache.set(k, new THREE.CapsuleGeometry(r, Math.max(0.001, len), lod ? 2 : 3, lod ? 7 : 10));
  return capCache.get(k);
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
// matrix placing a y-aligned primitive centered between a and b
function between(a, b, sx = 1, sz = 1, sy = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  _q.setFromUnitVectors(_up, d.normalize());
  return { m: new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), _q, new THREE.Vector3(sx, sy, sz)), len };
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- smooth skinned tubes (limbs)
// A tube swept through rings in rest pose. Each ring carries its own colour and bone weights, so one
// continuous limb bends smoothly at the elbow/knee instead of two rigid capsules poking through each
// other. Where the colour changes (sock tops) the ring is doubled so the edge stays crisp.
const _tt = new THREE.Vector3(), _tn = new THREE.Vector3(), _tb = new THREE.Vector3(), _fwd = new THREE.Vector3(0, 0, 1);
function tube(rings, segs, { capStart = true, capEnd = true } = {}) {
  const R = [];
  rings.forEach((r, i) => { if (i && rings[i - 1].col !== r.col) R.push({ ...r, col: rings[i - 1].col }); R.push(r); });
  const nr = R.length;
  const P = [], meta = [];
  for (let i = 0; i < nr; i++) {
    const a = R[Math.max(0, i - 1)].c, b = R[Math.min(nr - 1, i + 1)].c;
    _tt.subVectors(b, a);
    if (_tt.lengthSq() < 1e-12) _tt.set(0, -1, 0);
    _tt.normalize();
    _tn.copy(_fwd).addScaledVector(_tt, -_fwd.dot(_tt)).normalize(); // toward the front
    _tb.crossVectors(_tt, _tn).normalize(); // across
    const r = R[i];
    for (let k = 0; k < segs; k++) {
      const ang = (k / segs) * Math.PI * 2;
      // a touch flatter at the back so calves and forearms read as muscle, not pipes
      const rz = r.rz * (Math.cos(ang) < 0 ? r.back ?? 1 : 1);
      P.push(r.c.x + _tn.x * Math.cos(ang) * rz + _tb.x * Math.sin(ang) * r.rx, r.c.y + _tn.y * Math.cos(ang) * rz + _tb.y * Math.sin(ang) * r.rx, r.c.z + _tn.z * Math.cos(ang) * rz + _tb.z * Math.sin(ang) * r.rx);
      meta.push(r);
    }
  }
  const idx = [];
  for (let i = 0; i < nr - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const a = i * segs + k, b = i * segs + ((k + 1) % segs), c = (i + 1) * segs + k, d = (i + 1) * segs + ((k + 1) % segs);
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (ring, flip) => {
    const ci = P.length / 3, r = R[ring];
    P.push(r.c.x, r.c.y, r.c.z);
    meta.push(r);
    for (let k = 0; k < segs; k++) {
      const a = ring * segs + k, b = ring * segs + ((k + 1) % segs);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(nr - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx);
  // make sure the faces point outward (the frame's handedness depends on the limb direction)
  const p0 = V(P[0], P[1], P[2]), p1 = V(P[3], P[4], P[5]), p2 = V(P[segs * 3], P[segs * 3 + 1], P[segs * 3 + 2]);
  const nrm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  if (nrm.dot(new THREE.Vector3().subVectors(p0, R[0].c)) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  g.computeVertexNormals();
  // flatten to the raw per-vertex layout buildSkinnedGeometry writes
  const ix = g.index.array, nor = g.attributes.normal.array, n = ix.length;
  const raw = { n, pos: new Float32Array(n * 3), nor: new Float32Array(n * 3), col: new Float32Array(n * 3), si: new Uint16Array(n * 4), sw: new Float32Array(n * 4) };
  const cc = new THREE.Color();
  for (let j = 0; j < n; j++) {
    const v = ix[j], m = meta[v];
    raw.pos.set([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], j * 3);
    raw.nor.set([nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]], j * 3);
    cc.set(m.col);
    raw.col.set([cc.r, cc.g, cc.b], j * 3);
    m.w.forEach(([bone, wt], q) => { raw.si[j * 4 + q] = bone; raw.sw[j * 4 + q] = wt; });
  }
  g.dispose();
  return raw;
}

// Limb tubes depend only on a handful of look values (gender, skin/sock/cloth colours, sock height),
// so a crowd of 100 residents shares a few dozen of them instead of rebuilding each one.
const tubeCache = new Map();
const cachedTube = (key, make) => { if (!tubeCache.has(key)) tubeCache.set(key, make()); return tubeCache.get(key); };

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Rings for a two-segment limb J0 -> J1 -> J2 (shoulder/elbow/wrist or hip/knee/ankle).
// prof: [[s, r, opts], ...] with s = metres along the limb from J0 (negative runs back past J0).
// Weights blend upper -> lower bone across the middle joint, and into `end` near J2 if given.
function limbRings(J0, J1, J2, bones, prof, { blend = 0.055, colorAt, extra } = {}) {
  const [b0, b1, b2] = bones;
  const L1 = J0.distanceTo(J1), L2 = J1.distanceTo(J2);
  const d1 = new THREE.Vector3().subVectors(J1, J0).normalize(), d2 = new THREE.Vector3().subVectors(J2, J1).normalize();
  return prof.map(([s, r, o = {}]) => {
    const c = s <= L1 ? J0.clone().addScaledVector(d1, s) : J1.clone().addScaledVector(d2, s - L1);
    if (o.dz) c.z += o.dz;
    const lower = smooth(L1 - blend, L1 + blend, s);
    let w = [[BI[b0], 1 - lower], [BI[b1], lower]];
    if (b2 && s > L1 + L2 - 0.035) { const e = smooth(L1 + L2 - 0.035, L1 + L2 + 0.01, s); w = [[BI[b0], (1 - lower) * (1 - e)], [BI[b1], lower * (1 - e)], [BI[b2], e]]; }
    if (o.top) w = [[BI[o.top], 1 - smooth(-0.06, 0.06, s)], [BI[b0], smooth(-0.06, 0.06, s)]]; // anchor the top to the parent
    const ring = { c, rx: r * (o.sx || 1), rz: r * (o.sz || 1), back: o.back, col: colorAt ? colorAt(s) : o.col, w };
    return extra ? extra(ring, s) : ring;
  });
}

// ---------------------------------------------------------------- sculpted templates (hands, shoes, head)
// One deformed mesh each, so they read as a hand / a sneaker / a face instead of stacked balls.
const tplCache = new Map();
function template(key, make) {
  if (!tplCache.has(key)) { const g = make(); g.computeVertexNormals(); tplCache.set(key, g); }
  return tplCache.get(key);
}
// relaxed hand: a mitten with knuckles and gently curled fingers (the thumb is its own capsule)
function handGeo(lod) {
  return template(`hand:${lod}`, () => {
    const g = new THREE.SphereGeometry(1, lod ? 8 : 14, lod ? 6 : 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const fing = smooth(0.1, -0.6, y); // 0 at the palm, 1 toward the fingertips
      x *= 0.041 * (1 + 0.12 * Math.max(0, -y) - 0.25 * fing * fing);
      z *= 0.024 * (1 - 0.25 * fing);
      y *= 0.06;
      if (!lod) z += Math.sin(x * 140) * 0.0025 * fing * (z > 0 ? 1 : 0); // finger grooves on the back
      z += fing * fing * 0.018; // curl
      p.setXYZ(i, x, y, z);
    }
    return g;
  });
}
// sneaker / loafer upper: rounded toe, narrower heel, flat bottom
function shoeGeo(lod) {
  return template(`shoe:${lod}`, () => {
    const g = new THREE.SphereGeometry(1, lod ? 9 : 16, lod ? 6 : 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const toe = Math.max(0, z);
      let X = x * 0.056 * (z < 0 ? 0.86 : 1 - 0.1 * toe * toe);
      let Y = y * 0.048 * (1 - 0.35 * toe * toe); // lower at the toe
      const Z = z * 0.128;
      if (Y < -0.022) Y = -0.022 + (Y + 0.022) * 0.15; // flat sole
      Y += 0.012 * toe * toe; // slight toe spring
      p.setXYZ(i, X, Y, Z);
    }
    return g;
  });
}
function soleGeo(lod) {
  return template(`sole:${lod}`, () => {
    const g = shoeGeo(lod).clone();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * 1.07, Math.max(-0.028, Math.min(-0.012, p.getY(i) - 0.008)), p.getZ(i) * 1.05);
    return g;
  });
}
// the seat of the shorts: hips that round under into the legs
function pelvisGeo(lod) {
  return template(`pelvis:${lod}`, () => {
    const g = lathe([[0.0, -0.118], [0.1, -0.112], [0.165, -0.092], [0.203, -0.055], [0.218, 0.0], [0.222, 0.045], [0.22, 0.075]], lod ? 12 : 26);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * 0.84);
    return g;
  });
}
function beltGeo(lod) {
  return template(`belt:${lod}`, () => {
    const g = lathe([[0.221, 0.04], [0.227, 0.044], [0.227, 0.069], [0.221, 0.073]], lod ? 12 : 26);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * 0.84);
    return g;
  });
}
// a whole head from one sphere: cranium, cheekbones, sagging jowls, a chin, a brow
function headGeo(female, lod) {
  return template(`head:${female}:${lod}`, () => {
    const g = new THREE.SphereGeometry(1, lod ? 12 : 30, lod ? 9 : 22);
    const p = g.attributes.position;
    const bump = (x, y, z, cx, cy, cz, r) => Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) / (r * r)));
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let X = x, Y = y, Z = z;
      const low = smooth(-0.15, -0.85, y); // jaw region
      X *= 1 + (female ? 0.02 : 0.1) * low * (1 - smooth(-0.75, -1, y) * 0.6); // jowls widen, then tuck in
      Z *= z < 0 ? 0.93 : 1; // flatter back of the skull
      Z += (female ? 0.05 : 0.1) * bump(x, y, z, 0, -0.82, 0.55, 0.35); // chin
      Z += 0.05 * bump(x, y, z, 0, 0.38, 0.92, 0.28); // brow
      Z += 0.03 * (bump(x, y, z, 0.62, -0.05, 0.75, 0.3) + bump(x, y, z, -0.62, -0.05, 0.75, 0.3)); // cheekbones
      Z -= 0.035 * (bump(x, y, z, 0.37, 0.2, 0.93, 0.18) + bump(x, y, z, -0.37, 0.2, 0.93, 0.18)); // eye sockets
      Y -= (female ? 0.02 : 0.06) * low * (1 - Math.abs(x)); // a little sag
      p.setXYZ(i, X * 0.15, Y * 0.17, Z * 0.158);
    }
    return g;
  });
}

// ---------------------------------------------------------------- torso & dress (lathe)
function lathe(profile, segs = 20) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), segs);
}

function torsoGeometry(o) {
  const b = o.belly || 1;
  const prof = o.female
    ? [[0.0, -0.06], [0.19, -0.05], [0.2, 0.05], [0.205, 0.16], [0.215, 0.3], [0.22, 0.4], [0.2, 0.49], [0.14, 0.56], [0.075, 0.59]]
    : [[0.0, -0.06], [0.2, -0.05], [0.225, 0.03], [0.24 + (b - 1) * 0.07, 0.15], [0.245 + (b - 1) * 0.04, 0.26], [0.235, 0.37], [0.235, 0.45], [0.205, 0.52], [0.13, 0.565], [0.075, 0.59]];
  const g = lathe(prof, 34);
  const p = g.attributes.position;
  const bellyAmt = o.female ? 0 : Math.max(0, b - 0.9) * 0.24; // a pot belly sticks out front, not sideways
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    let z = p.getZ(i) * 0.78;
    const front = Math.max(0, z / 0.2);
    z += bellyAmt * Math.exp(-(((y - 0.17) / 0.13) ** 2)) * front;
    if (o.female) z += 0.055 * Math.exp(-(((y - 0.37) / 0.07) ** 2)) * front; // bust
    // untucked shirt: soft folds that flare a little at the hem
    const hem = o.female ? 0 : smooth(0.06, -0.05, y);
    const fold = 1 + hem * (0.035 + 0.02 * Math.sin(Math.atan2(z, x) * 7));
    p.setXYZ(i, x * fold, y, z * fold);
  }
  g.computeVertexNormals();
  const parts = [g];
  if (o.female) {
    // lathe profiles must run bottom -> top so the surface faces outward
    const skirt = lathe([[0.33, -0.5], [0.335, -0.47], [0.33, -0.44], [0.29, -0.26], [0.24, -0.08], [0.2, 0.04]], 54);
    const sp = skirt.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      // soft pleats that open up toward a wavy hem
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      const down = smooth(0.0, -0.5, y);
      const f = 1 + down * down * (0.06 * Math.sin(Math.atan2(z, x) * 9) + 0.02 * Math.sin(Math.atan2(z, x) * 23));
      sp.setXYZ(i, x * f, y + down * 0.012 * Math.sin(Math.atan2(z, x) * 9), z * f * 0.88);
    }
    skirt.computeVertexNormals();
    parts.push(skirt);
  }
  const merged = mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)), false);
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------- skeleton layout (rest pose, root space)
const BONES = [
  ['root', null, 0, 0, 0],
  ['hips', 'root', 0, HIP, 0],
  ['spine', 'hips', 0, HIP, 0],
  ['neck', 'spine', 0, HIP + 0.56, 0],
  ['head', 'neck', 0, HIP + 0.64, 0.02],
  ['eyes', 'head', 0, HIP + 0.82, 0.17],
  ['shL', 'spine', 0.225, HIP + 0.5, -0.01],
  ['elL', 'shL', 0.245, HIP + 0.245, -0.01],
  ['haL', 'elL', 0.25, HIP + 0.01, 0.0],
  ['shR', 'spine', -0.225, HIP + 0.5, -0.01],
  ['elR', 'shR', -0.245, HIP + 0.245, -0.01],
  ['haR', 'elR', -0.25, HIP + 0.01, 0.0],
  ['hipL', 'hips', 0.1, HIP - 0.02, 0],
  ['knL', 'hipL', 0.1, 0.46, 0.012],
  ['anL', 'knL', 0.1, 0.075, 0],
  ['hipR', 'hips', -0.1, HIP - 0.02, 0],
  ['knR', 'hipR', -0.1, 0.46, 0.012],
  ['anR', 'knR', -0.1, 0.075, 0],
];
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
const ABS = Object.fromEntries(BONES.map((b) => [b[0], V(b[2], b[3], b[4])]));

function darker(hex, k) {
  return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
}

// Build every vertex-colored part in rest pose, each rigidly bound to one bone.
function bodyParts(o, lod = false) {
  const parts = [];
  const coarse = (g) => (!lod ? g : g === T.hi || g === T.sph ? T.lo : g === T.lo ? T.vlo : g === T.cyl || g === T.taper ? T.cylLo : g);
  const add = (geo, color, m, bone, detail = false) => { if (lod && detail) return; parts.push({ geo: coarse(geo), color, m, bone: BI[bone] }); };
  const skin = o.skin;
  const C = V(0, HIP + 0.79, 0.03); // head center
  const at = (dx, dy, dz) => V(C.x + dx, C.y + dy, C.z + dz);
  const sc = (g, color, p, sx, sy, sz, bone = 'head', rx = 0, ry = 0, rz = 0, detail = false) => add(g, color, mat4(p.x, p.y, p.z, ry, sx, sy, sz, rx, rz), bone, detail);
  const tiny = (g, color, p, sx, sy, sz, bone = 'head') => sc(g, color, p, sx, sy, sz, bone, 0, 0, 0, true);
  const cap = (a, b, r, color, bone, detail = false) => { const { m, len } = between(a, b); add(capsule(r, len, lod), color, m, bone, detail); };

  const raw = (r) => parts.push({ raw: r });
  const segs = lod ? 7 : 14;

  // ---- head: one sculpted shape (cranium, cheekbones, jowls, chin) instead of stacked spheres
  add(headGeo(!!o.female, lod), skin, mat4(C.x, C.y, C.z), 'head');
  if (o.female) {
    const blush = new THREE.Color(skin).lerp(new THREE.Color('#e8828a'), 0.45).getStyle();
    sc(T.sph, blush, at(0.07, -0.03, 0.104), 0.034, 0.024, 0.02);
    sc(T.sph, blush, at(-0.07, -0.03, 0.104), 0.034, 0.024, 0.02);
  }
  // nose: bridge + bulb (drinkers get the red one)
  cap(at(0, 0.03, 0.142), at(0, -0.015, 0.166), 0.018, skin, 'head');
  sc(T.sph, o.drinker ? '#e0857a' : darker(skin, 0.97), at(0, -0.026, 0.17), 0.03, 0.027, 0.03);
  tiny(T.lo, darker(skin, 0.8), at(0.013, -0.04, 0.17), 0.009, 0.006, 0.009);
  tiny(T.lo, darker(skin, 0.8), at(-0.013, -0.04, 0.17), 0.009, 0.006, 0.009);
  // ears + lobes
  for (const s of [1, -1]) {
    sc(T.sph, skin, at(s * 0.151, 0.0, -0.008), 0.022, 0.05, 0.035);
    tiny(T.lo, darker(skin, 0.85), at(s * 0.158, 0.0, -0.004), 0.008, 0.03, 0.018);
    tiny(T.lo, skin, at(s * 0.152, -0.048, 0.0), 0.016, 0.022, 0.016);
  }
  // droopy upper lids + bags (the eyes themselves live on the blink bone)
  for (const s of [1, -1]) {
    sc(T.sph, darker(skin, 0.95), at(s * 0.055, 0.047, 0.128), 0.036, 0.021, 0.028);
    tiny(T.lo, darker(skin, 0.9), at(s * 0.055, 0.006, 0.131), 0.03, 0.011, 0.018);
  }
  // mouth
  const mouthCol = o.female ? '#c2185b' : '#7a3d36';
  cap(at(-0.024, -0.074, 0.146), at(0.024, -0.074, 0.146), o.female ? 0.011 : 0.008, mouthCol, 'head');
  // brows
  const browCol = o.female ? '#8a6a5a' : o.hair;
  for (const s of [1, -1]) cap(at(s * 0.032, 0.066, 0.148), at(s * 0.084, 0.058, 0.138), o.female ? 0.007 : 0.014, browCol, 'head');
  // walrus mustache
  if (o.mustache) {
    const mc = o.hair === '#1c1c1c' ? '#d9d9d9' : o.hair;
    for (const s of [1, -1]) cap(at(0, -0.05, 0.164), at(s * 0.052, -0.07, 0.146), 0.017, mc, 'head');
  }
  // hair is its own textured mesh (hair.js); only the combover's few heroic strands live here
  if (!o.female && o.combover && o.hair !== '#1c1c1c') {
    for (let i = 0; i < 5; i++) cap(at(-0.1 + i * 0.012, 0.15 - i * 0.003, 0.08 - i * 0.04), at(0.11, 0.145 - i * 0.004, 0.06 - i * 0.04), 0.006, o.hair, 'head');
  }
  // glasses
  const gl = o.glasses;
  if (gl && gl !== 'none') {
    const frame = gl === 'readers' ? '#6a4a2a' : gl === 'big' ? '#2a1a2a' : '#c9a64a';
    for (const s of [1, -1]) {
      if (gl === 'readers') sc(T.torus, frame, at(s * 0.056, 0.028, 0.17), 0.034, 0.028, 0.03);
      else sc(T.sph, gl === 'big' ? '#2a1a2a' : '#26363f', at(s * 0.057, 0.026, 0.172), gl === 'big' ? 0.056 : 0.044, gl === 'big' ? 0.046 : 0.036, 0.011);
      add(T.box, frame, mat4(s * 0.118, C.y + 0.035, C.z + 0.09, 0, 0.006, 0.006, 0.16), 'head');
    }
    cap(at(-0.018, 0.045, 0.176), at(0.018, 0.045, 0.176), 0.004, frame, 'head');
  }
  // hats
  const hc = o.hatColor || '#ffffff';
  const hy = o.female ? 0.035 : 0; // hats sit on the set, not on the scalp
  if (o.hat === 'visor') {
    sc(T.cyl, hc, at(0, 0.1 + hy, 0), 0.162, 0.045, 0.17);
    sc(T.cyl, hc, at(0, 0.085 + hy, 0.16), 0.13, 0.012, 0.11, 'head', -0.1);
  } else if (o.hat === 'cap') {
    sc(T.hi, hc, at(0, 0.09 + hy, 0), 0.165, 0.125, 0.172);
    sc(T.cyl, hc, at(0, 0.085 + hy, 0.17), 0.12, 0.012, 0.12, 'head', -0.12);
    sc(T.lo, darker(hc, 0.8), at(0, 0.215 + hy, 0), 0.018, 0.012, 0.018);
  } else if (o.hat === 'bucket') {
    sc(T.taper, hc, at(0, 0.15 + hy, 0), 0.158, 0.14, 0.165);
    sc(T.cyl, darker(hc, 0.92), at(0, 0.085 + hy, 0), 0.25, 0.018, 0.255, 'head', 0.05);
  } else if (o.hat === 'fedora') {
    sc(T.taper, hc, at(0, 0.165 + hy, 0), 0.138, 0.135, 0.15);
    sc(T.cyl, '#222', at(0, 0.115 + hy, 0), 0.142, 0.03, 0.152);
    sc(T.cyl, hc, at(0, 0.1 + hy, 0), 0.27, 0.012, 0.28, 'head', -0.06);
  } else if (o.hat === 'sunhat') {
    sc(T.sph, hc, at(0, 0.15 + hy, 0), 0.165, 0.11, 0.165);
    sc(T.cyl, hc, at(0, 0.13 + hy, 0), 0.36, 0.012, 0.36, 'head', 0.06);
    sc(T.cyl, '#e84a5f', at(0, 0.16 + hy, 0), 0.168, 0.03, 0.168);
  } else if (o.hat === 'captain') {
    sc(T.cyl, '#ffffff', at(0, 0.15 + hy, 0.005), 0.19, 0.075, 0.195); // flat white crown
    sc(T.cyl, '#1a1a1a', at(0, 0.1 + hy, 0), 0.163, 0.05, 0.17); // black band
    sc(T.cyl, '#d4af37', at(0, 0.125 + hy, 0.0), 0.165, 0.008, 0.172); // gold braid
    sc(T.cyl, '#111111', at(0, 0.085 + hy, 0.165), 0.13, 0.012, 0.1, 'head', -0.18); // patent visor
    sc(T.box, '#d4af37', at(0, 0.125 + hy, 0.17), 0.05, 0.04, 0.012); // anchor badge
  } else if (o.hat === 'security') {
    sc(T.hi, '#1d2b53', at(0, 0.09, 0), 0.165, 0.125, 0.172);
    sc(T.cyl, '#1d2b53', at(0, 0.085, 0.17), 0.12, 0.012, 0.12, 'head', -0.12);
    sc(T.box, '#f2c94c', at(0, 0.16, 0.15), 0.06, 0.045, 0.012);
  }
  // ---- eyes (blink bone): sclera, iris, pupil, glint
  const eyeCol = o.eye || '#3a6ea5';
  for (const s of [1, -1]) {
    sc(T.sph, '#f4f1ea', at(s * 0.055, 0.03, 0.137), 0.028, 0.024, 0.018, 'eyes');
    sc(T.lo, eyeCol, at(s * 0.054, 0.028, 0.153), 0.0145, 0.0145, 0.006, 'eyes');
    tiny(T.lo, '#0d0d0d', at(s * 0.054, 0.028, 0.158), 0.0075, 0.0075, 0.003, 'eyes');
    tiny(T.lo, '#ffffff', at(s * 0.049, 0.033, 0.16), 0.003, 0.003, 0.002, 'eyes');
  }
  // ---- neck, collar
  cap(V(0, HIP + 0.54, 0.0), V(0, HIP + 0.7, 0.02), 0.056, skin, 'neck');
  const sleeve = SLEEVES[(o.shirt || 0) % SLEEVES.length];
  add(T.torus, sleeve, mat4(0, HIP + 0.565, 0.005, 0, 0.085, 0.085, 0.3, Math.PI / 2 - 0.25), 'spine');
  if (o.female && o.pearls !== false) {
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      const x = Math.cos(a) * 0.085;
      const drop = Math.sin(a) * 0.075;
      const z = 0.07 + Math.sin(a) * 0.1;
      tiny(T.lo, '#f5f0e6', V(x, HIP + 0.56 - drop, z), 0.014, 0.014, 0.014, 'spine');
    }
  }
  if (o.badge) sc(T.box, '#f2c94c', V(0.1, HIP + 0.42, 0.175), 0.06, 0.07, 0.015, 'spine');
  if (o.sweater) {
    cap(V(-0.2, HIP + 0.53, -0.04), V(0.2, HIP + 0.53, -0.04), 0.045, o.sweater, 'spine');
    cap(V(0.18, HIP + 0.53, -0.02), V(0.03, HIP + 0.44, 0.17), 0.04, o.sweater, 'spine');
    cap(V(-0.18, HIP + 0.53, -0.02), V(-0.03, HIP + 0.44, 0.17), 0.04, o.sweater, 'spine');
    sc(T.sph, darker(o.sweater, 0.9), V(0, HIP + 0.43, 0.18), 0.045, 0.04, 0.03, 'spine');
  }
  // ---- shorts (men): a rounded seat instead of a drum, plus the belt
  if (!o.female) {
    add(pelvisGeo(lod), o.shorts, mat4(0, HIP, 0), 'hips');
    add(beltGeo(lod), '#3a2a1a', mat4(0, HIP, 0), 'hips');
    sc(T.box, '#c9a64a', V(0, HIP + 0.056, 0.186), 0.035, 0.024, 0.01, 'hips');
  }
  // ---- arms: one continuous limb each (deltoid, biceps, soft elbow, forearm, slim wrist)
  for (const [side, sh, el, ha] of [[1, 'shL', 'elL', 'haL'], [-1, 'shR', 'elR', 'haR']]) {
    const A = ABS[sh], E = ABS[el], H = ABS[ha];
    const L1 = A.distanceTo(E), L2 = E.distanceTo(H);
    const k = o.female ? 0.88 : 1;
    raw(cachedTube(`arm:${side}:${!!o.female}:${skin}:${lod}`, () => tube(limbRings(A, E, H, [sh, el], [
      [-0.045, 0.05 * k], [0, 0.058 * k], [0.05, 0.058 * k], [0.11, 0.054 * k], [0.18, 0.048 * k], [L1 - 0.03, 0.043 * k],
      [L1, 0.041 * k], [L1 + 0.03, 0.043 * k, { sz: 0.9 }], [L1 + 0.08, 0.045 * k, { sz: 0.85 }], [L1 + 0.15, 0.037 * k, { sz: 0.84 }],
      [L1 + L2 - 0.035, 0.03 * k, { sz: 0.8 }], [L1 + L2 + 0.008, 0.028 * k, { sz: 0.8 }],
    ], { colorAt: () => skin }), segs)));
    // short sleeve: domed over the shoulder, open hem
    const SL = L1 * 0.58;
    raw(cachedTube(`sleeve:${side}:${sleeve}:${lod}`, () => tube(limbRings(A, E, H, [sh, el], [
      [-0.08, 0.012], [-0.075, 0.04], [-0.062, 0.06], [-0.038, 0.073], [0, 0.078], [SL * 0.55, 0.076], [SL - 0.008, 0.074], [SL, 0.076],
    ], { colorAt: () => sleeve }), segs, { capEnd: false })));
    // relaxed hand, palm toward the thigh, thumb forward
    add(handGeo(lod), skin, mat4(H.x - side * 0.004, H.y - 0.056, H.z + 0.004, -side * Math.PI / 2), ha);
    cap(V(H.x - side * 0.014, H.y - 0.026, H.z + 0.026), V(H.x - side * 0.024, H.y - 0.066, H.z + 0.042), 0.012, skin, ha, true);
    if (!o.female && side > 0) sc(T.cylLo, '#c9a64a', V(H.x, H.y + 0.035, H.z), 0.042, 0.022, 0.038, el); // gold watch
    if (o.female && side < 0) add(T.torus, '#f2c94c', mat4(H.x, H.y + 0.04, H.z, 0, 0.042, 0.042, 0.3, Math.PI / 2), el);
  }
  // ---- legs: thigh, a knee you can see, a calf that bulges at the back, ankles; socks painted on
  for (const [side, hp, kn, an] of [[1, 'hipL', 'knL', 'anL'], [-1, 'hipR', 'knR', 'anR']]) {
    const Hh = ABS[hp], K = ABS[kn], A = ABS[an];
    const L1 = Hh.distanceTo(K), L2 = K.distanceTo(A), end = L1 + L2;
    const k = o.female ? 0.88 : 1;
    const sockH = o.sock === '#141414' ? 0.24 : 0.13;
    const sockFrom = end - sockH + 0.01;
    const prof = [
      [-0.06, 0.072 * k, { top: 'hips' }], [0, 0.082 * k, { top: 'hips' }], [0.07, 0.081 * k], [0.15, 0.075 * k], [0.24, 0.066 * k], [0.32, 0.058 * k],
      [L1, 0.054 * k, { sz: 1.06 }], [L1 + 0.04, 0.054 * k], [L1 + 0.1, 0.058 * k, { back: 1.28 }], [L1 + 0.16, 0.054 * k, { back: 1.22 }],
      [L1 + 0.24, 0.044 * k, { back: 1.08 }], [L1 + 0.31, 0.037 * k], [end - 0.035, 0.033 * k], [end + 0.012, 0.034 * k],
    ];
    if (!prof.some(([q]) => Math.abs(q - sockFrom) < 0.004)) {
      // a ring exactly at the sock top so the colour edge is crisp
      const after = prof.findIndex(([q]) => q > sockFrom);
      const [s0, r0, o0] = prof[after - 1], [s1, r1] = prof[after];
      prof.splice(after, 0, [sockFrom, r0 + (r1 - r0) * ((sockFrom - s0) / (s1 - s0)), { back: o0?.back }]);
    }
    raw(cachedTube(`leg:${side}:${!!o.female}:${skin}:${o.sock}:${sockH}:${lod}`, () => tube(limbRings(Hh, K, A, [hp, kn, an], prof, {
      colorAt: (q) => (q >= sockFrom - 1e-4 ? o.sock : skin),
      extra: (ring, q) => { if (q >= sockFrom - 1e-4) { ring.rx += 0.004; ring.rz += 0.004; } return ring; },
    }), segs)));
    if (!o.female) {
      // shorts leg: loose, slightly flared at the hem, anchored to the hips at the top
      const SH = L1 * 0.62;
      raw(cachedTube(`shorts:${side}:${o.shorts}:${lod}`, () => tube(limbRings(Hh, K, A, [hp, kn], [
        [-0.08, 0.098, { top: 'hips' }], [0, 0.104, { top: 'hips' }], [0.07, 0.103, { sz: 0.94 }], [SH * 0.6, 0.097, { sz: 0.92 }], [SH - 0.012, 0.094, { sz: 0.92 }], [SH, 0.1, { sz: 0.94 }],
      ], { colorAt: () => o.shorts }), segs, { capStart: false, capEnd: false })));
    }
    // shoes: sculpted upper + sole (sandals are a sock foot + straps, obviously)
    const sandal = o.shoe === '#6b4a2a';
    add(soleGeo(lod), darker(o.shoe, 0.75), mat4(A.x, A.y - 0.04, A.z + 0.045), an);
    if (sandal) {
      add(shoeGeo(lod), o.sock, mat4(A.x, A.y - 0.042, A.z + 0.045, 0, 0.9, 0.8, 0.94), an);
      sc(T.box, o.shoe, V(A.x, A.y - 0.03, A.z + 0.1), 0.1, 0.014, 0.035, an);
      sc(T.box, o.shoe, V(A.x, A.y - 0.03, A.z + 0.0), 0.1, 0.014, 0.03, an);
    } else {
      add(shoeGeo(lod), o.shoe, mat4(A.x, A.y - 0.04, A.z + 0.045), an);
    }
  }
  return parts;
}

// Non-indexed position/normal arrays per template primitive, computed once.
const flatCache = new WeakMap();
function flat(geo) {
  let f = flatCache.get(geo);
  if (!f) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    f = { pos: g.attributes.position.array, nor: g.attributes.normal.array, n: g.attributes.position.count };
    flatCache.set(geo, f);
  }
  return f;
}

// Write every part straight into one set of typed arrays (much faster than merging geometries).
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
function buildSkinnedGeometry(parts) {
  let total = 0;
  const flats = parts.map((p) => { const f = p.raw || flat(p.geo); total += f.n; return f; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  const si = new Uint16Array(total * 4), sw = new Float32Array(total * 4);
  let o = 0;
  parts.forEach((p, k) => {
    const f = flats[k];
    if (p.raw) { // pre-built, pre-weighted (smooth limbs): copy straight in
      pos.set(f.pos, o * 3); nor.set(f.nor, o * 3); col.set(f.col, o * 3);
      si.set(f.si, o * 4); sw.set(f.sw, o * 4);
      o += f.n;
      return;
    }
    _nm.getNormalMatrix(p.m);
    _c.set(p.color);
    for (let i = 0; i < f.n; i++, o++) {
      _v.fromArray(f.pos, i * 3).applyMatrix4(p.m).toArray(pos, o * 3);
      _v.fromArray(f.nor, i * 3).applyMatrix3(_nm).normalize().toArray(nor, o * 3);
      col[o * 3] = _c.r; col[o * 3 + 1] = _c.g; col[o * 3 + 2] = _c.b;
      si[o * 4] = p.bone;
      sw[o * 4] = 1;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('wind', new THREE.BufferAttribute(new Float32Array(total), 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- held props
export function makeHeld(type) {
  const parts = [];
  if (type === 'rod') {
    // butt in the fist, tip ~1.9 m out along the hand's -y (fishing.js reads the tip from there)
    parts.push([GEO.cyl, '#c9a66b', mat4(0, 0.05, 0, 0, 0.026, 0.32, 0.026)]); // cork grip
    parts.push([GEO.cyl, '#2a2a2a', mat4(0, -0.85, 0, 0, 0.016, 2.1, 0.016)]);
    parts.push([GEO.cyl, '#999', mat4(0, -0.16, 0.06, 0, 0.05, 0.1, 0.05, Math.PI / 2)]); // reel
  } else if (type === 'beer') {
    parts.push([GEO.cyl, '#c9d3db', mat4(0, 0, 0, 0, 0.035, 0.12, 0.035)]);
    parts.push([GEO.cyl, '#1f5fb0', mat4(0, 0, 0, 0, 0.036, 0.06, 0.036)]);
  } else if (type === 'mic') {
    parts.push([GEO.cyl, '#1c1c1c', mat4(0, 0, 0.02, 0, 0.025, 0.2, 0.025)]);
    parts.push([GEO.sph, '#9aa0a6', mat4(0, 0.13, 0.02, 0, 0.045, 0.05, 0.045)]);
  } else if (type === 'paddle') {
    parts.push([GEO.cyl, '#222', mat4(0, -0.02, 0, 0, 0.02, 0.13, 0.02)]); // grip
    parts.push([GEO.cyl16, '#1f8a8a', mat4(0, -0.2, 0.01, 0, 0.1, 0.012, 0.12, Math.PI / 2)]); // face
    parts.push([GEO.cyl16, '#f2f2f2', mat4(0, -0.2, 0.01, 0, 0.106, 0.009, 0.126, Math.PI / 2)]); // edge guard
  } else if (type === 'fists' || !type) {
    return null;
  } else {
    const shaftLen = type === 'driver' ? 1.05 : type === 'putter' ? 0.85 : 0.95;
    const shaftCol = type === 'titanium' ? '#9fb3c8' : '#bfc5ca';
    parts.push([GEO.cyl, '#222', mat4(0, -0.02, 0, 0, 0.022, 0.2, 0.022)]); // grip
    parts.push([GEO.cyl, shaftCol, mat4(0, -shaftLen / 2, 0, 0, 0.012, shaftLen, 0.012)]);
    const hy = -shaftLen;
    if (type === 'putter') parts.push([GEO.box, '#9aa4ad', mat4(0.05, hy, 0, 0, 0.14, 0.04, 0.04)]);
    else if (type === 'driver' || type === 'titanium') parts.push([GEO.sph, type === 'titanium' ? '#607d9b' : '#1b1b1b', mat4(0.05, hy, 0.02, 0, 0.09, 0.06, 0.07)]);
    else if (type === 'wedge') parts.push([GEO.box, '#c0c6cc', mat4(0.05, hy, 0.02, 0, 0.1, 0.1, 0.02, 0.5)]);
    else parts.push([GEO.box, '#aeb6be', mat4(0.05, hy, 0.01, 0, 0.11, 0.07, 0.02, 0.3)]); // iron
  }
  const g = mergeParts(parts);
  const m = new THREE.Mesh(g, M.vc);
  m.castShadow = true;
  return m;
}

export function randomLook(female, rnd = Math.random) {
  const r = (a) => a[Math.floor(rnd() * a.length)];
  return {
    female,
    skin: r(SKINS),
    hair: female ? r(HAIR_F) : r(HAIR_M),
    eye: r(EYES),
    shirt: Math.floor(rnd() * 8),
    shorts: r(SHORTS),
    hat: female ? r(['none', 'none', 'visor', 'sunhat']) : r(['none', 'visor', 'bucket', 'cap', 'fedora', 'none']),
    hatColor: r(['#ffffff', '#f2c94c', '#1f8a8a', '#e84a5f', '#23408e', '#c8b48a', '#ff9ec7']),
    glasses: r(female ? ['big', 'none', 'readers', 'big'] : ['aviator', 'none', 'readers', 'aviator']),
    mustache: !female && rnd() < 0.55,
    combover: !female && rnd() < 0.3,
    belly: female ? 0.9 + rnd() * 0.3 : 0.95 + rnd() * 0.55,
    height: 0.92 + rnd() * 0.12,
    sock: female ? '#ffffff' : rnd() < 0.7 ? '#141414' : '#ffffff',
    shoe: female ? r(['#ffffff', '#f7cad0', '#d9c7b0']) : r(['#6b4a2a', '#ffffff', '#3a2a1a']),
    drinker: rnd() < 0.3,
  };
}

// ---------------------------------------------------------------- the character
export class Character {
  constructor(look) {
    const o = { eye: EYES[0], ...look };
    this.look = o;
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);

    // skeleton
    this.b = {};
    const bones = BONES.map(([name, parent]) => {
      const bn = new THREE.Bone();
      bn.name = name;
      this.b[name] = bn;
      return bn;
    });
    BONES.forEach(([name, parent, x, y, z]) => {
      const bn = this.b[name];
      if (parent) {
        const pa = ABS[parent];
        bn.position.set(x - pa.x, y - pa.y, z - pa.z);
        this.b[parent].add(bn);
      } else bn.position.set(x, y, z);
    });
    const skeleton = new THREE.Skeleton(bones);
    this.skin = new THREE.SkinnedMesh(buildSkinnedGeometry(bodyParts(o)), M.vc);
    this.skin.add(this.b.root);
    this.skin.castShadow = true;
    this.skin.frustumCulled = false;
    this.rig.add(this.skin);
    // far LOD: same skeleton, coarser geometry, no tiny details
    this.skinLo = new THREE.SkinnedMesh(buildSkinnedGeometry(bodyParts(o, true)), M.vc);
    this.skinLo.castShadow = true;
    this.skinLo.frustumCulled = false;
    this.skinLo.visible = false;
    this.rig.add(this.skinLo);
    this.root.updateMatrixWorld(true);
    this.skin.bind(skeleton);
    this.skinLo.bind(skeleton);
    this.near = true;

    // hair: textured strand shells on the head bone (near and far versions)
    const headC = { x: 0, y: 0.15, z: 0.01 }; // head centre relative to the head bone
    this.hairHi = makeHair(o, false, headC);
    this.hairLo = makeHair(o, true, headC);
    this.hairLo.visible = false;
    this.b.head.add(this.hairHi, this.hairLo);

    // shirt / dress (patterned texture) rides on the spine
    this.torso = new THREE.Mesh(torsoGeometry(o), shirtMaterial(o.shirt));
    this.torso.castShadow = true;
    this.torso.position.set(0, 0, 0);
    this.b.spine.add(this.torso);

    // attachment point for clubs / beers
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.08, 0.02);
    this.b.haR.add(this.hand);
    this.pelvis = this.b.hips;

    if (o.walker) {
      const wParts = [];
      for (const [x, z] of [[-0.28, 0], [0.28, 0], [-0.28, 0.4], [0.28, 0.4]]) wParts.push([GEO.cyl, '#c9ced1', mat4(x, 0.45, z + 0.35, 0, 0.018, 0.9, 0.018)]);
      wParts.push([GEO.box, '#c9ced1', mat4(0, 0.88, 0.55, 0, 0.6, 0.03, 0.03)]);
      wParts.push([GEO.box, '#c9ced1', mat4(0.28, 0.88, 0.55, 0, 0.03, 0.03, 0.42)]);
      wParts.push([GEO.box, '#c9ced1', mat4(-0.28, 0.88, 0.55, 0, 0.03, 0.03, 0.42)]);
      for (const x of [-0.28, 0.28]) wParts.push([GEO.sph, '#b8e04a', mat4(x, 0.04, 0.35, 0, 0.05, 0.05, 0.05)]); // tennis balls!
      this.walker = new THREE.Mesh(mergeParts(wParts), M.vc);
      this.walker.castShadow = true;
      this.rig.add(this.walker);
    }

    const s = o.height;
    this.root.scale.set(s * (0.96 + (o.belly - 1) * 0.12), s, s);

    this.phase = Math.random() * 10;
    this.speed = 0;
    this.mode = 'idle'; // idle | walk | sit | ko | swim | lounge
    this.action = null;
    this.drunk = 0;
    this.t = Math.random() * 10;
    this.koT = 0;
    this.held = null;
    this.heldType = null;
    this.blinkT = 1 + Math.random() * 4;
    this.lookAt = null; // {x, z} world point to turn the head toward
    this.headYaw = 0;
  }

  // swap between the detailed and the distant mesh
  setNear(near) {
    if (near === this.near) return;
    this.near = near;
    this.skin.visible = near;
    this.skinLo.visible = !near;
    this.hairHi.visible = near;
    this.hairLo.visible = !near;
  }

  setHeld(type) {
    if (this.heldType === type) return;
    if (this.held) { this.hand.remove(this.held); this.held.geometry.dispose(); }
    this.heldType = type;
    this.held = makeHeld(type);
    if (this.held) {
      this.held.rotation.x = type === 'beer' ? 0 : 0.2;
      this.hand.add(this.held);
    }
  }

  play(type, dur = 0.5) {
    this.action = { type, t: 0, dur };
  }

  get acting() {
    return !!this.action;
  }

  update(dt) {
    this.t += dt;
    const b = this.b;
    const sp = this.speed;
    const walking = this.mode === 'walk' || this.mode === 'swim';
    const amp = walking ? clamp(sp / 3.2, 0.15, 1.1) * 0.55 : 0;
    if (walking) this.phase += dt * (4 + sp * 2.4);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);

    // ---- base pose (old-man posture: slight hunch, soft knees, bent elbows)
    const P = {
      hipL: s * amp, hipR: -s * amp,
      knL: 0.1 + Math.max(0, -c) * amp * 1.5, knR: 0.1 + Math.max(0, c) * amp * 1.5,
      anL: 0, anR: 0,
      hipLz: 0, hipRz: 0,
      shL: -s * amp * 0.75, shR: s * amp * 0.75,
      shLz: 0.1, shRz: -0.1,
      elL: -0.28 - amp * 0.3, elR: -0.28 - amp * 0.3,
      spine: 0.13 + sp * 0.022, spineY: -s * amp * 0.18, spineZ: 0,
      hipsY: HIP + Math.abs(c) * 0.03 * amp, hipsYaw: s * amp * 0.14,
      neck: -0.08, head: 0,
      rigX: 0, rigY: 0,
    };
    if (this.mode === 'idle') {
      const br = Math.sin(this.t * 1.6) * 0.02;
      P.spine = 0.14 + br;
      P.shL = br; P.shR = -br;
    }
    if (this.look.walker && this.mode !== 'sit' && this.mode !== 'ko' && this.mode !== 'lounge') {
      P.shL = P.shR = -0.85;
      P.elL = P.elR = -0.35;
      P.spine = 0.32;
    }
    if (this.mode === 'sit') {
      P.hipL = P.hipR = -1.5;
      P.knL = P.knR = 1.45;
      P.shL = P.shR = -1.05;
      P.elL = P.elR = -0.55;
      P.shLz = 0.05; P.shRz = -0.18;
      P.spine = -0.04;
      P.hipsYaw = 0;
    }
    if (this.mode === 'swim') {
      P.shL = -1.9 + Math.sin(this.phase) * 1.2;
      P.shR = -1.9 - Math.sin(this.phase) * 1.2;
      P.elL = P.elR = -0.2;
      P.spine = 0.8;
      P.neck = -0.6;
    }
    if (this.mode === 'ko' || this.mode === 'lounge') {
      if (this.mode === 'ko') this.koT += dt;
      P.rigX = -Math.PI / 2;
      P.rigY = 0.26;
      P.hipL = P.hipR = 0;
      P.knL = P.knR = 0.15;
      P.hipLz = 0.22; P.hipRz = -0.22;
      P.spine = 0;
      P.hipsYaw = 0;
      if (this.mode === 'lounge') {
        // hands behind the head, living the dream
        P.shL = P.shR = -2.8;
        P.elL = P.elR = -2.1;
        P.shLz = 0.3; P.shRz = -0.3;
        P.knR = 0.9; P.hipR = -0.5;
      } else {
        P.shLz = 1.3; P.shRz = -1.3;
        P.shL = P.shR = 0;
        P.elL = P.elR = -0.2;
        P.head = 0;
        P.neck = 0.3;
      }
    } else this.koT = 0;
    // Blue Boy side effects: a bow-legged waddle, both hands clamped over a strategically held newspaper
    if (this.poseBlue && (this.mode === 'walk' || this.mode === 'idle')) {
      P.hipLz = 0.17; P.hipRz = -0.17;
      P.knL += 0.12; P.knR += 0.12;
      P.spine = Math.max(P.spine, 0.28);
      P.shL = P.shR = -0.42; P.elL = P.elR = -1.0;
      P.shLz = -0.18; P.shRz = 0.18;
      P.hipsYaw *= 0.3;
    }
    // holding a fishing rod out over the water
    if (this.poseRod && this.mode !== 'ko' && this.mode !== 'sit') {
      P.shR = -0.95; P.elR = -0.95; P.shRz = -0.1;
    }

    // ---- action overlays
    let fast = false;
    if (this.action) {
      const a = this.action;
      a.t += dt;
      const p = clamp(a.t / a.dur, 0, 1);
      if (a.type === 'swing') {
        fast = true;
        if (p < 0.4) { const k = p / 0.4; P.shR = lerp(0, -2.8, k); P.elR = -0.6 * k; P.spineY = lerp(0, 0.55, k); }
        else if (p < 0.6) { const k = (p - 0.4) / 0.2; P.shR = lerp(-2.8, -0.25, k); P.elR = lerp(-0.6, 0, k); P.spineY = lerp(0.55, -0.6, k); }
        else { const k = (p - 0.6) / 0.4; P.shR = lerp(-0.25, 0, k); P.elR = 0; P.spineY = lerp(-0.6, 0, k); }
        P.shL = P.shR * 0.9;
        P.elL = P.elR;
        P.shLz = -0.35;
      } else if (a.type === 'punch') {
        fast = true;
        if (p < 0.3) { P.shR = -0.9; P.elR = -1.7; P.spineY = 0.25; }
        else if (p < 0.55) { P.shR = -1.55; P.elR = 0; P.spineY = -0.35; }
        else { P.shR = lerp(-1.55, 0, (p - 0.55) / 0.45); P.elR = -0.3; }
        P.shL = -0.9; P.elL = -1.8; // guard hand up
      } else if (a.type === 'drink') {
        const k = p < 0.2 ? p / 0.2 : p > 0.85 ? (1 - p) / 0.15 : 1;
        P.shR = -0.95 * k;
        P.elR = -2.25 * k;
        P.shRz = -0.25 * k;
        P.head = -0.45 * k;
        P.spine = lerp(P.spine, -0.15, k);
      } else if (a.type === 'wave') {
        P.shRz = -2.55;
        P.shR = -0.3;
        P.elR = -0.4 + Math.sin(a.t * 14) * 0.4;
      } else if (a.type === 'cheer') {
        P.shLz = 2.6 + Math.sin(a.t * 12) * 0.2;
        P.shRz = -2.6 - Math.sin(a.t * 12) * 0.2;
        P.shL = P.shR = 0;
        P.elL = P.elR = -0.3;
        P.hipsY += Math.abs(Math.sin(a.t * 10)) * 0.07;
      } else if (a.type === 'flinch') {
        P.spine = -0.35 * (1 - p);
        P.shL = P.shR = -1.1 * (1 - p);
        P.elL = P.elR = -1.8 * (1 - p);
      } else if (a.type === 'shake') {
        P.shR = -1.7;
        P.elR = -1.7;
        P.shRz = -0.2 + Math.sin(a.t * 20) * 0.2;
      } else if (a.type === 'point') {
        P.shR = -1.55;
        P.elR = 0;
      } else if (a.type === 'sand') {
        P.shR = lerp(-0.2, -1.8, Math.min(1, p * 2));
        P.elR = 0;
        P.shRz = lerp(0, -0.4, p);
      } else if (a.type === 'dance') {
        P.shL = -2.5 + Math.sin(a.t * 8) * 0.5;
        P.shR = -2.5 - Math.sin(a.t * 8) * 0.5;
        P.elL = P.elR = -0.6;
        P.spineY = Math.sin(a.t * 4) * 0.5;
        P.hipsYaw = -Math.sin(a.t * 4) * 0.3;
        P.knL = P.knR = 0.25 + Math.abs(Math.sin(a.t * 8)) * 0.3;
        P.hipL = P.hipR = -0.15;
        P.hipsY -= Math.abs(Math.sin(a.t * 8)) * 0.05;
      } else if (a.type === 'aqua') {
        // water aerobics: reach, lean left/right, squat — with a bounce on the beat
        const k = Math.sin(Math.min(1, p * 1.6) * Math.PI * 0.5);
        const bob = Math.sin(p * Math.PI) * 0.06;
        if (a.move === 'up') { P.shL = P.shR = -2.9 * k; P.elL = P.elR = -0.15; P.hipsY += bob; }
        else if (a.move === 'left') { P.shLz = 1.9 * k; P.shRz = -2.4 * k; P.shL = P.shR = 0; P.elR = -0.5; P.spineZ = 0.28 * k; }
        else if (a.move === 'right') { P.shRz = -1.9 * k; P.shLz = 2.4 * k; P.shL = P.shR = 0; P.elL = -0.5; P.spineZ = -0.28 * k; }
        else { P.shL = P.shR = -1.45 * k; P.elL = P.elR = 0; P.hipL = P.hipR = -0.9 * k; P.knL = P.knR = 1.1 * k; P.hipsY -= 0.22 * k; P.spine = 0.3; }
      } else if (a.type === 'pee') {
        P.shL = P.shR = -0.35;
        P.elL = P.elR = -0.95;
        P.spine = -0.15;
      }
      if (a.t >= a.dur) this.action = null;
    }
    // keep feet flat-ish
    P.anL = -(P.hipL + P.knL) * 0.7;
    P.anR = -(P.hipR + P.knR) * 0.7;
    if (this.mode === 'sit') P.anL = P.anR = 0.05;

    // ---- head: look toward a point of interest, blink now and then
    let yawT = 0;
    if (this.lookAt && this.mode !== 'ko' && this.mode !== 'sit') {
      const r = this.root;
      const want = Math.atan2(this.lookAt.x - r.position.x, this.lookAt.z - r.position.z);
      let d = want - r.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      yawT = Math.abs(d) < 1.9 ? clamp(d, -1.05, 1.05) : 0;
    }
    this.headYaw = damp(this.headYaw, yawT, 5, dt);
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      b.eyes.scale.y = 0.12;
      if (this.blinkT < -0.12) { this.blinkT = 2 + Math.random() * 4; b.eyes.scale.y = 1; }
    }
    if (this.mode === 'ko') b.eyes.scale.y = 0.1;

    // ---- apply with damping
    const k = 14, fk = fast ? 40 : k;
    const R = (bone, axis, v, kk = k) => (bone.rotation[axis] = damp(bone.rotation[axis], v, kk, dt));
    R(b.hipL, 'x', P.hipL); R(b.hipR, 'x', P.hipR);
    R(b.hipL, 'z', P.hipLz); R(b.hipR, 'z', P.hipRz);
    R(b.knL, 'x', P.knL); R(b.knR, 'x', P.knR);
    R(b.anL, 'x', P.anL); R(b.anR, 'x', P.anR);
    R(b.shL, 'x', P.shL, fk); R(b.shR, 'x', P.shR, fk);
    R(b.shL, 'z', P.shLz); R(b.shR, 'z', P.shRz);
    R(b.elL, 'x', P.elL, fk); R(b.elR, 'x', P.elR, fk);
    R(b.spine, 'x', P.spine);
    R(b.spine, 'y', P.spineY, fast ? 30 : k);
    R(b.spine, 'z', P.spineZ);
    R(b.hips, 'y', P.hipsYaw);
    R(b.neck, 'x', P.neck);
    R(b.head, 'x', P.head);
    b.neck.rotation.y = this.headYaw * 0.4;
    b.head.rotation.y = this.headYaw * 0.6;
    b.hips.position.y = damp(b.hips.position.y, P.hipsY, k, dt);
    if (!this.spinning) this.rig.rotation.x = damp(this.rig.rotation.x, P.rigX, 8, dt);
    this.rig.position.y = damp(this.rig.position.y, P.rigY, 8, dt);
    this.rig.rotation.z = Math.sin(this.t * 1.3) * 0.09 * this.drunk;
    if (this.walker) this.walker.position.z = walking ? Math.max(0, Math.sin(this.phase * 0.5)) * 0.08 : 0;
  }

  dispose() {
    this.root.removeFromParent();
    // geometry is unique per character; materials are shared, keep them
    this.root.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); // hair is shared
    if (this.skin.skeleton) this.skin.skeleton.dispose();
  }
}

export function randomName(female) {
  const M_ = ['Earl', 'Walt', 'Herb', 'Mort', 'Stan', 'Ned', 'Irv', 'Sy', 'Lou', 'Burt', 'Hank', 'Gus', 'Arnie', 'Sid', 'Moe', 'Vern', 'Floyd', 'Marv', 'Dutch', 'Clem', 'Sal', 'Norm', 'Chet', 'Ralph', 'Howie', 'Bernie', 'Lyle', 'Otis'];
  const F_ = ['Rosalind', 'Bev', 'Phyllis', 'Rhoda', 'Estelle', 'Marge', 'Dot', 'Edna', 'Ruth', 'Myrna', 'Shirley', 'Lois', 'Bunny', 'Fran', 'Trudy', 'Agnes', 'Vivian', 'Harriet', 'Opal', 'Pearl', 'Loretta', 'Irma', 'Gert', 'Sylvia'];
  const L_ = ['Goldberg', 'McAllister', 'Pruitt', 'Kowalski', 'Feldman', "O'Toole", 'Vanderhoff', 'Schwartz', 'Bellamy', 'Delgado', 'Finkel', 'Hobbs', 'Larkin', 'Nussbaum', 'Pettigrew', 'Russo', 'Tuttle', 'Whitaker'];
  return `${pick(female ? F_ : M_)} ${pick(L_)}`;
}
