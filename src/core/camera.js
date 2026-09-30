// Third-person chase camera with mouse orbit, auto-follow behind the cart, and screen shake.
import * as THREE from 'three';
import { clamp, damp, dampAngle, rand } from './utils.js';
import { heightAt } from '../world/terrain.js';

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.dist = 7.5;
    this.target = new THREE.Vector3();
    this.shake = 0;
    this.fov = 62;
    this.sensitivity = 1;
    this.cinematic = null; // {pos, look, t}
  }

  addShake(v) {
    this.shake = Math.min(1.2, this.shake + v);
  }

  update(dt, input, f) {
    if (input.locked || input.pad) {
      this.yaw -= input.dx * 0.0024 * this.sensitivity;
      this.pitch = clamp(this.pitch + input.dy * 0.0019 * this.sensitivity, -0.15, 1.25);
    }
    this.dist = clamp(this.dist + input.wheel * 0.9, 3.5, 18);
    const idle = performance.now() - input.lastMouseMove > 1400;
    if (f.inCart && idle && f.speed > 1.5) {
      const behind = (f.reversing ? f.heading : f.heading + Math.PI);
      this.yaw = dampAngle(this.yaw, behind, 2.5, dt);
      this.pitch = damp(this.pitch, 0.26, 1.5, dt);
    }
    let dist = this.dist * (f.inCart ? 1.25 : 1);
    this.target.x = damp(this.target.x, f.x, 14, dt);
    this.target.y = damp(this.target.y, f.y + (f.inCart ? 1.6 : 1.5), 10, dt);
    this.target.z = damp(this.target.z, f.z, 14, dt);
    const cp = Math.cos(this.pitch);
    const dx = Math.sin(this.yaw) * cp, dz = Math.cos(this.yaw) * cp, dy = Math.sin(this.pitch);
    // pull the camera in front of walls/buildings
    if (this.col) {
      const steps = Math.ceil(dist / 0.4);
      const tx = this.target.x, ty = this.target.y, tz = this.target.z;
      for (let i = 1; i <= steps; i++) {
        const d = (i / steps) * dist;
        const x = tx + dx * d, y = ty + dy * d, z = tz + dz * d;
        let hit = false;
        for (const o of this.col.query(x, z, 0.4)) {
          if (o.t === 'b' && o.h > y - 0.4 && x > o.x0 - 0.35 && x < o.x1 + 0.35 && z > o.z0 - 0.35 && z < o.z1 + 0.35) { hit = true; break; }
          if (o.t === 'c' && o.tag === 'tree' && y < 9 && Math.hypot(x - o.x, z - o.z) < o.r + 0.35) { hit = true; break; }
        }
        if (hit) { dist = Math.max(1.2, d - 0.5); break; }
      }
    }
    this.curDist = this.curDist === undefined ? dist : dist < this.curDist ? dist : damp(this.curDist, dist, 3, dt);
    dist = this.curDist;
    let px = this.target.x + dx * dist;
    let pz = this.target.z + dz * dist;
    let py = this.target.y + dy * dist;
    // opening swoop: start high over the neighborhood and glide down to the player
    if (this.introT > 0) {
      this.introT -= dt;
      const k = Math.max(0, this.introT / this.introDur);
      const e = k * k * (3 - 2 * k);
      const hy = this.yaw + e * 1.6;
      const hd = 95 * e;
      px += Math.sin(hy) * hd;
      pz += Math.cos(hy) * hd;
      py += 70 * e;
    }
    const gy = heightAt(px, pz) + 0.6;
    if (py < gy) py = gy;
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.35;
      px += rand(-s, s); py += rand(-s, s); pz += rand(-s, s);
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    if (this.cinematic) {
      const c = this.cinematic;
      this.cam.position.lerp(c.pos, 1 - Math.exp(-3 * dt));
      this.cam.lookAt(c.look);
    } else {
      this.cam.position.set(px, py, pz);
      this.cam.lookAt(this.target.x, this.target.y + 0.2, this.target.z);
    }
    const wantFov = 62 + clamp((f.speed - 6) * 1.1, 0, 16) + (f.boost ? 8 : 0);
    this.fov = damp(this.fov, wantFov, 3, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
  }

  // forward direction on the ground plane (away from camera)
  forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }
}
