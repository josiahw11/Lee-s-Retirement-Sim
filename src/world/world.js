// Builds the whole Sunset Palms map: ground, roads, houses, course, landmarks, signage.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batcher, mat4, mergeParts } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { makeDetailTexture, makeAsphaltTexture, makeSignTexture } from '../gfx/textures.js';
import { makeWaterMaterial } from '../gfx/water.js';
import { Colliders } from './collide.js';
import {
  HALF, WALL, EDGES, NODES, HOLES, FAIRWAY_W, PONDS, RAMPS, BUILDINGS as B, HOUSES, PLAYER_HOUSE, ZONES, STREETS, SHUFFLE_COURT,
} from './layout.js';
import { buildBeach, BEACH } from './beach.js';
import { onBoat } from './casinoboat.js';
import { baseHeight, heightAt, paintGround, SPEED_BUMPS, POOL, WATER_Y, onCourse, onFairway, waterAt } from './terrain.js';
import { mulberry32, distToSegment } from '../core/utils.js';

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl16: new THREE.CylinderGeometry(1, 1, 1, 16),
  sph: new THREE.SphereGeometry(1, 10, 8),
  ico: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  ico2: new THREE.IcosahedronGeometry(1, 2),
  pyr: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  torus: new THREE.TorusGeometry(1, 0.08, 6, 16),
};

// Hip roof with a short ridge. Base rectangle w x d at y=0, ridge at y=h. UVs run along the
// eave (u) and up the slope (v) in 1.2 m tile-texture repeats.
export function hipRoof(w, d, h) {
  const r = Math.max(0, w - d) / 2, hw = w / 2, hd = d / 2;
  const slope = Math.hypot(hd, h) / 1.2;
  const pos = [], uv = [];
  const tri = (a, b, c) => { for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); } };
  // front (+z) and back (-z) trapezoids
  const F = [[-hw, 0, hd, 0, 0], [hw, 0, hd, w / 1.2, 0], [r, h, 0, (hw + r) / 1.2, slope], [-r, h, 0, (hw - r) / 1.2, slope]];
  tri(F[0], F[1], F[2]); tri(F[0], F[2], F[3]);
  const B = [[hw, 0, -hd, 0, 0], [-hw, 0, -hd, w / 1.2, 0], [-r, h, 0, (hw + r) / 1.2, slope], [r, h, 0, (hw - r) / 1.2, slope]];
  tri(B[0], B[1], B[2]); tri(B[0], B[2], B[3]);
  // hip triangles
  tri([hw, 0, hd, 0, 0], [hw, 0, -hd, d / 1.2, 0], [r, h, 0, hd / 1.2, slope]);
  tri([-hw, 0, -hd, 0, 0], [-hw, 0, hd, d / 1.2, 0], [-r, h, 0, hd / 1.2, slope]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const HIP_ROOF = hipRoof(15.8, 13.8, 2.3);
const darker = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
// Matrix that stretches a unit cylinder (height 1, radius 1) between two points.
export function segMatrix(ax, ay, az, bx, by, bz, r) {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const len = d.length();
  _q.setFromUnitVectors(_up, d.normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, new THREE.Vector3(r, len, r));
}

// ---------- reusable vegetation geometry ----------
function frondGeometry(len, width, droop) {
  const S = 5;
  const rings = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const y = len * 0.3 * t - droop * t * t * 1.5;
    const w = (width * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * (1 - 0.35 * t)) / 2;
    const z = t * len;
    rings.push([[-w, y - w * 0.35, z], [0, y + 0.02, z], [w, y - w * 0.35, z]]);
  }
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c, ...a, ...c, ...b); // front + back face
  for (let i = 0; i < S; i++) {
    const [L0, M0, R0] = rings[i], [L1, M1, R1] = rings[i + 1];
    tri(L0, M0, L1); tri(M0, M1, L1); tri(M0, R0, M1); tri(R0, R1, M1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function makePalm(rnd) {
  const parts = [];
  const H = 7 + rnd() * 4;
  const lx = (rnd() - 0.5) * 2.4, lz = (rnd() - 0.5) * 2.4;
  const S = 8;
  let px = 0, py = 0, pz = 0;
  for (let i = 1; i <= S; i++) {
    const t = i / S;
    const nx = lx * t * t, ny = H * t, nz = lz * t * t;
    const r = 0.34 - 0.13 * t;
    parts.push([GEO.cyl6, i % 2 ? '#8b6b4a' : '#7a5c3e', segMatrix(px, py - 0.05, pz, nx, ny + 0.05, nz, r)]);
    px = nx; py = ny; pz = nz;
  }
  const n = 8 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const g = frondGeometry(3.6 + rnd() * 1.4, 1.1, 1.6 + rnd() * 0.6);
    const m = new THREE.Matrix4().makeRotationX(-0.25 + rnd() * 0.4);
    g.applyMatrix4(m);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY((i / n) * Math.PI * 2 + rnd() * 0.3));
    g.translate(px, py, pz);
    const col = ['#3f8f3a', '#4a9a3f', '#3a7f36'][i % 3];
    parts.push([g, col, null, (x, y, z) => Math.hypot(x - px, y - py, z - pz) * 0.22]);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push([GEO.sph, '#6b4a2a', mat4(px + Math.cos(a) * 0.25, py - 0.25, pz + Math.sin(a) * 0.25, 0, 0.2, 0.22, 0.2)]);
  }
  const g = mergeParts(parts);
  g.userData.top = py;
  return g;
}

// Leafy look for low-poly canopies: lumpy noise displacement (radial from the clump's center so
// shared corners move together), recomputed flat normals, and a dark-underside / sunlit-top
// vertex-color gradient with per-vertex jitter.
const leafNoise = (x, y, z) => (Math.sin(x * 1.9 + Math.sin(z * 2.7)) + Math.sin(y * 2.3 + Math.sin(x * 1.6)) + Math.sin(z * 2.1 + Math.sin(y * 1.8))) / 3;
const leafHash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
function foliage(g, { cy = 0, minY = -Infinity, amp = 0.1, freq = 3, dark = 0.55, light = 1.15, bloom = null } = {}) {
  const p = g.attributes.position, c = g.attributes.color;
  const bc = bloom && new THREE.Color(bloom);
  g.computeBoundingBox();
  const y0 = Math.max(g.boundingBox.min.y, minY), y1 = g.boundingBox.max.y;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < minY) continue;
    const dy = y - cy, len = Math.hypot(x, dy, z) || 1;
    const n = leafNoise(x * freq, y * freq, z * freq) * amp;
    x += (x / len) * n; y += (dy / len) * n; z += (z / len) * n;
    p.setXYZ(i, x, y, z);
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0 || 1)));
    const k = (dark + (light - dark) * Math.pow(t, 0.8)) * (0.9 + 0.2 * leafHash(x, y, z));
    // flowering shrubs: blossom clusters on the sunny upper half
    if (bc && t > 0.25 && leafNoise(x * 9 + 3, y * 9, z * 9 - 2) > 0.2) {
      const kb = 0.85 + 0.3 * t;
      c.setXYZ(i, bc.r * kb, bc.g * kb, bc.b * kb);
    } else c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  // weld shared corners so the clumps shade soft and round instead of faceted
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const welded = mergeVertices(g, 1e-4);
  welded.computeVertexNormals();
  const out = welded.toNonIndexed();
  out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

function makePine(rnd) {
  const H = 10 + rnd() * 4;
  const parts = [[GEO.cyl, '#6d5a48', mat4(0, H / 2, 0, 0, 0.28, H, 0.28)]];
  for (let i = 0; i < 4; i++) {
    const r = 1.8 + rnd() * 1.2;
    parts.push([GEO.ico1, i % 2 ? '#2f5d34' : '#3a6b3c', mat4((rnd() - 0.5) * 2, H - 1 + i * 0.9 + rnd() * 0.5, (rnd() - 0.5) * 2, rnd() * 3, r, r * 0.55, r), 0.12]);
  }
  return foliage(mergeParts(parts), { cy: H + 0.4, minY: H - 2.2, amp: 0.35, freq: 1.4, dark: 0.62, light: 1.25 });
}

function makeOak(rnd) {
  const parts = [[GEO.cyl, '#5e4a3a', mat4(0, 1.6, 0, 0, 0.45, 3.2, 0.45)]];
  // a big soft core plus a shell of smaller clumps gives a leafy, bumpy silhouette
  parts.push([GEO.ico2, '#4d7c3c', mat4(0, 4.6, 0, 0, 2.6, 1.5, 2.6), 0.06]);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996 + rnd() * 0.3; // golden-angle spread
    const up = i / 13; // low ring first, then up over the crown
    const d = 2.7 * Math.sqrt(1 - up * up * 0.8) + rnd() * 0.4;
    const r = 0.95 + rnd() * 0.55;
    parts.push([GEO.ico1, i % 3 ? '#4a7a3a' : '#5a8543', mat4(Math.cos(a) * d, 3.7 + up * 2.0 + rnd() * 0.3, Math.sin(a) * d, rnd() * 3, r, r * 0.8, r), 0.06]);
  }
  // the trunk splits into a couple of limbs under the canopy
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rnd();
    parts.push([GEO.cyl6, '#5e4a3a', segMatrix(0, 2.6, 0, Math.cos(a) * 1.5, 4.1, Math.sin(a) * 1.5, 0.16)]);
  }
  const canopy = foliage(mergeParts(parts), { cy: 4.7, minY: 3.3, amp: 0.18, freq: 2.2, dark: 0.45, light: 1.12 });
  // spanish moss: thin drapes hanging in little bunches from the canopy's underside
  const moss = [];
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2, d = 1.6 + rnd() * 1.6;
    for (let j = 0; j < 3; j++) {
      const len = 0.7 + rnd() * 0.8;
      moss.push([GEO.cone, j % 2 ? '#7d876f' : '#8c957c', mat4(Math.cos(a) * d + (rnd() - 0.5) * 0.4, 3.35 - len / 2, Math.sin(a) * d + (rnd() - 0.5) * 0.4, 0, 0.06 + rnd() * 0.04, len, 0.06 + rnd() * 0.04, Math.PI), 0.3]);
    }
  }
  const g = mergeGeometries([canopy, mergeParts(moss)], false);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function makeBush(rnd, color) {
  const parts = [];
  const bloom = new THREE.Color(color).getHSL({}).s > 0.55 && new THREE.Color(color).r > 0.6 ? color : null;
  if (bloom) color = '#3d7436'; // green shrub, pink blossoms
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.34 + rnd() * 0.26;
    const a = (i / n) * Math.PI * 2 + rnd(), d = i === 0 ? 0 : 0.25 + rnd() * 0.35;
    parts.push([GEO.ico1, color, mat4(Math.cos(a) * d, r * 0.85 + (i === 0 ? 0.2 : rnd() * 0.15), Math.sin(a) * d, rnd() * 3, r, r * 0.85, r), (x, y) => Math.max(0, y) * 0.08]);
  }
  return foliage(mergeParts(parts), { cy: 0.45, amp: 0.07, freq: 4.5, dark: 0.5, light: 1.18, bloom });
}

