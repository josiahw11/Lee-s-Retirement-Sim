// Static geometry batcher: everything that never moves is baked into a handful of
// merged meshes keyed by material, with per-vertex color and an optional wind weight.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function mat4(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Prepare a geometry for merging: non-indexed, only position/normal/uv/color/wind.
export function prep(geo, color, wind = 0) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const n = g.attributes.position.count;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  const col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const w = new Float32Array(n);
  if (typeof wind === 'function') {
    const pos = g.attributes.position;
    for (let i = 0; i < n; i++) w[i] = wind(pos.getX(i), pos.getY(i), pos.getZ(i));
  } else w.fill(wind);
  g.setAttribute('wind', new THREE.BufferAttribute(w, 1));
  return g;
}

export class Batcher {
  constructor() {
    this.groups = new Map(); // material -> geometry[]
  }

  add(material, geo, color, matrix, wind = 0) {
    const g = prep(geo, color, wind);
    if (matrix) g.applyMatrix4(matrix);
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(g);
    return g;
  }

  // Merge a pre-built colored geometry (already prepped) with a transform.
  addPrepped(material, g, matrix) {
    const c = g.clone();
    if (matrix) c.applyMatrix4(matrix);
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(c);
  }

  build(parent, { castShadow = true, receiveShadow = true, chunk = 60000 } = {}) {
    const meshes = [];
    for (const [mat, list] of this.groups) {
      // split into chunks so frustum culling still helps and index sizes stay sane
      let cur = [], count = 0;
      const flush = () => {
        if (!cur.length) return;
        const merged = mergeGeometries(cur, false);
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = castShadow && !mat.userData.noShadow;
        mesh.receiveShadow = receiveShadow;
        mesh.matrixAutoUpdate = false;
        parent.add(mesh);
        meshes.push(mesh);
        cur = [];
        count = 0;
      };
      // sort spatially so chunks are compact
      list.sort((a, b) => {
        a.computeBoundingSphere();
        b.computeBoundingSphere();
        const ca = a.boundingSphere.center, cb = b.boundingSphere.center;
        const ka = Math.floor(ca.x / 120) * 1000 + Math.floor(ca.z / 120);
        const kb = Math.floor(cb.x / 120) * 1000 + Math.floor(cb.z / 120);
        return ka - kb;
      });
      let lastKey = null;
      for (const g of list) {
        const c = g.boundingSphere.center;
        const key = Math.floor(c.x / 120) * 1000 + Math.floor(c.z / 120);
        if ((lastKey !== null && key !== lastKey && count > 8000) || count > chunk) flush();
        lastKey = key;
        cur.push(g);
        count += g.attributes.position.count;
      }
      flush();
    }
    this.groups.clear();
    return meshes;
  }
}

// Merge a list of [geo, color, matrix] into ONE prepped geometry (for props/characters).
export function mergeParts(parts, wind = 0) {
  const list = parts.map(([geo, color, m, w]) => {
    const g = prep(geo, color, w ?? wind);
    if (m) g.applyMatrix4(m);
    return g;
  });
  const merged = mergeGeometries(list, false);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}
