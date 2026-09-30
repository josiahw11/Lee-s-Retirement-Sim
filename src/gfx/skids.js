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
    let last = this.trails.get(key);
    if (!last) { last = { x, y, z, t: this.t }; this.trails.set(key, last); return; }
    const dx = x - last.x, dz = z - last.z;
    const len = Math.hypot(dx, dz);
    if (this.t - last.t > 0.12 || len > 3) { last.x = x; last.y = y; last.z = z; last.t = this.t; return; } // new trail
    if (len < 0.18) { last.t = this.t; return; }
    const px = (-dz / len) * HALF_W, pz = (dx / len) * HALF_W;
    const s = this.i;
    this.i = (this.i + 1) % N;
    const y0 = last.y + 0.03, y1 = y + 0.03;
    const P = this.pos, o = s * 18;
    P[o] = last.x - px; P[o + 1] = y0; P[o + 2] = last.z - pz;
    P[o + 3] = last.x + px; P[o + 4] = y0; P[o + 5] = last.z + pz;
    P[o + 6] = x + px; P[o + 7] = y1; P[o + 8] = z + pz;
    P[o + 9] = last.x - px; P[o + 10] = y0; P[o + 11] = last.z - pz;
    P[o + 12] = x + px; P[o + 13] = y1; P[o + 14] = z + pz;
    P[o + 15] = x - px; P[o + 16] = y1; P[o + 17] = z - pz;
    this.born[s] = this.t;
    this.alpha[s] = Math.min(0.85, 0.4 + strength * 0.45);
    const c = COLORS[surface] || COLORS.road;
    this.rgb[s * 3] = c[0]; this.rgb[s * 3 + 1] = c[1]; this.rgb[s * 3 + 2] = c[2];
    this.writeColor(s, this.alpha[s]);
    // upload just the segment we wrote
    this.posAttr.addUpdateRange(o, 18);
    this.colAttr.addUpdateRange(s * 24, 24);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    last.x = x; last.y = y; last.z = z; last.t = this.t;
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
    if (dirty) {
      this.colAttr.clearUpdateRanges(); // fade touches everything: upload the whole buffer
      this.colAttr.needsUpdate = true;
    }
  }

  clear() {
    this.born.fill(-1e9);
    this.col.fill(0);
    this.colAttr.clearUpdateRanges();
    this.colAttr.needsUpdate = true;
    this.trails.clear();
  }
}