// ---------- local building frame (rotations are multiples of 90deg) ----------
class Frame {
  constructor(world, x, z, ry = 0, y = 0) {
    this.w = world;
    this.x = x; this.z = z; this.ry = ry; this.y = y;
    this.m = mat4(x, y, z, ry);
    this.c = Math.cos(ry); this.s = Math.sin(ry);
  }
  toWorld(lx, lz) {
    return { x: this.x + lx * this.c + lz * this.s, z: this.z - lx * this.s + lz * this.c };
  }
  add(geo, color, lx, ly, lz, sx, sy, sz, lry = 0, mat = M.vc, wind = 0, rx = 0, rz = 0) {
    this.w.batch.add(mat, geo, color, this.m.clone().multiply(mat4(lx, ly, lz, lry, sx, sy, sz, rx, rz)), wind);
  }
  // box with its BOTTOM at ly
  box(lx, ly, lz, sx, sy, sz, color, mat = M.vc, lry = 0) {
    this.add(GEO.box, color, lx, ly + sy / 2, lz, sx, sy, sz, lry, mat);
  }
  prepped(g, lx, ly, lz, lry = 0, s = 1) {
    this.w.batch.addPrepped(M.vc, g, this.m.clone().multiply(mat4(lx, ly, lz, lry, s, s, s)));
  }
  collide(lx0, lz0, lx1, lz1, h = 4, tag = null) {
    const a = this.toWorld(lx0, lz0), b = this.toWorld(lx1, lz1);
    return this.w.col.addBox(a.x, a.z, b.x, b.z, h, tag);
  }
  sign(text, opts, lx, ly, lz, w, h, lry = 0) {
    const p = this.toWorld(lx, lz);
    return this.w.addSign(text, opts, p.x, this.y + ly, p.z, this.ry + lry, w, h);
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.col = new Colliders(16);
    this.batch = new Batcher();
    this.rnd = mulberry32(1987);
    this.propSpawns = [];
    this.cartSpawns = [];
    this.pads = []; // raised paving (driveways, walks, porches): {x0, z0, x1, z1, top}
    this.lamps = [];
    this.fountains = [];
    this.waterMats = [];
    this.pois = {};
    this.benches = [];
    this.palms = [0, 1, 2, 3].map(() => makePalm(this.rnd));
    this.pines = [0, 1, 2].map(() => makePine(this.rnd));
    this.oaks = [0, 1, 2].map(() => makeOak(this.rnd));
    this.bushes = ['#3f7d3a', '#4b8b3f', '#d94f8a', '#e0668f', '#3a6f35'].map((c) => makeBush(this.rnd, c));
    this.roadMat = new THREE.MeshStandardMaterial({ map: makeAsphaltTexture(), roughness: 0.92 });
    this.pathMat = new THREE.MeshStandardMaterial({ map: this.roadMat.map, color: 0xf2eadb, roughness: 0.9 });

    this.buildGround();
    this.buildRoads();
    this.buildWater();
    this.buildHouses();
    this.buildClubhouse();
    this.buildPool();
    this.buildCommercial();
    this.buildMaintenance();
    this.buildParks();
    this.buildCourse();
    this.buildPerimeter();
    this.buildStreetscape();
    buildBeach(this, GEO, heightAt);
    this.meshes = this.batch.build(this.root);
  }

