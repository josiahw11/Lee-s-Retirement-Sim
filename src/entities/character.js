// Procedural retirees on a real skeleton: one skinned mesh (vertex-colored) + one shirt mesh.
// Smooth capsule limbs with knees & elbows, a sculpted lathe torso, and detailed faces that blink.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M, shirtMaterial } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { clamp, lerp, damp, pick } from '../core/utils.js';

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

// Short sleeve / shorts leg with a domed top so the fabric caps the shoulder joint
// (local +y runs from the joint toward the elbow, matching between()).
const sleeveCache = new Map();
function sleeveGeo(len, r, dome, lod) {
  const k = `${len.toFixed(3)}:${r}:${dome}:${lod}`;
  if (!sleeveCache.has(k)) {
    const h = len / 2;
    const prof = dome > 0
      ? [[0, -h - dome], [r * 0.5, -h - dome * 0.87], [r * 0.8, -h - dome * 0.55], [r * 0.96, -h - dome * 0.2], [r, -h], [r * 0.97, h - 0.012], [r * 0.99, h]]
      : [[r, -h], [r * 0.97, h - 0.012], [r * 0.99, h]];
    sleeveCache.set(k, lathe(prof, lod ? 9 : 14));
  }
  return sleeveCache.get(k);
}

// Hair shells hug the skull instead of stacking balls on it.
// Men: horseshoe fringe around the back and sides (the classic retiree pattern).
const FRINGE = new THREE.SphereGeometry(1, 20, 6, Math.PI - 0.42, Math.PI + 0.84, 1.12, 0.68);
// Women: one sculpted set-and-curl bob with the face left open and the ends flipped under.
const bobCache = new Map();
function bobGeo(volume, lod) {
  const k = `${volume}:${lod}`;
  if (!bobCache.has(k)) {
    const v = volume;
    const prof = [[0.148, -0.118], [0.176, -0.132], [0.198 * v, -0.112], [0.204 * v, -0.05], [0.198 * v, 0.03], [0.182 * v, 0.1], [0.148 * v, 0.158], [0.09 * v, 0.19], [0.0, 0.2]];
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), lod ? 12 : 22, 0.95, Math.PI * 2 - 1.9);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * 0.96);
    g.computeVertexNormals();
    bobCache.set(k, g);
  }
  return bobCache.get(k);
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
  const g = lathe(prof);
  const p = g.attributes.position;
  const bellyAmt = o.female ? 0 : Math.max(0, b - 0.9) * 0.24; // a pot belly sticks out front, not sideways
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    let z = p.getZ(i) * 0.78;
    const front = Math.max(0, z / 0.2);
    z += bellyAmt * Math.exp(-(((y - 0.17) / 0.13) ** 2)) * front;
    if (o.female) z += 0.055 * Math.exp(-(((y - 0.37) / 0.07) ** 2)) * front; // bust
    p.setXYZ(i, x * 1.0, y, z);
  }
  g.computeVertexNormals();
  const parts = [g];
  if (o.female) {
    // lathe profiles must run bottom -> top so the surface faces outward
    const skirt = lathe([[0.34, -0.5], [0.33, -0.44], [0.29, -0.26], [0.24, -0.08], [0.2, 0.04]], 22);
    const sp = skirt.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setZ(i, sp.getZ(i) * 0.88);
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

  // ---- head
  sc(T.hi, skin, C, 0.15, 0.172, 0.158);
  sc(T.sph, skin, at(0, 0.02, -0.035), 0.142, 0.152, 0.14);
  sc(T.sph, skin, at(0, -0.085, 0.018), 0.128, 0.088, 0.128); // jowls
  sc(T.lo, skin, at(0, -0.112, 0.098), 0.048, 0.034, 0.036); // chin
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
  // hair
  if (o.female) {
    const h = o.hair, hd = darker(o.hair, 0.9);
    const vol = o.hat ? 1 : 1.06; // no hat = maximum hairspray
    add(bobGeo(vol, lod), h, mat4(C.x, C.y + 0.03, C.z - 0.03), 'head');
    add(T.hi, hd, mat4(C.x, C.y + 0.07, C.z - 0.05, 0, 0.17 * vol, 0.15 * vol, 0.16), 'head'); // crown volume inside the shell
    sc(T.sph, h, at(0, 0.13, 0.08), 0.142, 0.056, 0.08, 'head', 0.25); // swept bangs
  } else {
    const h = o.hair;
    add(FRINGE, h, mat4(C.x, C.y + 0.012, C.z - 0.022, 0, 0.162, 0.178, 0.17), 'head');
    if (o.hair === '#1c1c1c') sc(T.hi, h, at(0, 0.11, -0.01), 0.158, 0.078, 0.164); // dyed, full, suspicious
    else if (o.combover) for (let i = 0; i < 5; i++) cap(at(-0.1 + i * 0.012, 0.15 - i * 0.003, 0.08 - i * 0.04), at(0.11, 0.145 - i * 0.004, 0.06 - i * 0.04), 0.006, h, 'head');
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
  const hy = o.female ? 0.06 : 0;
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
  // ---- shorts / belt (men)
  if (!o.female) {
    const sh = o.shorts;
    add(T.cyl, sh, mat4(0, HIP - 0.02, 0, 0, 0.228, 0.16, 0.19), 'hips');
    add(T.cyl, '#3a2a1a', mat4(0, HIP + 0.055, 0, 0, 0.232, 0.03, 0.194), 'hips');
    sc(T.box, '#c9a64a', V(0, HIP + 0.055, 0.19), 0.035, 0.024, 0.01, 'hips');
  }
  // ---- arms
  for (const [side, sh, el, ha] of [[1, 'shL', 'elL', 'haL'], [-1, 'shR', 'elR', 'haR']]) {
    const A = ABS[sh], E = ABS[el], H = ABS[ha];
    cap(A, E, 0.058, skin, sh);
    const sl = between(A, A.clone().lerp(E, 0.58));
    add(sleeveGeo(sl.len, 0.084, 0.07, lod), sleeve, sl.m, sh);
    cap(E, H, 0.045, skin, el);
    // hand: palm + fingers block + thumb
    sc(T.sph, skin, V(H.x, H.y - 0.05, H.z + 0.006), 0.04, 0.058, 0.028, ha);
    sc(T.sph, darker(skin, 0.96), V(H.x, H.y - 0.098, H.z + 0.012), 0.034, 0.03, 0.024, ha);
    cap(V(H.x - side * 0.02, H.y - 0.03, H.z + 0.025), V(H.x - side * 0.03, H.y - 0.07, H.z + 0.04), 0.012, skin, ha, true);
    if (!o.female && side > 0) sc(T.cylLo, '#c9a64a', V(H.x, H.y + 0.035, H.z), 0.05, 0.022, 0.05, el); // gold watch
    if (o.female && side < 0) add(T.torus, '#f2c94c', mat4(H.x, H.y + 0.04, H.z, 0, 0.05, 0.05, 0.3, Math.PI / 2), el);
  }
  // ---- legs
  for (const [side, hp, kn, an] of [[1, 'hipL', 'knL', 'anL'], [-1, 'hipR', 'knR', 'anR']]) {
    const Hh = ABS[hp], K = ABS[kn], A = ABS[an];
    cap(Hh, K, 0.07, skin, hp);
    if (!o.female) {
      const leg = between(Hh, Hh.clone().lerp(K, 0.62), 0.1, 0.095, 1);
      add(T.cylLo, o.shorts, leg.m.multiply(new THREE.Matrix4().makeScale(1, leg.len, 1)), hp);
    }
    cap(K, A, 0.05, skin, kn);
    tiny(T.lo, darker(skin, 0.96), V(K.x, K.y - 0.12, K.z - 0.035), 0.05, 0.08, 0.045, kn); // calf
    const sockH = o.sock === '#141414' ? 0.24 : 0.13;
    add(T.cylLo, o.sock, mat4(A.x, A.y + sockH / 2 - 0.01, A.z, 0, 0.058, sockH, 0.058), kn);
    // shoes: sandals (with the socks, obviously) or sneakers/loafers
    const sandal = o.shoe === '#6b4a2a';
    sc(T.box, darker(o.shoe, 0.8), V(A.x, A.y - 0.062, A.z + 0.045), 0.1, 0.022, 0.25, an);
    if (sandal) {
      sc(T.sph, o.sock, V(A.x, A.y - 0.035, A.z + 0.06), 0.052, 0.035, 0.11, an);
      sc(T.box, o.shoe, V(A.x, A.y - 0.03, A.z + 0.1), 0.108, 0.014, 0.035, an);
      sc(T.box, o.shoe, V(A.x, A.y - 0.03, A.z + 0.0), 0.108, 0.014, 0.03, an);
    } else {
      sc(T.sph, o.shoe, V(A.x, A.y - 0.03, A.z + 0.055), 0.058, 0.042, 0.125, an);
      sc(T.lo, darker(o.shoe, 0.9), V(A.x, A.y - 0.02, A.z - 0.04), 0.05, 0.04, 0.05, an);
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
  const flats = parts.map((p) => { const f = flat(p.geo); total += f.n; return f; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  const si = new Uint16Array(total * 4), sw = new Float32Array(total * 4);
  let o = 0;
  parts.forEach((p, k) => {
    const f = flats[k];
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
    parts.push([GEO.cyl, '#3a2a1a', mat4(0, -0.9, 0.35, 0, 0.018, 2.0, 0.018, 0.35)]);
    parts.push([GEO.cyl, '#999', mat4(0, -0.1, 0.08, 0, 0.05, 0.12, 0.05, Math.PI / 2)]);
  } else if (type === 'beer') {
    parts.push([GEO.cyl, '#c9d3db', mat4(0, 0, 0, 0, 0.035, 0.12, 0.035)]);
    parts.push([GEO.cyl, '#1f5fb0', mat4(0, 0, 0, 0, 0.036, 0.06, 0.036)]);
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
    this.root.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    if (this.skin.skeleton) this.skin.skeleton.dispose();
  }
}

export function randomName(female) {
  const M_ = ['Earl', 'Walt', 'Herb', 'Mort', 'Stan', 'Ned', 'Irv', 'Sy', 'Lou', 'Burt', 'Hank', 'Gus', 'Arnie', 'Sid', 'Moe', 'Vern', 'Floyd', 'Marv', 'Dutch', 'Clem', 'Sal', 'Norm', 'Chet', 'Ralph', 'Howie', 'Bernie', 'Lyle', 'Otis'];
  const F_ = ['Rosalind', 'Bev', 'Phyllis', 'Rhoda', 'Estelle', 'Marge', 'Dot', 'Edna', 'Ruth', 'Myrna', 'Shirley', 'Lois', 'Bunny', 'Fran', 'Trudy', 'Agnes', 'Vivian', 'Harriet', 'Opal', 'Pearl', 'Loretta', 'Irma', 'Gert', 'Sylvia'];
  const L_ = ['Goldberg', 'McAllister', 'Pruitt', 'Kowalski', 'Feldman', "O'Toole", 'Vanderhoff', 'Schwartz', 'Bellamy', 'Delgado', 'Finkel', 'Hobbs', 'Larkin', 'Nussbaum', 'Pettigrew', 'Russo', 'Tuttle', 'Whitaker'];
  return `${pick(female ? F_ : M_)} ${pick(L_)}`;
}
