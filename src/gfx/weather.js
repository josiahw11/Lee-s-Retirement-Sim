// Florida afternoon thunderstorms: rain streaks around the camera, darkened sky, lightning.
import * as THREE from 'three';

const N = 5000;
const BOX = { x: 70, y: 40, z: 70 };

export class Weather {
  constructor(scene) {
    this.intensity = 0;
    this.target = 0;
    this.windX = 5; // horizontal drift (m/s); hurricanes push it way up
    this.flash = 0;
    this.nextBolt = 8;
    const pos = new Float32Array(N * 6);
    this.drops = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * BOX.x;
      this.drops[i * 3 + 1] = Math.random() * BOX.y;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ color: 0xaec3d6, transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  // returns lightning flash amount (0..1) for this frame
  update(dt, cam, onBolt) {
    this.intensity += Math.sign(this.target - this.intensity) * Math.min(Math.abs(this.target - this.intensity), dt * 0.08);
    const k = this.intensity;
    this.lines.visible = k > 0.02;
    this.flash = Math.max(0, this.flash - dt * 5);
    if (!this.lines.visible) return this.flash;
    this.mat.opacity = 0.18 + k * 0.35;
    const active = Math.floor(N * k);
    const p = this.geo.attributes.position.array;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const fall = 32 * dt, wind = this.windX * dt, slant = this.windX * 0.024;
    for (let i = 0; i < active; i++) {
      const j = i * 3;
      this.drops[j + 1] -= fall;
      this.drops[j] += wind;
      if (this.drops[j + 1] < 0) {
        this.drops[j + 1] += BOX.y;
        this.drops[j] = (Math.random() - 0.5) * BOX.x;
        this.drops[j + 2] = (Math.random() - 0.5) * BOX.z;
      }
      // wrap around the camera so rain always surrounds the player
      const x = cx + ((((this.drops[j] + BOX.x / 2) % BOX.x) + BOX.x) % BOX.x) - BOX.x / 2;
      const y = cy - 12 + this.drops[j + 1];
      const z = cz + this.drops[j + 2];
      const o = i * 6;
      p[o] = x; p[o + 1] = y; p[o + 2] = z;
      p[o + 3] = x - slant; p[o + 4] = y + 0.9; p[o + 5] = z;
    }
    this.geo.setDrawRange(0, active * 2);
    this.geo.attributes.position.needsUpdate = true;
    // lightning
    if (k > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 5 + Math.random() * 12;
        this.flash = 1;
        if (onBolt) onBolt();
      }
    }
    return this.flash;
  }
}