  // ---------- helpers ----------
  palm(x, z, s = 1, collide = true) {
    const g = this.palms[Math.floor(this.rnd() * this.palms.length)];
    this.batch.addPrepped(M.vc, g, mat4(x, heightAt(x, z) - 0.1, z, this.rnd() * 6.28, s, s, s));
    if (collide) this.col.addCircle(x, z, 0.45 * s, 12, 'tree');
    if (collide) (this.palmSpots ||= []).push({ x, z, top: (g.userData.top || 9) * s });
  }
  // Register a flat raised slab (Frame-local center + size) so things can rest on top of it.
  pad(f, lx, lz, sx, sz, top) {
    const a = f.toWorld(lx - sx / 2, lz - sz / 2), b = f.toWorld(lx + sx / 2, lz + sz / 2);
    this.pads.push({ x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z), top });
  }
  padTop(x, z) {
    for (const p of this.pads) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p.top;
    return 0;
  }

  // Tiled hip roof geometry for a w x d footprint (ridge runs along the longer side).
  roofGeo(w, d, h) {
    const rot = d > w;
    const key = `${(rot ? d : w).toFixed(2)}:${(rot ? w : d).toFixed(2)}:${h}`;
    this._roofs ||= new Map();
    if (!this._roofs.has(key)) this._roofs.set(key, hipRoof(rot ? d : w, rot ? w : d, h));
    return { geo: this._roofs.get(key), ry: rot ? Math.PI / 2 : 0 };
  }
  // ...placed on a building Frame with its eaves at local height y
  roof(f, lx, y, lz, w, d, h, color) {
    const r = this.roofGeo(w, d, h);
    f.add(r.geo, color, lx, y, lz, 1, 1, 1, r.ry, M.roof);
  }

  tree(kind, x, z, s = 1) {
    const list = kind === 'pine' ? this.pines : this.oaks;
    const g = list[Math.floor(this.rnd() * list.length)];
    this.batch.addPrepped(M.vc, g, mat4(x, heightAt(x, z) - 0.1, z, this.rnd() * 6.28, s, s, s));
    this.col.addCircle(x, z, (kind === 'pine' ? 0.4 : 0.6) * s, 12, 'tree');
  }
  bush(x, z, s = 1, color = null) {
    const i = color !== null ? color : Math.floor(this.rnd() * this.bushes.length);
    this.batch.addPrepped(M.vc, this.bushes[i], mat4(x, heightAt(x, z), z, this.rnd() * 6.28, s, s, s));
  }
  box(x, y, z, sx, sy, sz, color, ry = 0, mat = M.vc) {
    this.batch.add(mat, GEO.box, color, mat4(x, y + sy / 2, z, ry, sx, sy, sz));
  }
  addSign(text, opts, x, y, z, ry, w, h, glow = false) {
    const tex = makeSignTexture(text, opts);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: opts.emissive ?? 0.12 });
    if (opts.transparent) {
      mat.transparent = true;
      mat.alphaTest = 0.1;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.userData.glow = glow;
    this.root.add(m);
    (this.signs ||= []).push(m);
    return m;
  }
  lamp(x, z, ry = 0) {
    const f = new Frame(this, x, z, ry);
    f.add(GEO.cyl, '#2d3a33', 0, 2.6, 0, 0.1, 5.2, 0.1);
    f.box(0, 5.1, 0.7, 0.12, 0.12, 1.5, '#2d3a33');
    f.box(0, 4.85, 1.35, 0.5, 0.25, 0.5, '#2d3a33');
    f.box(0, 4.75, 1.35, 0.4, 0.12, 0.4, '#fff', M.lamp);
    const p = f.toWorld(0, 1.35);
    this.lamps.push({ x: p.x, y: 4.5, z: p.z });
    this.col.addCircle(x, z, 0.2, 5, 'lamp');
  }
  bench(x, z, ry) {
    const f = new Frame(this, x, z, ry);
    f.box(0, 0.45, 0, 1.8, 0.08, 0.5, '#8a5a3b');
    f.box(0, 0.6, -0.25, 1.8, 0.5, 0.06, '#8a5a3b');
    f.box(-0.8, 0, 0, 0.08, 0.45, 0.45, '#333');
    f.box(0.8, 0, 0, 0.08, 0.45, 0.45, '#333');
    this.benches.push({ x, z, ry });
  }
  poi(id, x, z, label, r = 3.2, extra = {}) {
    this.pois[id] = { id, x, z, label, r, ...extra };
  }

  // ---------- ground ----------
  buildGround() {
    const size = HALF * 2;
    const seg = 300;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, baseHeight(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    const canvas = paintGround(2048, 'ground');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const detail = makeDetailTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 det = texture2D(detailMap, vMapUv * 110.0).rgb;
          vec3 det2 = texture2D(detailMap, vMapUv.yx * 17.0).rgb;
          diffuseColor.rgb *= mix(vec3(1.0), det, 0.85) * mix(vec3(1.0), det2, 0.5) * 1.42;`);
    };
    const ground = new THREE.Mesh(g, mat);
    ground.receiveShadow = true;
    this.root.add(ground);
    this.groundMesh = ground;

    // outside the walls: flat scrubland to the horizon
    const outer = new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 1 });
    const big = 2400;
    for (const [sx, sz, x, z] of [
      // north/south strips stop at the beach; the ocean + sand strip live in beach.js
      [big / 2 + HALF, big / 2, -big / 4 + HALF / 2, -HALF - big / 4],
      [big / 2 + HALF, big / 2, -big / 4 + HALF / 2, HALF + big / 4],
      [big / 2, HALF * 2, -HALF - big / 4, 0],
    ]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2), outer);
      m.position.set(x, -0.02, z);
      m.receiveShadow = true;
      this.root.add(m);
    }
  }

  // ---------- roads ----------
  buildRoads() {
    const quad = (ax, az, bx, bz, w, y, ext = true) => {
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L, nx = -uz * (w / 2), nz = ux * (w / 2);
      const e = ext ? w / 2 : 0;
      const sx = ax - ux * e, sz = az - uz * e, ex = bx + ux * e, ez = bz + uz * e;
      const P = [
        [sx + nx, y, sz + nz], [ex + nx, y, ez + nz], [ex - nx, y, ez - nz],
        [sx + nx, y, sz + nz], [ex - nx, y, ez - nz], [sx - nx, y, sz - nz],
      ];
      const pos = [], uv = [], nor = [];
      for (const p of P) {
        pos.push(...p);
        uv.push(p[0] / 7, p[2] / 7);
        nor.push(0, 1, 0);
      }
      // winding: make sure face points up
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const a = new THREE.Vector3(...P[0]), b = new THREE.Vector3(...P[1]), c = new THREE.Vector3(...P[2]);
      const n = b.sub(a).cross(c.sub(a));
      if (n.y < 0) {
        const arr = g.attributes.position.array;
        const uva = g.attributes.uv.array;
        for (let t = 0; t < 6; t += 3) {
          for (let k = 0; k < 3; k++) [arr[(t + 1) * 3 + k], arr[(t + 2) * 3 + k]] = [arr[(t + 2) * 3 + k], arr[(t + 1) * 3 + k]];
          for (let k = 0; k < 2; k++) [uva[(t + 1) * 2 + k], uva[(t + 2) * 2 + k]] = [uva[(t + 2) * 2 + k], uva[(t + 1) * 2 + k]];
        }
      }
      return g;
    };
    this.roadQuad = quad;
    for (const e of EDGES) {
      const isPath = e.type === 'path';
      this.batch.add(isPath ? this.pathMat : this.roadMat, quad(e.a.x, e.a.z, e.b.x, e.b.z, e.width, isPath ? 0.025 : 0.04), '#ffffff', null);
      if (isPath) continue;
      // dashed center line + curbs
      const dx = e.b.x - e.a.x, dz = e.b.z - e.a.z, L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L, ry = Math.atan2(ux, uz);
      for (let d = 10; d < L - 10; d += 7) {
        this.box(e.a.x + ux * (d + 1.5), 0.041, e.a.z + uz * (d + 1.5), 0.18, 0.01, 3, '#f2c94c', ry);
      }
      for (const side of [-1, 1]) {
        const ox = -uz * (e.width / 2 + 0.1) * side, oz = ux * (e.width / 2 + 0.1) * side;
        const s0 = 7, s1 = L - 7;
        if (s1 > s0) {
          const mx = e.a.x + ux * (s0 + s1) / 2 + ox, mz = e.a.z + uz * (s0 + s1) / 2 + oz;
          this.box(mx, 0, mz, 0.25, 0.13, s1 - s0, '#d8d2c6', ry);
        }
      }
    }
    // speed bumps (yellow humps)
    for (const b of SPEED_BUMPS) {
      // cylinder lying across the road: pre-rotation x becomes height, y becomes length
      const ry = b.axis === 'z' ? 0 : Math.PI / 2;
      this.batch.add(M.vc, GEO.cyl, '#f2c230', mat4(b.x, 0.0, b.z, ry, 0.24, 8.6, 0.8, 0, Math.PI / 2));
      for (let k = -3; k <= 3; k += 2) {
        const off = b.axis === 'z' ? [k, 0] : [0, k];
        this.batch.add(M.vc, GEO.box, '#1a1a1a', mat4(b.x + off[0], 0.2, b.z + off[1], ry, 0.5, 0.06, 0.9));
      }
    }
    // parking lots
    for (const lot of [B.parking, B.strip]) {
      this.batch.add(this.roadMat, quad(lot.x - lot.sx / 2, lot.z, lot.x + lot.sx / 2, lot.z, lot.sz, 0.035, false), '#ffffff', null);
    }
    for (let i = 0; i < 9; i++) this.box(-34 + i * 3.2, 0.036, 32, 0.14, 0.01, 5, '#f4f4f4');
    for (let i = 0; i < 9; i++) this.box(-34 + i * 3.2, 0.036, 22, 0.14, 0.01, 5, '#f4f4f4');
    // clubhouse plaza
    this.batch.add(this.pathMat, quad(-4, 15, 36, 15, 10, 0.03, false), '#ffffff', null);
    this.batch.add(this.pathMat, quad(15, 20, 15, 54, 5, 0.03, false), '#ffffff', null);
  }

  // ---------- water ----------
  buildWater() {
    const pondMat = makeWaterMaterial({ deep: '#1f5a5e', shallow: '#4c9e8f' });
    this.waterMats.push(pondMat);
    for (const p of PONDS) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(p.r * 1.12, 48).rotateX(-Math.PI / 2), pondMat);
      m.position.set(p.x, WATER_Y, p.z);
      m.renderOrder = 2;
      this.root.add(m);
      // reeds around the rim
      for (let i = 0; i < 26; i++) {
        const a = this.rnd() * Math.PI * 2;
        const d = p.r * (0.92 + this.rnd() * 0.12);
        const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        for (let k = 0; k < 4; k++) {
          const h = 1 + this.rnd() * 0.8;
          this.batch.add(M.vc, GEO.cyl6, k % 2 ? '#5f8a3a' : '#7a9a45', mat4(x + (this.rnd() - 0.5), WATER_Y + h / 2, z + (this.rnd() - 0.5), 0, 0.04, h, 0.04), (xx, y) => (y + 0.5) * 0.25);
        }
        if (k4(this.rnd)) this.batch.add(M.vc, GEO.cyl6, '#6b4a2a', mat4(x, WATER_Y + 1.6, z, 0, 0.07, 0.35, 0.07), 0.2);
      }
      if (p.fountain) {
        this.fountains.push({ x: p.x, z: p.z, y: WATER_Y });
        this.batch.add(M.vc, GEO.cyl, '#dfe9ea', mat4(p.x, WATER_Y + 0.1, p.z, 0, 0.5, 0.4, 0.5));
      }
      if (p.name === 'Gator Pond') {
        this.addSign('BEWARE OF GATORS', { bg: '#f2c230', fg: '#111', border: '#111', sub: 'Do not feed Mr. Chompers', font: 'bold 54px sans-serif' }, p.x + p.r + 3, 1.6, p.z, Math.PI / 2, 2.4, 0.6);
        this.box(p.x + p.r + 3, 0, p.z, 0.08, 1.3, 0.08, '#555');
      }
    }
    // ducks
    this.ducks = [];
    const duckGeo = mergeParts([
      [GEO.sph, '#8a6a4a', mat4(0, 0.12, 0, 0, 0.16, 0.11, 0.26)],
      [GEO.sph, '#e8e2d0', mat4(0, 0.16, -0.08, 0, 0.12, 0.08, 0.16)],
      [GEO.sph, '#1f7a3a', mat4(0, 0.3, 0.17, 0, 0.08, 0.08, 0.08)],
      [GEO.box, '#f2a33a', mat4(0, 0.28, 0.27, 0, 0.05, 0.02, 0.08)],
      [GEO.box, '#ffffff', mat4(0, 0.24, 0.17, 0, 0.1, 0.015, 0.03)],
    ]);
    for (const p of PONDS) {
      if (p.name === 'Gator Pond') continue;
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(duckGeo, M.vc);
        m.castShadow = true;
        this.root.add(m);
        this.ducks.push({ m, cx: p.x, cz: p.z, r: p.r * (0.3 + this.rnd() * 0.5), ph: this.rnd() * 6.28, w: (0.08 + this.rnd() * 0.08) * (this.rnd() < 0.5 ? -1 : 1) });
      }
    }
    // Mr. Chompers, resident alligator of Gator Pond
    const gp = PONDS.find((p) => p.name === 'Gator Pond');
    const gatorParts = [
      [GEO.box, '#3f5a2e', mat4(0, 0, 0, 0, 0.9, 0.35, 2.2)],
      [GEO.box, '#3f5a2e', mat4(0, 0.02, 1.45, 0, 0.6, 0.25, 0.9)],
      [GEO.box, '#34502a', mat4(0, -0.05, -1.7, 0, 0.45, 0.22, 1.4)],
      [GEO.box, '#2c4523', mat4(0, -0.05, -2.7, 0, 0.25, 0.16, 0.8)],
      [GEO.sph, '#d8d060', mat4(0.2, 0.2, 1.3, 0, 0.09, 0.07, 0.09)],
      [GEO.sph, '#d8d060', mat4(-0.2, 0.2, 1.3, 0, 0.09, 0.07, 0.09)],
      [GEO.box, '#f4f0e0', mat4(0, -0.06, 1.7, 0, 0.5, 0.04, 0.6)],
    ];
    for (let i = 0; i < 6; i++) gatorParts.push([GEO.cone, '#2c4523', mat4(0, 0.2, 0.9 - i * 0.45, 0, 0.08, 0.16, 0.08)]);
    const gator = new THREE.Mesh(mergeParts(gatorParts), M.vc);
    gator.castShadow = true;
    this.root.add(gator);
    this.gator = { m: gator, x: gp.x, z: gp.z, pond: gp, heading: 0, t: 0, biteCd: 0, mode: 'lurk' };
    // pool
    const poolMat = makeWaterMaterial({ deep: '#1c8fc4', shallow: '#56d6f0', pool: true });
    this.waterMats.push(poolMat);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(POOL.x1 - POOL.x0, POOL.z1 - POOL.z0).rotateX(-Math.PI / 2), poolMat);
    pm.position.set((POOL.x0 + POOL.x1) / 2, POOL.y, (POOL.z0 + POOL.z1) / 2);
    pm.renderOrder = 2;
    this.root.add(pm);
  }

  // ---------- houses ----------
  buildHouses() {
    const rnd = this.rnd;
    const roofs = ['#c65a3e', '#b9503a', '#d77a52', '#f1ece2', '#8aa0ae', '#c65a3e'];
    const doors = ['#1f6f78', '#b8323a', '#23408e', '#f2b134', '#2e7d4f', '#ffffff'];
    for (const h of HOUSES) {
      const f = new Frame(this, h.x, h.z, h.facing);
      const W = 14, D = 12, WH = 3.2;
      const roof = roofs[Math.floor(rnd() * roofs.length)];
      const door = doors[Math.floor(rnd() * doors.length)];
      const trim = '#fbfaf5';
      const garageLeft = rnd() < 0.5;
      const gx = garageLeft ? -3.6 : 3.6, dx = garageLeft ? 3.2 : -3.2;
      f.box(0, 0, 0, W + 0.6, 0.3, D + 0.6, '#d9d2c5');
      f.box(0, 0.3, 0, W, WH, D, h.color);
      f.box(0, 0.3 + WH, 0, W + 0.3, 0.25, D + 0.3, trim);
      // roof: tiled hip roof with a fascia board around the overhang
      const RY = 0.55 + WH, RW = W + 1.8, RD = D + 1.8;
      f.add(HIP_ROOF, roof, 0, RY, 0, 1, 1, 1, 0, M.roof);
      f.box(0, RY - 0.22, RD / 2 - 0.04, RW + 0.08, 0.24, 0.08, trim);
      f.box(0, RY - 0.22, -RD / 2 + 0.04, RW + 0.08, 0.24, 0.08, trim);
      f.box(RW / 2 - 0.04, RY - 0.22, 0, 0.08, 0.24, RD, trim);
      f.box(-RW / 2 + 0.04, RY - 0.22, 0, 0.08, 0.24, RD, trim);
      f.box(0, RY - 0.08, 0, RW, 0.06, RD, darker(h.color, 0.8)); // soffit
      // ridge + hip caps
      const ridgeR = (RW - RD) / 2;
      f.add(GEO.cyl6, roof, 0, RY + 2.3 + 0.03, 0, 0.1, ridgeR * 2 + 0.2, 0.1, 0, M.vc, 0, 0, Math.PI / 2);
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const a = [sx * ridgeR, RY + 2.3, 0], b = [sx * RW / 2, RY, sz * RD / 2];
        const m = segMatrix(a[0], a[1] + 0.03, a[2], b[0], b[1] + 0.05, b[2], 0.08);
        this.batch.add(M.vc, GEO.cyl6, darker(roof, 0.9), f.m.clone().multiply(m));
      }
      // roof clutter: plumbing vent, maybe a dish or a solar water heater
      f.add(GEO.cyl, '#9a9a9a', 2.2, RY + 1.2, -3.2, 0.06, 1.0, 0.06);
      if (rnd() < 0.3) {
        f.add(GEO.cyl, '#d8d8d8', -3, RY + 1.35, -3.6, 0.03, 0.6, 0.03);
        f.add(GEO.sph, '#eeeeee', -3, RY + 1.7, -3.55, 0.32, 0.32, 0.1, 0.5, M.vc, 0, -0.5);
      } else if (rnd() < 0.25) {
        const tilt = Math.atan2(2.3, RD / 2);
        f.add(GEO.box, '#1d2d4a', -1.5, RY + 1.3, -3.3, 2.6, 0.08, 1.6, 0, M.vcShiny, 0, -tilt);
        f.add(GEO.box, '#c9ccd1', -1.5, RY + 1.26, -3.3, 2.7, 0.06, 1.7, 0, M.vc, 0, -tilt);
      }
      // trimmed windows: frame, sill and muntins (wall key: front/back/right/left)
      const WALL = { front: [0, D / 2, 0], back: [0, -D / 2, Math.PI], right: [W / 2, 0, Math.PI / 2], left: [-W / 2, 0, -Math.PI / 2] };
      const wpart = (key, a, y, out, sx, sy, sz, color, mat = M.vc) => {
        const [cx, cz, ry] = WALL[key];
        const c = Math.cos(ry), s = Math.sin(ry);
        f.add(GEO.box, color, cx + a * c + out * s, y, cz - a * s + out * c, sx, sy, sz, ry, mat);
      };
      const win = (key, a, y, w, hh, shutters = null) => {
        wpart(key, a, y, 0.03, w, hh, 0.1, '#fff', M.glass);
        wpart(key, a, y + hh / 2 + 0.07, 0.07, w + 0.28, 0.14, 0.1, trim);
        wpart(key, a, y - hh / 2 - 0.07, 0.07, w + 0.28, 0.14, 0.1, trim);
        wpart(key, a - w / 2 - 0.07, y, 0.07, 0.14, hh, 0.1, trim);
        wpart(key, a + w / 2 + 0.07, y, 0.07, 0.14, hh, 0.1, trim);
        wpart(key, a, y - hh / 2 - 0.17, 0.12, w + 0.45, 0.08, 0.22, trim); // sill
        wpart(key, a, y, 0.08, 0.05, hh, 0.04, trim); // muntins
        wpart(key, a, y, 0.08, w, 0.05, 0.04, trim);
        if (shutters) for (const sd of [-1, 1]) {
          wpart(key, a + sd * (w / 2 + 0.38), y, 0.06, 0.42, hh + 0.2, 0.06, shutters);
          for (let k = -2; k <= 2; k++) wpart(key, a + sd * (w / 2 + 0.38), y + k * (hh / 6), 0.1, 0.36, 0.03, 0.03, darker(shutters, 0.8)); // louvers
        }
      };
      const wx = garageLeft ? 5.6 : -5.6;
      win('front', wx, 1.75, 1.6, 1.4, door); // narrow enough that shutters clear the coach light and the corner
      for (const sz of [-3, 2.5]) { win('right', -sz, 1.8, 1.8, 1.3); win('left', sz, 1.8, 1.8, 1.3); }
      win('back', 3, 1.8, 3.5, 1.6);
      // garage door: raised panels, some with a row of windows up top
      const gWin = rnd() < 0.4;
      f.box(gx, 0.3, D / 2 + 0.02, 5, 2.5, 0.12, '#e6e2d8');
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
        const px = gx - 1.8 + k * 1.2, py = 0.62 + r * 0.6;
        if (gWin && r === 3) f.box(px, py - 0.18, D / 2 + 0.09, 0.95, 0.34, 0.04, '#fff', M.glass);
        else f.box(px, py - 0.2, D / 2 + 0.09, 1.02, 0.42, 0.06, '#f8f6f0');
      }
      f.box(gx, 2.8, D / 2 + 0.06, 5.4, 0.18, 0.12, trim);
      f.box(gx - 2.62, 0.3, D / 2 + 0.06, 0.18, 2.5, 0.12, trim);
      f.box(gx + 2.62, 0.3, D / 2 + 0.06, 0.18, 2.5, 0.12, trim);
      // front door: trim, two raised panels, brass knob, coach lights (glow at night)
      f.box(dx, 0.3, D / 2 + 0.02, 1.15, 2.3, 0.12, door);
      f.box(dx, 2.6, D / 2 + 0.07, 1.5, 0.16, 0.12, trim);
      f.box(dx - 0.66, 0.3, D / 2 + 0.07, 0.16, 2.3, 0.12, trim);
      f.box(dx + 0.66, 0.3, D / 2 + 0.07, 0.16, 2.3, 0.12, trim);
      f.box(dx, 1.55, D / 2 + 0.1, 0.8, 0.8, 0.04, darker(door, 1.12));
      f.box(dx, 0.55, D / 2 + 0.1, 0.8, 0.8, 0.04, darker(door, 1.12));
      f.add(GEO.sph, '#d4af37', dx + 0.42, 1.4, D / 2 + 0.14, 0.05, 0.05, 0.05);
      for (const sd of [-1, 1]) {
        f.box(dx + sd * 0.86, 1.8, D / 2 + 0.1, 0.2, 0.36, 0.2, '#fff', M.lamp);
        f.box(dx + sd * 0.86, 2.18, D / 2 + 0.1, 0.26, 0.06, 0.26, '#2a2a2a');
      }
      // little porch
      f.box(dx, 0, D / 2 + 1, 2.8, 0.22, 2, '#e7e1d5');
      this.pad(f, dx, D / 2 + 1, 2.8, 2, 0.22);
      f.add(GEO.cyl, trim, dx - 1.25, 1.75, D / 2 + 1.8, 0.1, 3.1, 0.1);
      f.add(GEO.cyl, trim, dx + 1.25, 1.75, D / 2 + 1.8, 0.1, 3.1, 0.1);
      f.box(dx, 3.2, D / 2 + 1.05, 3, 0.2, 1.9, trim);
      // AC unit with a fan grille
      f.box(W / 2 + 0.7, 0, -2.5, 1, 0.9, 1, '#b8bcbf');
      f.add(GEO.cyl, '#3a3d40', W / 2 + 0.7, 0.92, -2.5, 0.38, 0.03, 0.38);
      // screened lanai in back: aluminum frame + screen mesh
      const LD = 4.5;
      for (const [px, pz] of [[-6, -D / 2 - LD], [6, -D / 2 - LD], [0, -D / 2 - LD], [-6, -D / 2 - LD / 2], [6, -D / 2 - LD / 2], [-3, -D / 2 - LD], [3, -D / 2 - LD]]) {
        f.box(px, 0.2, pz, 0.12, 2.6, 0.12, '#4a3f35');
      }
      f.box(0, 2.8, -D / 2 - LD / 2, 12.2, 0.12, LD + 0.1, '#4a3f35');
      f.box(0, 1.1, -D / 2 - LD, 12, 0.08, 0.08, '#4a3f35'); // kick rail
      f.box(0, 0, -D / 2 - LD / 2, 12, 0.2, LD, '#d9d2c5');
      f.box(0, 0.2, -D / 2 - LD, 12, 2.6, 0.02, '#fff', M.screen);
      f.box(-6, 0.2, -D / 2 - LD / 2, 0.02, 2.6, LD, '#fff', M.screen);
      f.box(6, 0.2, -D / 2 - LD / 2, 0.02, 2.6, LD, '#fff', M.screen);
      if (rnd() < 0.35) f.box(0, 0.2, -D / 2 - LD / 2, 6, 0.04, 2.5, '#49c6e5');
      f.collide(-W / 2 - 1.2, -D / 2 - LD, W / 2 + 1.2, D / 2 + 0.3, 6, 'house');
      // driveway + walk to street
      const streetDist = 21 - 4.5;
      const dLen = streetDist - D / 2;
      f.box(gx, 0, D / 2 + dLen / 2, 5.2, 0.05, dLen, '#d4cfc4');
      f.box(dx, 0, D / 2 + 2 + (dLen - 2) / 2, 1.3, 0.045, dLen - 2, '#d4cfc4');
      this.pad(f, gx, D / 2 + dLen / 2, 5.2, dLen, 0.05);
      this.pad(f, dx, D / 2 + 2 + (dLen - 2) / 2, 1.3, dLen - 2, 0.045);
      // landscaping
      for (let i = 0; i < 4; i++) {
        const bx = (garageLeft ? 1.2 : -6.6) + i * 1.8;
        if (Math.abs(bx - dx) < 1.6) continue;
        const p = f.toWorld(bx, D / 2 + 0.9);
        this.bush(p.x, p.z, 0.8 + rnd() * 0.3);
      }
      const pp = f.toWorld(garageLeft ? 5.5 : -5.5, D / 2 + 7);
      this.palm(pp.x, pp.z, 0.9 + rnd() * 0.25);
      if (rnd() < 0.4) {
        const p2 = f.toWorld(garageLeft ? -8.5 : 8.5, D / 2 + 3);
        this.palm(p2.x, p2.z, 0.8 + rnd() * 0.2);
      }
      // house number sign on the mailbox + props
      const mb = f.toWorld(gx + (garageLeft ? 3.2 : -3.2), streetDist - 0.8);
      this.propSpawns.push({ type: 'mailbox', x: mb.x, z: mb.z, ry: h.facing, house: h.id });
      const nFl = h.owner === 'player' ? 2 : Math.floor(rnd() * 3.2);
      for (let i = 0; i < nFl; i++) {
        const p = f.toWorld((garageLeft ? 2 : -7) + rnd() * 5, D / 2 + 3.5 + rnd() * 5);
        this.propSpawns.push({ type: 'flamingo', x: p.x, z: p.z, ry: rnd() * 6.28, house: h.id });
      }
      if (rnd() < 0.45) {
        const p = f.toWorld((garageLeft ? 1 : -5) + rnd() * 4, D / 2 + 1.8);
        this.propSpawns.push({ type: 'gnome', x: p.x, z: p.z, ry: h.facing + (rnd() - 0.5), house: h.id });
      }
      if (rnd() < 0.3) {
        const p = f.toWorld(garageLeft ? 7.8 : -7.8, -1);
        this.propSpawns.push({ type: 'trashcan', x: p.x, z: p.z, ry: rnd() * 6.28, house: h.id });
      }
      // parked cart in driveway (every house has a chance; player's always)
      const cp = f.toWorld(gx, D / 2 + 4.5);
      if (h.owner === 'player') {
        this.playerCartSpawn = { x: cp.x, z: cp.z, ry: h.facing }; // backed in: W drives you to the street
      } else if (rnd() < 0.3) {
        this.cartSpawns.push({ x: cp.x, z: cp.z, ry: h.facing + (Math.round(cp.x * 0.37 + cp.z * 0.73) & 1 ? Math.PI : 0), owner: 'resident', house: h.id });
      }
      h.doorPos = f.toWorld(dx, D / 2 + 1.6);
      h.frontPos = f.toWorld(dx, D / 2 + 4);
      h.lawn = f.toWorld(0, D / 2 + 6);
    }
    const ph = PLAYER_HOUSE;
    this.poi('home', ph.doorPos.x, ph.doorPos.z, 'Your House', 2.6);
    const sp = new Frame(this, ph.x, ph.z, ph.facing).toWorld(0, 13.6);
    this.addSign('LEE\'S PLACE', { bg: '#1f6f78', fg: '#fff', border: '#f2c94c', font: 'bold 60px Georgia, serif', w: 512, h: 128 }, sp.x, 1.2, sp.z, ph.facing, 1.6, 0.4);
    this.homeSign = this.signs[this.signs.length - 1];
    this.box(sp.x, 0, sp.z, 0.08, 1.0, 0.08, '#4a3f35');
  }

  // ---------- clubhouse ----------
  buildClubhouse() {
    const c = B.clubhouse;
    const f = new Frame(this, c.x, c.z, 0);
    const W = c.sx, D = c.sz;
    f.box(0, 0, 0, W + 1, 0.4, D + 1, '#d8cfbf');
    f.box(0, 0.4, 0, W, 5.4, D, '#f4ead5');
    f.box(0, 5.8, 0, W + 0.4, 0.35, D + 0.4, '#ffffff');
    this.roof(f, 0, 6.15, 0, W + 3, D + 3, 4.6, '#c65a3e');
    // portico
    for (let i = 0; i < 6; i++) f.add(GEO.cyl, '#ffffff', -7.5 + i * 3, 2.9, D / 2 + 3.6, 0.35, 5, 0.35);
    f.box(0, 5.2, D / 2 + 2, 19, 0.6, 4.4, '#ffffff');
    this.roof(f, 0, 5.8, D / 2 + 2, 20, 5.2, 2.4, '#c65a3e');
    f.box(0, 0.4, D / 2 + 0.03, 6, 3.4, 0.15, '#fff', M.glass);
    for (const x of [-15, -11, 11, 15]) f.box(x, 1.4, D / 2 + 0.03, 2.4, 2.4, 0.12, '#fff', M.glass);
    for (const z of [-6, 0, 6]) {
      f.box(W / 2 + 0.03, 1.4, z, 0.12, 2.4, 3, '#fff', M.glass);
      f.box(-W / 2 - 0.03, 1.4, z, 0.12, 2.4, 3, '#fff', M.glass);
    }
    for (const x of [-12, -4, 4, 12]) f.box(x, 1.4, -D / 2 - 0.03, 3, 2.4, 0.12, '#fff', M.glass);
    // teal awnings over side windows
    for (const x of [-15, -11, 11, 15]) f.add(GEO.box, '#1f8a8a', x, 4.1, D / 2 + 0.7, 2.8, 0.12, 1.4, 0, M.vc, 0, 0.45);
    f.sign('SUNSET PALMS', { bg: '#ffffff', fg: '#c65a3e', font: 'italic bold 78px Georgia, serif', sub: 'CLUBHOUSE  •  EST. 1987', subFont: 'bold 30px Georgia, serif', w: 1024, h: 200 }, 0, 5.2, D / 2 + 4.22, 11, 2.2);
    f.collide(-W / 2, -D / 2, W / 2, D / 2, 8, 'building');
    for (let i = 0; i < 6; i++) {
      const p = f.toWorld(-7.5 + i * 3, D / 2 + 3.6);
      this.col.addCircle(p.x, p.z, 0.4, 6, 'column');
    }
    f.collide(-9.5, D / 2, 9.5, D / 2 + 4.4, 5.4, 'roof');
    // planters + flag
    for (const x of [-12, 12]) {
      const p = f.toWorld(x, D / 2 + 6);
      this.box(p.x, 0, p.z, 3, 0.6, 3, '#e6ddcc');
      this.palm(p.x, p.z, 1.1);
    }
    const fp = f.toWorld(W / 2 - 2, D / 2 + 8);
    this.box(fp.x, 0, fp.z, 0.14, 11, 0.14, '#ddd');
    this.batch.add(M.vc, GEO.box, '#1f8a8a', mat4(fp.x + 1.3, 9.8, fp.z, 0, 2.5, 1.5, 0.04), (x) => Math.max(0, x + 0.5) * 0.35);
    this.col.addCircle(fp.x, fp.z, 0.2, 10);
    for (let i = 0; i < 4; i++) this.bench(-2 + i * 7 + (i > 1 ? 6 : 0), 19, Math.PI);
    this.poi('clubhouse', c.door[0], c.door[1], 'Clubhouse', 3.5);

    // pro shop + cart barn
    const ps = B.proshop;
    const g = new Frame(this, ps.x, ps.z, Math.PI);
    g.box(0, 0, 0, ps.sx + 0.6, 0.3, ps.sz + 0.6, '#d8cfbf');
    g.box(0, 0.3, 0, ps.sx, 3.8, ps.sz, '#f4ead5');
    this.roof(g, 0, 4.1, 0, ps.sx + 2, ps.sz + 2, 2.6, '#3f7f5a');
    g.box(0, 0.3, ps.sz / 2 + 0.03, 3, 2.6, 0.12, '#fff', M.glass);
    g.box(-4.5, 1.2, ps.sz / 2 + 0.03, 3, 1.8, 0.12, '#fff', M.glass);
    g.box(4.5, 1.2, ps.sz / 2 + 0.03, 3, 1.8, 0.12, '#fff', M.glass);
    g.add(GEO.box, '#2f6b4a', 0, 3.3, ps.sz / 2 + 0.9, 8, 0.12, 1.9, 0, M.vc, 0, 0.35);
    g.sign('PRO SHOP', { bg: '#2f6b4a', fg: '#fff', font: 'bold 70px Georgia, serif', sub: 'WE BUY USED BALLS', subFont: 'bold 28px sans-serif', border: '#f2c94c' }, 0, 4.25, ps.sz / 2 + 0.12, 5, 1.25);
    g.collide(-ps.sx / 2, -ps.sz / 2, ps.sx / 2, ps.sz / 2, 6, 'building');
    this.poi('proshop', ps.door[0], ps.door[1], 'Pro Shop (Gus)', 3.2);
    // cart barn
    const bx = 8, bz = -30;
    for (const [px, pz] of [[-7, -4], [7, -4], [-7, 4], [7, 4], [0, -4], [0, 4]]) {
      this.box(bx + px, 0, bz + pz, 0.25, 3.2, 0.25, '#6d5a48');
      this.col.addCircle(bx + px, bz + pz, 0.2, 3);
    }
    this.box(bx, 3.2, bz, 15, 0.25, 9, '#2f6b4a');
    this.col.addBoxC(bx, bz, 15, 9, 3.6, 'roof');
    for (let i = 0; i < 4; i++) this.cartSpawns.push({ x: bx - 5.2 + i * 3.4, z: bz, ry: 0, owner: 'club', color: '#ffffff' });
    // parking lot carts
    for (let i = 0; i < 5; i++) if (this.rnd() < 0.7) this.cartSpawns.push({ x: -32.4 + i * 6.4, z: 30.5, ry: 0, owner: 'resident' });
  }

  buildPool() {
    const d = B.pooldeck;
    // deck (raised slab ring around pool, leaving pool open)
    const col = '#ece4d4';
    const px0 = POOL.x0, px1 = POOL.x1, pz0 = POOL.z0, pz1 = POOL.z1;
    const dx0 = d.x - d.sx / 2, dx1 = d.x + d.sx / 2, dz0 = d.z - d.sz / 2, dz1 = d.z + d.sz / 2;
    const slab = (x0, z0, x1, z1) => this.box((x0 + x1) / 2, -0.2, (z0 + z1) / 2, x1 - x0, 0.28, z1 - z0, col);
    slab(dx0, dz0, dx1, pz0);
    slab(dx0, pz1, dx1, dz1);
    slab(dx0, pz0, px0, pz1);
    slab(px1, pz0, dx1, pz1);
    // coping
    this.box((px0 + px1) / 2, 0.02, pz0 - 0.2, px1 - px0 + 0.8, 0.1, 0.4, '#ffffff');
    this.box((px0 + px1) / 2, 0.02, pz1 + 0.2, px1 - px0 + 0.8, 0.1, 0.4, '#ffffff');
    this.box(px0 - 0.2, 0.02, (pz0 + pz1) / 2, 0.4, 0.1, pz1 - pz0, '#ffffff');
    this.box(px1 + 0.2, 0.02, (pz0 + pz1) / 2, 0.4, 0.1, pz1 - pz0, '#ffffff');
    // pool walls/floor tiles
    this.box((px0 + px1) / 2, -1.62, (pz0 + pz1) / 2, px1 - px0, 0.05, pz1 - pz0, '#7fd3ea');
    this.box((px0 + px1) / 2, -1.6, pz0 + 0.02, px1 - px0, 1.6, 0.04, '#5fc4e0');
    this.box((px0 + px1) / 2, -1.6, pz1 - 0.02, px1 - px0, 1.6, 0.04, '#5fc4e0');
    this.box(px0 + 0.02, -1.6, (pz0 + pz1) / 2, 0.04, 1.6, pz1 - pz0, '#5fc4e0');
    this.box(px1 - 0.02, -1.6, (pz0 + pz1) / 2, 0.04, 1.6, pz1 - pz0, '#5fc4e0');
    // ladder
    for (const s of [-0.35, 0.35]) this.batch.add(M.chrome, GEO.torus, '#fff', mat4(px1 - 0.4, 0.3, pz0 + 3 + s, Math.PI / 2, 0.4, 0.8, 0.4));
    // loungers + umbrellas
    const umb = (x, z, c1, c2) => {
      this.box(x, 0, z, 0.08, 2.4, 0.08, '#eee');
      const g = new THREE.ConeGeometry(1.8, 0.7, 8, 1, true).toNonIndexed();
      const colors = [];
      const p = g.attributes.position;
      const ca = new THREE.Color(c1), cb = new THREE.Color(c2);
      for (let i = 0; i < p.count; i += 3) {
        const mx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, mz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
        const seg = Math.floor(((Math.atan2(mz, mx) + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 2;
        const cc = seg ? ca : cb;
        for (let k = 0; k < 3; k++) colors.push(cc.r, cc.g, cc.b);
      }
      const merged = mergeParts([[g, '#fff', mat4(x, 2.6, z)]]);
      merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      this.batch.addPrepped(M.vc, merged, null);
      // underside so it's visible from below
      this.batch.add(M.vc, new THREE.ConeGeometry(1.8, 0.7, 8, 1, true), '#f4f0e8', mat4(x, 2.58, z, 0, 1, -1, 1));
    };
    const lounger = (x, z, ry) => {
      const f = new Frame(this, x, z, ry, 0.08);
      f.box(0, 0.3, 0, 0.8, 0.1, 1.8, '#ffffff');
      f.add(GEO.box, '#ffffff', 0, 0.6, -0.9, 0.8, 0.1, 0.8, 0, M.vc, 0, -0.9);
      f.box(0, 0.4, 0.3, 0.72, 0.04, 1.2, '#1f8a8a');
    };
    for (let i = 0; i < 6; i++) {
      lounger(px0 + 2 + i * 3.8, pz0 - 3.5, 0);
      lounger(px0 + 2 + i * 3.8, pz1 + 3.5, Math.PI);
    }
    for (let i = 0; i < 3; i++) {
      umb(px0 + 3.9 + i * 7.6, pz0 - 5.8, '#e84a5f', '#ffffff');
      umb(px0 + 3.9 + i * 7.6, pz1 + 5.8, '#1f8a8a', '#ffffff');
    }
    for (const x of [dx0 + 1, dx1 - 1]) for (let z = dz0 + 2; z < dz1; z += 5) this.palm(x, z, 0.9);
    this.poi('pool', 64, -12, 'Pool', 4);

    // tiki bar
    const t = B.tiki;
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) this.batch.add(M.vc, GEO.cyl, '#8a6a3a', mat4(t.x + x, 1.6, t.z + z, 0, 0.18, 3.2, 0.18));
    this.batch.add(M.vc, GEO.cone8, '#c9a45a', mat4(t.x, 4.1, t.z, 0.2, 5.2, 2.2, 5.2), (x, y) => Math.max(0, -y) * 0.05);
    this.box(t.x, 0, t.z + 2, 5, 1.1, 0.8, '#b0864a');
    this.box(t.x, 0, t.z - 2, 5, 1.1, 0.8, '#b0864a');
    this.box(t.x - 2.1, 0, t.z, 0.8, 1.1, 3.4, '#b0864a');
    this.box(t.x + 2.1, 0, t.z, 0.8, 1.1, 3.4, '#b0864a');
    this.col.addBoxC(t.x, t.z, 5, 5, 2);
    this.col.addBoxC(t.x, t.z, 10, 10, 3.4, 'roof');
    for (let i = 0; i < 4; i++) {
      this.batch.add(M.vc, GEO.cyl, '#6d5a48', mat4(t.x - 1.8 + i * 1.2, 0.4, t.z + 3.1, 0, 0.25, 0.08, 0.25));
      this.batch.add(M.vc, GEO.cyl, '#333', mat4(t.x - 1.8 + i * 1.2, 0.2, t.z + 3.1, 0, 0.05, 0.4, 0.05));
    }
    this.addSign('TIKI HUT', { bg: '#3a2a1a', fg: '#ffd166', font: 'bold 72px "Comic Sans MS", cursive', sub: 'HAPPY HOUR: ALL OF THEM', subFont: 'bold 26px sans-serif', emissive: 0.4 }, t.x, 3.4, t.z + 3.25, 0, 3.2, 0.8);
    this.poi('tiki', t.door[0], t.door[1], 'Tiki Hut Bar', 2.8);
  }

  // ---------- shops ----------
  storefront(key, { wall, roof, sign, flat = true, ry = 0 }) {
    const b = B[key];
    const f = new Frame(this, b.x, b.z, ry);
    const W = ry ? b.sz : b.sx, D = ry ? b.sx : b.sz;
    f.box(0, 0, 0, W + 0.6, 0.3, D + 0.6, '#cfc7b8');
    f.box(0, 0.3, 0, W, 5, D, wall);
    if (flat) {
      f.box(0, 5.3, 0, W + 0.3, 0.9, D + 0.3, roof);
    } else {
      this.roof(f, 0, 5.3, 0, W + 2, D + 2, 3, roof);
    }
    f.box(0, 0.3, D / 2 + 0.03, 3.2, 3, 0.12, '#fff', M.glass);
    f.box(-W / 4 - 1, 1, D / 2 + 0.03, W / 2 - 5, 2.2, 0.12, '#fff', M.glass);
    f.box(W / 4 + 1, 1, D / 2 + 0.03, W / 2 - 5, 2.2, 0.12, '#fff', M.glass);
    f.add(GEO.box, roof, 0, 3.8, D / 2 + 1.2, W - 2, 0.15, 2.4, 0, M.vc, 0, 0.3);
    f.collide(-W / 2, -D / 2, W / 2, D / 2, 7, 'building');
    if (sign) f.sign(sign.text, sign.opts, 0, 6.6, D / 2 + 0.35, sign.w, sign.h);
    return f;
  }

  buildCommercial() {
    const lq = this.storefront('liquor', {
      wall: '#9c3d2e', roof: '#5a2019',
      sign: { text: 'LIQUOR BARREL', opts: { bg: '#2b0f0b', fg: '#ffd23f', font: 'bold 84px Impact, sans-serif', sub: 'COLD BEER • BOX WINE • LOTTO', subFont: 'bold 30px sans-serif', border: '#ffd23f', emissive: 0.35, w: 1024, h: 220 }, w: 14, h: 3 },
    });
    lq.sign('LIQUOR', { bg: null, transparent: true, fg: '#ff4fa3', glow: '#ff4fa3', font: 'bold 110px "Brush Script MT", cursive', emissive: 1.4 }, 7.5, 2.6, 9.1, 4, 1);
    this.poi('liquor', B.liquor.door[0], B.liquor.door[1], 'Liquor Barrel', 3.2);
    const bf = this.storefront('buffet', {
      wall: '#f08a7e', roof: '#1f8a8a', flat: false,
      sign: { text: 'GOLDEN CORAL', opts: { bg: '#f2c94c', fg: '#b8323a', font: 'bold 90px Georgia, serif', sub: 'ALL-U-CAN-EAT BUFFET • EARLY BIRD 3-5PM', subFont: 'bold 28px sans-serif', border: '#b8323a', emissive: 0.3, w: 1024, h: 220 }, w: 14, h: 3 },
    });
    void bf;
    this.poi('buffet', B.buffet.door[0], B.buffet.door[1], 'Golden Coral Buffet', 3.2);
    const hoa = this.storefront('hoa', {
      wall: '#d9cdb8', roof: '#5b6770', flat: false,
      sign: { text: 'H.O.A.', opts: { bg: '#2e3a44', fg: '#ffffff', font: 'bold 92px "Times New Roman", serif', sub: 'SUNSET PALMS HOMEOWNERS ASSN.', subFont: 'bold 30px serif', border: '#c9b98a', w: 1024, h: 220 }, w: 9, h: 2 },
    });
    void hoa;
    const b = B.hoa;
    this.box(b.x + 8, 0, b.z + 11, 0.14, 9, 0.14, '#ddd');
    this.batch.add(M.vc, GEO.box, '#2e3a44', mat4(b.x + 9.2, 8, b.z + 11, 0, 2.2, 1.3, 0.04), (x) => Math.max(0, x + 0.5) * 0.35);
    this.col.addCircle(b.x + 8, b.z + 11, 0.2, 9);
    this.addSign('HOA RULES', { bg: '#ffffff', fg: '#b8323a', font: 'bold 60px serif', sub: 'NO fun after 8PM • NO pink over 3ft', subFont: 'bold 24px serif', border: '#2e3a44' }, b.x - 7, 1.6, b.z + 12, 0, 2.6, 0.9);
    this.box(b.x - 7, 0, b.z + 11.95, 0.08, 1.2, 0.08, '#555');
    this.poi('hoa', b.door[0], b.door[1], 'HOA Office', 3.2);

    // lot trees and a strip of palms
    for (let x = 145; x <= 250; x += 15) this.palm(x, 53.2, 1);
    // water tower is in parks. gatehouse:
    const g = B.gatehouse;
    this.box(g.x, 0, g.z, g.sx, 3, g.sz, '#f4ead5');
    this.box(g.x, 3, g.z, g.sx + 1.5, 0.4, g.sz + 1.5, '#c65a3e');
    this.box(g.x + g.sx / 2 + 0.03, 1.2, g.z, 0.1, 1.3, 3, '#fff', 0, M.glass);
    this.col.addBoxC(g.x, g.z, g.sx, g.sz, 4, 'building');
    this.box(286, 0, 56, 0.6, 1.2, 0.6, '#f4ead5');
    this.batch.add(M.vc, GEO.box, '#e84a5f', mat4(286, 1.1, 56, 0, 0.18, 0.18, 9, -1.2));
    this.poi('gate', 282, 60, 'Front Gate', 5);
    this.addSign('WELCOME TO SUNSET PALMS', { bg: '#1f8a8a', fg: '#fff', font: 'bold 60px Georgia, serif', sub: 'An Active Adult Community • Speed Limit 12 MPH', subFont: 'bold 28px Georgia, serif', border: '#f2c94c', w: 1024, h: 200, emissive: 0.25 }, 262, 3, 72, -Math.PI / 2, 8, 1.6);
    this.box(262, 0, 69, 0.2, 2.3, 0.2, '#555');
    this.box(262, 0, 75, 0.2, 2.3, 0.2, '#555');
    this.col.addBoxC(262, 72, 0.6, 6.2, 3);
  }

  buildMaintenance() {
    const s = B.sal;
    const f = new Frame(this, s.x, s.z, Math.PI / 2); // front faces +x (east)
    const W = s.sz, D = s.sx;
    f.box(0, 0, 0, W + 0.6, 0.2, D + 0.6, '#9a958c');
    f.box(0, 0.2, 0, W, 5.5, D, '#8fa3ad');
    for (let i = -W / 2 + 0.5; i < W / 2; i += 1.2) {
      f.box(i, 0.2, D / 2 + 0.04, 0.14, 5.5, 0.08, '#7f939d');
      f.box(i, 0.2, -D / 2 - 0.04, 0.14, 5.5, 0.08, '#7f939d');
    }
    f.box(0, 5.7, 0, W + 1, 0.5, D + 1, '#6d7f88');
    for (const x of [-3.8, 3.8]) {
      f.box(x, 0.2, D / 2 + 0.1, 5, 4, 0.1, '#c9ced1');
      for (let k = 0; k < 8; k++) f.box(x, 0.4 + k * 0.48, D / 2 + 0.16, 5, 0.05, 0.04, '#aab0b3');
    }
    f.sign("SAL'S CART CUSTOMS", { bg: '#111', fg: '#ff6b1a', font: 'bold 76px Impact, sans-serif', sub: 'NO GOVERNOR. NO PROBLEM.', subFont: 'bold 32px sans-serif', border: '#ff6b1a', emissive: 0.5, w: 1024, h: 200 }, 0, 5.1, D / 2 + 0.25, 10, 1.9);
    f.collide(-W / 2, -D / 2, W / 2, D / 2, 7, 'building');
    // tire stacks & drums
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3 + (i % 2); k++) {
      const p = f.toWorld(-7 + i * 1.3, D / 2 + 2.5);
      this.batch.add(M.vc, GEO.torus, '#1d1d1d', mat4(p.x, 0.25 + k * 0.32, p.z, 0, 0.5, 0.5, 2.2, Math.PI / 2));
    }
    for (let i = 0; i < 3; i++) {
      const p = f.toWorld(8 - i * 0.9, D / 2 + 2);
      this.batch.add(M.vc, GEO.cyl, ['#2f6fb0', '#d33', '#2f6fb0'][i], mat4(p.x, 0.6, p.z, 0, 0.4, 1.2, 0.4));
      this.col.addCircle(p.x, p.z, 0.4, 1.2);
    }
    this.poi('sal', s.door[0], s.door[1], "Sal's Cart Customs", 3.4);

    // storage shed + dumpsters
    const sh = B.shed;
    this.box(sh.x, 0, sh.z, sh.sx, 3.5, sh.sz, '#9aa0a3');
    this.box(sh.x, 3.5, sh.z, sh.sx + 0.6, 0.3, sh.sz + 0.6, '#6d7478');
    this.col.addBoxC(sh.x, sh.z, sh.sx, sh.sz, 4, 'building');
    for (let i = 0; i < 2; i++) {
      this.box(-222 + i * 3.2, 0, -20, 2.6, 1.6, 1.8, '#2f6b4a');
      this.box(-222 + i * 3.2, 1.6, -20, 2.7, 0.12, 1.9, '#24533a');
      this.col.addBoxC(-222 + i * 3.2, -20, 2.6, 1.8, 1.7);
    }
    this.poi('dumpster', -220.4, -17, 'Dumpster', 2.4);

    // Doc's van
    const v = B.van;
    const vf = new Frame(this, v.x, v.z, 0);
    vf.box(0, 0.5, 0, 2.3, 2.3, 6, '#f2f0ea');
    vf.box(0, 0.5, 3.2, 2.2, 1.5, 0.6, '#f2f0ea');
    vf.box(0, 1.55, 2.95, 2.1, 0.8, 0.12, '#fff', M.glass);
    vf.box(0, 0.35, 0, 2.35, 0.25, 6.2, '#9a9a9a');
    for (const [x, z] of [[-1.1, 2], [1.1, 2], [-1.1, -2], [1.1, -2]]) this.batch.add(M.vc, GEO.cyl16, '#1a1a1a', mat4(v.x + x, 0.45, v.z + z, 0, 0.45, 0.3, 0.45, 0, Math.PI / 2));
    vf.sign("PRATT'S MOBILE WELLNESS", { bg: '#f2f0ea', fg: '#2e7d4f', font: 'bold 56px Georgia, serif', sub: 'Discreet • Cash Only • No Questions', subFont: 'italic 28px Georgia, serif', w: 1024, h: 160 }, 1.17, 1.9, 0, 4.6, 0.75, Math.PI / 2);
    this.col.addBoxC(v.x, v.z, 2.4, 6.6, 3, 'vehicle');
    // folding table, lawn chair, cooler
    this.box(v.x + 3.2, 0.7, v.z + 0.5, 1.6, 0.06, 0.8, '#e8e8e8');
    this.box(v.x + 3.2, 0, v.z + 0.5, 0.06, 0.7, 0.06, '#777');
    this.box(v.x + 3.5, 0, v.z - 1.6, 0.8, 0.5, 0.5, '#2f6fb0');
    this.poi('doc', v.door[0] + 1.5, v.door[1] + 2.2, "Doc's Van", 3.2);

    // chain-link fence posts around the lot
    for (let z = -35; z <= 50; z += 5) this.box(-212, 0, z, 0.08, 2, 0.08, '#999');
    this.box(-212, 1.95, 7.5, 0.05, 0.05, 85, '#999');
  }

  buildParks() {
    // water tower landmark
    const w = B.watertower;
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      this.batch.add(M.vc, GEO.cyl, '#b8c4c8', segMatrix(w.x + x * 1.4, 0, w.z + z * 1.4, w.x + x, 22, w.z + z, 0.3));
      this.col.addCircle(w.x + x * 1.4, w.z + z * 1.4, 0.4, 20);
    }
    for (const y of [7, 14]) {
      this.box(w.x, y, w.z - 3.6, 8, 0.15, 0.15, '#b8c4c8');
      this.box(w.x, y, w.z + 3.6, 8, 0.15, 0.15, '#b8c4c8');
      this.box(w.x - 3.6, y, w.z, 0.15, 0.15, 8, '#b8c4c8');
      this.box(w.x + 3.6, y, w.z, 0.15, 0.15, 8, '#b8c4c8');
    }
    this.batch.add(M.vc, GEO.cyl16, '#a9d6e5', mat4(w.x, 25, w.z, 0, 5.5, 6, 5.5));
    this.batch.add(M.vc, new THREE.ConeGeometry(5.8, 2.5, 16), '#a9d6e5', mat4(w.x, 29.2, w.z));
    this.batch.add(M.vc, GEO.sph, '#a9d6e5', mat4(w.x, 22, w.z, 0, 5.5, 1.4, 5.5));
    const tt = makeSignTexture('SUNSET PALMS', { bg: '#a9d6e5', fg: '#c65a3e', font: 'italic bold 88px Georgia, serif', w: 1024, h: 128 });
    tt.wrapS = THREE.RepeatWrapping;
    tt.repeat.x = 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(5.56, 5.56, 3, 32, 1, true), new THREE.MeshStandardMaterial({ map: tt, roughness: 0.7 }));
    band.position.set(w.x, 25, w.z);
    this.root.add(band);

    // gazebo
    const gz = B.gazebo;
    this.batch.add(M.vc, new THREE.CylinderGeometry(4.5, 4.7, 0.2, 8), '#f4f0e8', mat4(gz.x, 0.1, gz.z));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      this.batch.add(M.vc, GEO.cyl, '#ffffff', mat4(gz.x + Math.cos(a) * 4, 2, gz.z + Math.sin(a) * 4, 0, 0.13, 3, 0.13));
      this.col.addCircle(gz.x + Math.cos(a) * 4, gz.z + Math.sin(a) * 4, 0.2, 3);
    }
    this.batch.add(M.vc, new THREE.ConeGeometry(5.4, 2.6, 8), '#1f8a8a', mat4(gz.x, 4.8, gz.z, Math.PI / 8));
    this.poi('gazebo', gz.x, gz.z, 'Gazebo', 3);
    this.col.addBoxC(gz.x, gz.z, 9, 9, 3.8, 'roof');

    // pickleball courts
    const pb = B.pickleball;
    const pbTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 512;
      const g = c.getContext('2d');
      g.fillStyle = '#2f6fb0'; g.fillRect(0, 0, 256, 512);
      g.fillStyle = '#3d9a5a'; g.fillRect(0, 0, 256, 20); g.fillRect(0, 492, 256, 20); g.fillRect(0, 0, 20, 512); g.fillRect(236, 0, 20, 512);
      g.strokeStyle = '#fff'; g.lineWidth = 5;
      g.strokeRect(24, 24, 208, 464);
      g.beginPath(); g.moveTo(24, 256); g.lineTo(232, 256); g.stroke();
      g.beginPath(); g.moveTo(24, 180); g.lineTo(232, 180); g.moveTo(24, 332); g.lineTo(232, 332); g.moveTo(128, 24); g.lineTo(128, 180); g.moveTo(128, 332); g.lineTo(128, 488); g.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const pbMat = new THREE.MeshStandardMaterial({ map: pbTex, roughness: 0.85 });
    const pbNet = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 32;
      const g = c.getContext('2d');
      g.strokeStyle = '#141414'; g.lineWidth = 1.5;
      for (let x = 0; x <= 256; x += 5) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 32); g.stroke(); }
      for (let y = 0; y <= 32; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false });
    })();
    for (const dx of [-5, 5]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 18).rotateX(-Math.PI / 2), pbMat);
      m.position.set(pb.x + dx, 0.05, pb.z);
      m.receiveShadow = true;
      this.root.add(m);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.78), pbNet);
      net.position.set(pb.x + dx, 0.5, pb.z);
      this.root.add(net);
      this.box(pb.x + dx, 0.86, pb.z, 8, 0.07, 0.03, '#f4f4f4'); // white tape
      this.box(pb.x + dx, 0, pb.z, 0.05, 0.9, 0.03, '#f4f4f4'); // center strap
      this.box(pb.x + dx - 4, 0, pb.z, 0.08, 1, 0.08, '#555');
      this.box(pb.x + dx + 4, 0, pb.z, 0.08, 1, 0.08, '#555');
    }
    this.addSign('PICKLEBALL', { bg: '#3d9a5a', fg: '#fff', font: 'bold 70px sans-serif', sub: 'Winners stay. Losers file complaints.', subFont: 'bold 24px sans-serif' }, pb.x, 2.4, pb.z + 10.5, 0, 3.6, 0.9);
    this.box(pb.x - 1.6, 0, pb.z + 10.45, 0.08, 2, 0.08, '#555');
    this.box(pb.x + 1.6, 0, pb.z + 10.45, 0.08, 2, 0.08, '#555');
    this.poi('pickleball', pb.x, pb.z + 12, 'Pickleball Courts', 3.5);
    for (let i = 0; i < 3; i++) this.bench(pb.x - 6 + i * 6, pb.z + 13, 0);

    // shuffleboard
    const sb = B.shuffle;
    const sbTex = (() => {
      const SC = SHUFFLE_COURT;
      const c = document.createElement('canvas');
      c.width = 2048; c.height = 192;
      const g = c.getContext('2d');
      const PX = c.width / SC.len, PY = c.height / SC.w, cy = c.height / 2;
      g.fillStyle = '#2e7d6b'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#ece5d1'; g.fillRect(6, cy - SC.play * PY, c.width - 12, SC.play * 2 * PY);
      // waxed sheen streaks
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.05})`; g.fillRect(Math.random() * c.width, cy - SC.play * PY + Math.random() * SC.play * 2 * PY, 120 + Math.random() * 300, 2); }
      g.strokeStyle = '#1f3b8a'; g.fillStyle = '#1f3b8a'; g.lineWidth = 4;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [x0, dir] of [[0, 1], [c.width, -1]]) {
        const bx = x0 + dir * SC.base * PX, ax = x0 + dir * SC.apex * PX, hw = SC.half * PY;
        const ox = x0 + dir * (SC.base - SC.off) * PX;
        g.strokeRect(Math.min(ox, bx), cy - hw, Math.abs(bx - ox), hw * 2);
        g.beginPath(); g.moveTo(bx, cy - hw); g.lineTo(ax, cy); g.lineTo(bx, cy + hw); g.closePath(); g.stroke();
        for (const t of [1 / 3, 2 / 3]) {
          const lx = ax + (bx - ax) * t;
          g.beginPath(); g.moveTo(lx, cy - hw * t); g.lineTo(lx, cy + hw * t); g.stroke();
        }
        g.beginPath(); g.moveTo(ax + (bx - ax) / 3, cy); g.lineTo(bx, cy); g.stroke();
        const dl = x0 + dir * SC.dead * PX;
        g.beginPath(); g.moveTo(dl, cy - SC.play * PY); g.lineTo(dl, cy + SC.play * PY); g.stroke();
        g.font = 'bold 30px sans-serif';
        const at = (t) => ax + (bx - ax) * t;
        g.fillText('10', at(0.2), cy);
        g.fillText('8', at(0.5), cy - hw * 0.25); g.fillText('8', at(0.5), cy + hw * 0.25);
        g.fillText('7', at(0.83), cy - hw * 0.42); g.fillText('7', at(0.83), cy + hw * 0.42);
        g.font = 'bold 18px sans-serif';
        g.fillText('10', (ox + bx) / 2, cy - 12); g.fillText('OFF', (ox + bx) / 2, cy + 12);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    })();
    const sbMat = new THREE.MeshStandardMaterial({ map: sbTex, roughness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.4).rotateX(-Math.PI / 2), sbMat);
      m.position.set(sb.x, 0.06, sb.z - 5 + i * 3.4);
      m.receiveShadow = true;
      this.root.add(m);
    }
    this.poi('shuffle', sb.x + 14.2, sb.z - 5, 'Shuffleboard Courts', 3); // at the shooting end of court 0

    // duck pond park trees
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.palm(-100 + Math.cos(a) * 21, 2 + Math.sin(a) * 19, 1);
    }
    for (let i = 0; i < 4; i++) this.bench(-100 + Math.cos(i * 1.57 + 0.7) * 17, 2 + Math.sin(i * 1.57 + 0.7) * 17, -i * 1.57 - 0.7 - Math.PI / 2);
    this.tree('oak', -60, -20, 1.2);
    this.tree('oak', -140, -20, 1.1);
    this.tree('oak', -185, 40, 1.2);
    this.tree('oak', -70, 42, 1);
  }

  // ---------- golf course ----------
  buildCourse() {
    const rnd = this.rnd;
    for (const h of HOLES) {
      const [tx, tz] = h.tee, [gx, gz] = h.green;
      // tee markers
      for (const s of [-2, 2]) this.batch.add(M.vc, GEO.sph, '#ffffff', mat4(tx + s, heightAt(tx, tz) + 0.15, tz, 0, 0.18, 0.18, 0.18));
      // pin + flag (flag sways)
      const gy = heightAt(gx, gz);
      this.batch.add(M.vc, GEO.cyl, '#f4f4f4', mat4(gx, gy + 1.3, gz, 0, 0.04, 2.6, 0.04));
      this.batch.add(M.vc, GEO.box, '#e63946', mat4(gx + 0.45, gy + 2.3, gz, 0, 0.9, 0.55, 0.02), (x) => (x + 0.5) * 0.5);
      this.batch.add(M.vc, GEO.cyl, '#222', mat4(gx, gy + 0.005, gz, 0, 0.12, 0.02, 0.12));
      this.addSign(`HOLE ${h.n}`, { bg: '#2f6b4a', fg: '#fff', font: 'bold 64px Georgia, serif', sub: ['PAR 4 • "THE HIP BREAKER"', 'PAR 5 • "SCIATICA"', 'PAR 4 • "THE WATER PILL"', 'PAR 3 • "NAP TIME"', 'PAR 4 • "THE WIDOWMAKER"', 'PAR 5 • "LAST RITES"'][h.n - 1], subFont: 'bold 22px sans-serif', w: 512, h: 160 }, tx - 6, 1.4, tz + (tz < -150 ? -1 : 1), tz < -150 ? Math.PI : 0, 2.2, 0.7);
      this.box(tx - 6, 0, tz + (tz < -150 ? -1.05 : 1.05), 0.08, 1.05, 0.08, '#555');
      h.teePos = { x: tx, z: tz };
    }
    // ramps
    for (const r of RAMPS) {
      const s = Math.sin(r.a), c = Math.cos(r.a);
      const L = Math.hypot(r.len, r.h);
      const pitch = Math.atan2(r.h, r.len);
      const mx = r.x + s * r.len / 2, mz = r.z + c * r.len / 2;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(mx, r.h / 2 - 0.08, mz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, r.a, 0, 'YXZ')),
        new THREE.Vector3(r.w, 0.16, L)
      );
      this.batch.add(M.vc, GEO.box, '#c9a66b', m);
      for (let k = 1; k <= 3; k++) {
        const u = (k / 3) * r.len - 0.3;
        const hh = (r.h * u) / r.len;
        for (const side of [-1, 1]) {
          const px = r.x + s * u + c * side * (r.w / 2 - 0.2), pz = r.z + c * u - s * side * (r.w / 2 - 0.2);
          this.box(px, 0, pz, 0.2, hh, 0.2, '#8a6a48');
        }
      }
      // stripes
      for (let k = 0; k < 3; k++) {
        const u = r.len * (0.25 + k * 0.25);
        const m2 = new THREE.Matrix4().compose(
          new THREE.Vector3(r.x + s * u, (r.h * u) / r.len + 0.01, r.z + c * u),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, r.a, 0, 'YXZ')),
          new THREE.Vector3(r.w * 0.9, 0.02, 0.4)
        );
        this.batch.add(M.vc, GEO.box, k % 2 ? '#f2c230' : '#e63946', m2);
      }
    }
    // trees in the rough
    let placed = 0, tries = 0;
    while (placed < 230 && tries < 6000) {
      tries++;
      const x = (rnd() - 0.5) * 560, z = -55 - rnd() * 232;
      if (!onCourse(x, z) || onFairway(x, z) || waterAt(x, z)) continue;
      let ok = true;
      for (const e of EDGES) if (distToSegment(x, z, e.a.x, e.a.z, e.b.x, e.b.z) < e.width / 2 + 4) { ok = false; break; }
      if (!ok) continue;
      for (const p of PONDS) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.3) ok = false;
      for (const r of RAMPS) if (Math.hypot(x - r.x, z - r.z) < 22) ok = false;
      for (const h of HOLES) if (Math.hypot(x - h.green[0], z - h.green[1]) < 20 || Math.hypot(x - h.tee[0], z - h.tee[1]) < 10) ok = false;
      if (!ok) continue;
      const k = rnd();
      if (k < 0.45) this.tree('pine', x, z, 0.9 + rnd() * 0.4);
      else if (k < 0.75) this.palm(x, z, 1 + rnd() * 0.3);
      else this.tree('oak', x, z, 0.9 + rnd() * 0.4);
      placed++;
    }
    // course fringe palms along Fairway Dr
    for (let x = -255; x <= 255; x += 24) if (Math.abs(x + 40) > 8 && Math.abs(x - 120) > 8 && Math.abs(x + 200) > 8) this.palm(x, -52, 1.05);
  }

  buildPerimeter() {
    const hW = WALL, t = 0.7, h = 2.6;
    const seg = (x0, z0, x1, z1) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = Math.abs(x1 - x0) + t, sz = Math.abs(z1 - z0) + t;
      this.box(cx, 0, cz, sx, h, sz, '#efe2c8');
      this.box(cx, h, cz, sx + 0.2, 0.2, sz + 0.2, '#c65a3e');
      this.col.addBox(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, 10, 'wall');
    };
    seg(-hW, -hW, hW, -hW);
    seg(-hW, hW, hW, hW);
    seg(-hW, -hW, -hW, hW);
    seg(hW, -hW, hW, 47);
    seg(hW, 73, hW, hW);
    // hedge + palms inside the wall
    for (let i = -280; i <= 280; i += 28) {
      if (Math.abs(i - 60) > 18) this.palm(hW - 5, i, 1);
      this.palm(-hW + 5, i, 1);
      this.palm(i, hW - 5, 1);
    }
    // neighboring communities beyond the wall (scenery)
    const rnd = this.rnd;
    for (let i = 0; i < 140; i++) {
      const side = i % 4;
      const along = -380 + rnd() * 760;
      const out = 320 + rnd() * 120;
      const x = side === 0 ? along : side === 1 ? along : side === 2 ? -out : out;
      const z = side === 0 ? -out : side === 1 ? out : along;
      // the east side is Boca Beach and the ocean now: keep the scenery off the sand and out of the water
      const onBeach = x > BEACH.x0 - 12 && (x > BEACH.shore - 4 || (z > BEACH.z0 - 20 && z < BEACH.z1 + 20));
      if (rnd() < 0.6) {
        const w = 10 + rnd() * 6;
        const col = ['#f6c6a8', '#fbe7a1', '#bde0fe', '#f7cad0', '#fff1e0'][Math.floor(rnd() * 5)];
        if (onBeach) continue;
        this.box(x, 0, z, w, 3.2, 10, col);
        const r = this.roofGeo(w + 1, 11, 2.2);
        this.batch.add(M.roof, r.geo, '#c65a3e', mat4(x, 3.2, z, r.ry));
      } else if (!onBeach) this.palm(x, z, 1.1, false);
    }
  }

  buildStreetscape() {
    // lamps along Palm Blvd and residential streets
    for (let x = -250; x <= 270; x += 40) {
      this.lamp(x, 53.4, 0);
      this.lamp(x + 20, 66.6, Math.PI);
    }
    for (const s of STREETS) {
      for (const z of [100, 150, 205, 255]) {
        this.lamp(s.x - 5.6, z, Math.PI / 2);
      }
      for (let z = 75; z < 270; z += 30) {
        if (Math.abs(z - 170) < 10) continue;
      }
    }
    for (let x = -250; x <= 250; x += 45) this.lamp(x, -39.4, 0);
    for (const z of [-20, 20]) this.lamp(-34.4, z, -Math.PI / 2);
    for (const z of [-20, 20]) {
      this.lamp(125.6, z, -Math.PI / 2);
      this.lamp(259.4, z, Math.PI / 2);
    }
    // palm-lined boulevard median feel
    for (let x = -250; x <= 260; x += 20) {
      if (STREETS.some((s) => Math.abs(s.x - x) < 9)) continue;
      this.palm(x, 68.5, 1.1);
    }
    // street name signs
    const signFor = (name, x, z, ry) => {
      this.box(x, 0, z, 0.08, 2.6, 0.08, '#4a4a4a');
      this.addSign(name.toUpperCase(), { bg: '#1e6b3a', fg: '#fff', font: 'bold 64px sans-serif', border: '#fff', w: 512, h: 100 }, x, 2.4, z, ry, 1.8, 0.36);
    };
    for (const s of STREETS) {
      signFor(s.name, s.x + 6, 67.5, Math.PI / 2);
      signFor('Shuffleboard Ave', s.x + 6, 176.5, 0);
    }
    signFor('Palm Blvd', -34.5, 67.5, 0);
    signFor('Fairway Dr', -34.5, -38.5, 0);
    // "SLOW - SENIORS AT PLAY" signs
    const slow = [[-44.5, 110], [35.5, 140], [115.5, 205], [-124.5, 230], [-4, 66.5], [194.5, 110]];
    for (const [x, z] of slow) {
      this.box(x, 0, z, 0.08, 2.2, 0.08, '#555');
      this.addSign('SLOW', { bg: '#f2c230', fg: '#111', font: 'bold 70px sans-serif', sub: 'SENIORS AT PLAY', subFont: 'bold 30px sans-serif', border: '#111', w: 400, h: 200 }, x, 2.1, z, Math.PI / 2, 1, 0.55);
    }
    // benches along the blvd
    for (let x = -230; x <= 250; x += 80) this.bench(x + 10, 50.8, Math.PI);
  }

  updateDucks(t) {
    for (const d of this.ducks) {
      const a = d.ph + t * d.w;
      const x = d.cx + Math.cos(a) * d.r, z = d.cz + Math.sin(a) * d.r;
      d.m.position.set(x, WATER_Y - 0.06 + Math.sin(t * 2 + d.ph) * 0.02, z);
      // face along the direction of travel
      d.m.rotation.y = Math.atan2(-Math.sin(a) * d.w, Math.cos(a) * d.w);
    }
  }

  // Random point where golf balls end up (rough, fairway, pond edges, bunkers).
  randomBallSpot() {
    for (let i = 0; i < 30; i++) {
      const r = Math.random();
      let x, z;
      if (r < 0.4) {
        const p = PONDS[Math.floor(Math.random() * 3)];
        const a = Math.random() * Math.PI * 2, d = p.r * (0.5 + Math.random() * 0.5);
        x = p.x + Math.cos(a) * d; z = p.z + Math.sin(a) * d;
      } else if (r < 0.75) {
        const h = HOLES[Math.floor(Math.random() * HOLES.length)];
        const t = Math.random();
        x = h.tee[0] + (h.green[0] - h.tee[0]) * t + (Math.random() - 0.5) * 55;
        z = h.tee[1] + (h.green[1] - h.tee[1]) * t + (Math.random() - 0.5) * 20;
      } else {
        x = (Math.random() - 0.5) * 540;
        z = -60 - Math.random() * 220;
      }
      if (!onCourse(x, z)) continue;
      if (this.col.query(x, z, 1).some((o) => (o.t === 'c' ? Math.hypot(x - o.x, z - o.z) < o.r + 0.4 : x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1))) continue;
      return { x, z };
    }
    return { x: 0, z: -150 };
  }

  // Random walkable point in a named zone for pedestrians.
  randomZonePoint(zone) {
    const z = zone || pickWeighted(ZONES);
    for (let i = 0; i < 12; i++) {
      const x = z.x0 + Math.random() * (z.x1 - z.x0), zz = z.z0 + Math.random() * (z.z1 - z.z0);
      if (waterAt(x, zz)) continue;
      if (this.col.query(x, zz, 1).some((o) => (o.t === 'b' ? x > o.x0 - 1 && x < o.x1 + 1 && zz > o.z0 - 1 && zz < o.z1 + 1 : Math.hypot(x - o.x, zz - o.z) < o.r + 1))) continue;
      return { x, z: zz };
    }
    return { x: (z.x0 + z.x1) / 2, z: (z.z0 + z.z1) / 2 };
  }

  locationName(x, z) {
    if (x > 292) {
      if (onBoat(x, z)) return 'The Lucky Lady';
      if (x > BEACH.shore + 2) return Math.abs(z - BEACH.pier.z) < 4 && x < BEACH.pier.x1 ? 'The Pier' : 'Atlantic Ocean';
      if (Math.abs(z - BEACH.pier.z) < 4 && x > BEACH.pier.x0) return 'The Pier';
      if (Math.hypot(x - BEACH.bar.x, z - BEACH.bar.z) < 16) return 'The Rusty Pelican';
      return x < 318 ? 'Beach Rd' : 'Boca Beach Club';
    }
    if (z < -52) {
      for (const p of PONDS) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.4) return p.name;
      let best = null, bd = 1e9;
      for (const h of HOLES) {
        const d = distToSegment(x, z, h.tee[0], h.tee[1], h.green[0], h.green[1]);
        if (d < bd) { bd = d; best = h; }
      }
      return `Palmetto Links — Hole ${best.n}`;
    }
    for (const zn of ZONES) if (x >= zn.x0 - 6 && x <= zn.x1 + 6 && z >= zn.z0 - 6 && z <= zn.z1 + 6) return zn.name;
    if (x < -212 && z < 55) return 'Maintenance Lot';
    if (Math.abs(z - 60) < 8) return 'Palm Blvd';
    if (Math.abs(z + 45) < 8) return 'Fairway Dr';
    if (x > 140 && z > 15 && z < 55) return 'Commercial Strip';
    if (Math.abs(z - 170) < 8 && z > 60) return 'Shuffleboard Ave';
    if (Math.abs(z - 270) < 8) return 'Sunset Loop';
    let best = null, bd = 1e9;
    for (const s of STREETS) {
      const d = Math.abs(x - s.x);
      if (d < bd) { bd = d; best = s; }
    }
    if (z > 60 && bd < 45) return best.name;
    if (x > -60 && x < 90 && z > -45 && z < 55) return 'Clubhouse Grounds';
    return 'Sunset Palms';
  }
}

function k4(rnd) {
  return rnd() < 0.25;
}

function pickWeighted(list) {
  const total = list.reduce((a, z) => a + (z.weight || 1), 0);
  let r = Math.random() * total;
  for (const z of list) {
    r -= z.weight || 1;
    if (r <= 0) return z;
  }
  return list[0];
}

export { NODES };
