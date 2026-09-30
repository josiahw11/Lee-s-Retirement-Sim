// Tire marks: one dynamic ring buffer of quads laid under scrubbing wheels. Dark rubber on
// asphalt, torn-up dirt on grass, darker ruts in sand. Marks fade out over ~45 seconds.
import * as THREE from 'three';

const N = 900; // segments in the ring
const HALF_W = 0.12;
const LIFE = 45;
const COLORS = { road: [0.012, 0.012, 0.014], grass: [0.2, 0.15, 0.08], sand: [0.42, 0.34, 0.22] };

export class SkidMarks {
  constructor(scene) {
    this.pos = new Float32Array(N * 18);
    this.col = new Float32Array(N * 24);
    this.born = new Float32Array(N).fill(-1e9);
    this.alpha = new Float32Array(N);
    this.rgb = new Float32Array(N * 3);
    this.i = 0;
    this.t = 0;
    this.fadeT = 0;
    this.trails = new Map();
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('color', this.colAttr);
    const m = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  // Lay rubber for one wheel (key) this frame. Continuous calls build a connected trail.
  mark(key, x, y, z, strength, surface = 'road') {
    const last = this.trails.get(key);
    if (!last || this.t - last.t > 0.12) { this.trails.set(key, { x, y, z, t: this.t }); return; }
    const dx = x - last.x, dz = z - last.z;
    const len = Math.hypot(dx, dz);
    if (len > 3) { this.trails.set(key, { x, y, z, t: this.t }); return; }
    if (len < 0.18) { last.t = this.t; return; }
    const px = (-dz / len) * HALF_W, pz = (dx / len) * HALF_W;
    const s = this.i;
    this.i = (this.i + 1) % N;
    const y0 = last.y + 0.03, y1 = y + 0.03;
    this.pos.set([
      last.x - px, y0, last.z - pz, last.x + px, y0, last.z + pz, x + px, y1, z + pz,
      last.x - px, y0, last.z - pz, x + px, y1, z + pz, x - px, y1, z - pz,
    ], s * 18);
    this.born[s] = this.t;
    this.alpha[s] = Math.min(0.85, 0.4 + strength * 0.45);
    this.rgb.set(COLORS[surface] || COLORS.road, s * 3);
    this.writeColor(s, this.alpha[s]);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.trails.set(key, { x, y, z, t: this.t });
  }

  writeColor(s, a) {
    const r = this.rgb[s * 3], g = this.rgb[s * 3 + 1], b = this.rgb[s * 3 + 2];
    const o = s * 24;
    for (let v = 0; v < 6; v++) {
      this.col[o + v * 4] = r;
      this.col[o + v * 4 + 1] = g;
      this.col[o + v * 4 + 2] = b;
      this.col[o + v * 4 + 3] = a;
    }
  }

  update(dt) {
    this.t += dt;
    this.fadeT -= dt;
    if (this.fadeT > 0) return;
    this.fadeT = 0.5;
    let dirty = false;
    for (let s = 0; s < N; s++) {
      const age = this.t - this.born[s];
      if (age < 0 || age > LIFE + 1) continue;
      this.writeColor(s, this.alpha[s] * Math.max(0, 1 - age / LIFE));
      dirty = true;
    }
    if (dirty) this.colAttr.needsUpdate = true;
  }

  clear() {
    this.born.fill(-1e9);
    this.col.fill(0);
    this.colAttr.needsUpdate = true;
    this.trails.clear();
  }
}
