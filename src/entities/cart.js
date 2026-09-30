// Golf carts: model + upgrades + arcade physics (drift, air, suspension, splashdown).
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { heightAt, waterLevel, rampHeight } from '../world/terrain.js';
import { clamp, damp, lerp, wrapAngle } from '../core/utils.js';

const G = 16; // arcade gravity - carts get real air but still land hard

export const CART_COLORS = ['#ffffff', '#f2f0e6', '#1f8a8a', '#e84a5f', '#f2c94c', '#23408e', '#2f6b4a', '#f7a1c4', '#111111', '#c9d3db'];

export class Cart {
  constructor(opts = {}) {
    this.opts = opts;
    this.kind = opts.kind || 'resident'; // player | resident | security | concession | rival | club
    this.color = opts.color || CART_COLORS[Math.floor(Math.random() * CART_COLORS.length)];
    this.upgrades = { ...(opts.upgrades || {}) };
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // pitched/rolled; suspension offset
    this.group.add(this.body);
    this.paintMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.35, metalness: 0.15 });
    this.wheels = [];
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.y = heightAt(this.x, this.z);
    this.heading = opts.ry || 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.grounded = true;
    this.steerAng = 0;
    this.pitch = 0; this.roll = 0;
    this.suspY = 0; this.suspV = 0;
    this.airT = 0;
    this.wheelRot = 0;
    this.radius = 1.25;
    this.driver = null;
    this.passenger = null;
    this.sunk = false;
    this.t = Math.random() * 10;
    this.lastImpact = 0;
    this.horn = 0;
    this.build();
    this.syncMesh(0);
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  get forwardSpeed() {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }

  stats() {
    const u = this.upgrades;
    let max = 11;
    if (this.kind === 'security') max = 12.5;
    if (this.kind === 'rival') max = 12.5;
    if (u.governor) max = 16;
    return {
      max,
      turbo: u.turbo ? max * 1.45 : max,
      accel: u.governor ? 7.5 : 5.5,
      offroad: u.lift ? 1.0 : 0.88,
    };
  }

  rebuild() {
    this.body.clear();
    this.wheels = [];
    this.build();
    this.syncMesh(0);
  }

  build() {
    const u = this.upgrades;
    const lift = u.lift ? 0.22 : 0;
    this.lift = lift;
    this.wheelR = u.lift ? 0.36 : 0.25;
    const b = this.body;
    const chassis = new THREE.Group();
    chassis.position.y = lift;
    b.add(chassis);
    this.chassis = chassis;
    // painted panels
    const paint = mergeParts([
      [GEO.box, '#fff', mat4(0, 0.47, 0.05, 0, 1.18, 0.26, 2.3)],
      [GEO.box, '#fff', mat4(0, 0.7, 0.98, 0, 1.12, 0.42, 0.42)],
      [GEO.sph, '#fff', mat4(0, 0.78, 1.12, 0, 0.56, 0.26, 0.26)],
      [GEO.box, '#fff', mat4(0, 0.72, -0.92, 0, 1.18, 0.34, 0.6)],
      [GEO.box, '#fff', mat4(0, 2.02, -0.08, 0, 1.3, 0.07, 1.75)],
    ]);
    const pm = new THREE.Mesh(paint, this.paintMat);
    pm.castShadow = true;
    chassis.add(pm);
    // trim + seats + posts
    const seat = this.kind === 'security' ? '#1d2b53' : u.leather ? '#6b3a1f' : '#e9dcc0';
    const parts = [
      [GEO.box, '#2a2a2a', mat4(0, 0.33, 0.05, 0, 1.2, 0.08, 2.34)],
      [GEO.box, '#333', mat4(0, 0.61, 0.35, 0, 1.0, 0.03, 0.9)],
      [GEO.box, seat, mat4(0, 0.82, -0.28, 0, 1.08, 0.16, 0.55)],
      [GEO.box, seat, mat4(0, 1.12, -0.56, 0, 1.08, 0.46, 0.13, -0.15)],
      [GEO.cyl, '#bbb', mat4(0.56, 1.35, 0.52, 0, 0.03, 1.3, 0.03)],
      [GEO.cyl, '#bbb', mat4(-0.56, 1.35, 0.52, 0, 0.03, 1.3, 0.03)],
      [GEO.cyl, '#bbb', mat4(0.56, 1.45, -0.72, 0, 0.03, 1.1, 0.03)],
      [GEO.cyl, '#bbb', mat4(-0.56, 1.45, -0.72, 0, 0.03, 1.1, 0.03)],
      [GEO.torus, '#222', mat4(0.28, 1.12, 0.38, 0, 0.17, 0.17, 1.4, -0.9)],
      [GEO.cyl, '#222', mat4(0.28, 0.9, 0.5, 0, 0.025, 0.5, 0.025, -0.5)],
      [GEO.sph, '#fffbe0', mat4(0.36, 0.78, 1.33, 0, 0.09, 0.07, 0.04)],
      [GEO.sph, '#fffbe0', mat4(-0.36, 0.78, 1.33, 0, 0.09, 0.07, 0.04)],
      [GEO.box, '#c01818', mat4(0.45, 0.72, -1.23, 0, 0.14, 0.08, 0.02)],
      [GEO.box, '#c01818', mat4(-0.45, 0.72, -1.23, 0, 0.14, 0.08, 0.02)],
      [GEO.box, '#2a2a2a', mat4(0, 0.4, 1.25, 0, 1.2, 0.14, 0.12)],
    ];
    // rear cargo
    if (this.kind === 'concession') {
      parts.push([GEO.box, '#1f5fb0', mat4(0, 1.05, -1.25, 0, 1.1, 0.7, 0.8)]);
      parts.push([GEO.box, '#ffffff', mat4(0, 1.42, -1.25, 0, 1.14, 0.06, 0.84)]);
    } else if (this.kind === 'player' || u.cooler) {
      parts.push([GEO.box, '#e84a5f', mat4(0, 1.02, -1.15, 0, 0.7, 0.45, 0.45)]);
      parts.push([GEO.box, '#ffffff', mat4(0, 1.27, -1.15, 0, 0.72, 0.07, 0.47)]);
    } else {
      parts.push([GEO.cyl, '#2f2f2f', mat4(0, 1.2, -1.15, 0, 0.18, 0.9, 0.18, 0.25)]);
      for (let i = 0; i < 4; i++) parts.push([GEO.cyl, '#999', mat4(-0.08 + i * 0.05, 1.72, -1.05 + (i % 2) * 0.05, 0, 0.012, 0.35, 0.012, 0.25)]);
    }
    const trim = new THREE.Mesh(mergeParts(parts), M.vc);
    trim.castShadow = true;
    chassis.add(trim);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), new THREE.MeshStandardMaterial({ color: 0xcfe8f5, transparent: true, opacity: 0.25, roughness: 0.05 }));
    glass.position.set(0, 1.6, 0.53);
    glass.rotation.x = -0.08;
    chassis.add(glass);

    // lights (emissive meshes)
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0 });
    for (const x of [0.36, -0.36]) {
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), this.headMat);
      h.position.set(x, 0.78, 1.375);
      chassis.add(h);
    }

    if (this.kind === 'security') {
      const bar = new THREE.Group();
      this.sirenR = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.2 });
      this.sirenB = new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x0033ff, emissiveIntensity: 0.2 });
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.22), this.sirenR);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.22), this.sirenB);
      r.position.set(0.25, 2.12, -0.1);
      bl.position.set(-0.25, 2.12, -0.1);
      bar.add(r, bl);
      chassis.add(bar);
      const decal = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0x1d2b53 }));
      decal.position.set(0, 0.62, 1.2);
      chassis.add(decal);
    }
    if (this.kind === 'concession') {
      const um = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 8), new THREE.MeshStandardMaterial({ color: this.opts.canopy || 0xf2c94c, roughness: 0.7 }));
      um.position.set(0, 2.35, -1.2);
      chassis.add(um);
    }
    if (u.speakers) {
      const sp = mergeParts([
        [GEO.box, '#111', mat4(0.4, 2.2, -0.75, 0, 0.3, 0.3, 0.25)],
        [GEO.box, '#111', mat4(-0.4, 2.2, -0.75, 0, 0.3, 0.3, 0.25)],
        [GEO.cyl, '#555', mat4(0.4, 2.2, -0.62, 0, 0.1, 0.02, 0.1, Math.PI / 2)],
        [GEO.cyl, '#555', mat4(-0.4, 2.2, -0.62, 0, 0.1, 0.02, 0.1, Math.PI / 2)],
      ]);
      this.speakers = new THREE.Mesh(sp, M.vc);
      chassis.add(this.speakers);
    }
    if (u.flag) {
      const f = mergeParts([
        [GEO.cyl, '#ddd', mat4(-0.5, 2.9, -1.2, 0, 0.012, 2.6, 0.012)],
        [GEO.box, '#ff6b1a', mat4(-0.5, 4.0, -1.45, 0, 0.02, 0.35, 0.5), (x, y, z) => Math.max(0, -z - 1.2) * 1.5],
      ]);
      chassis.add(new THREE.Mesh(f, M.vc));
    }
    if (u.nuts) {
      this.nuts = new THREE.Group();
      this.nuts.position.set(0, 0.42, -1.3);
      const nm = new THREE.Mesh(mergeParts([
        [GEO.cyl, '#888', mat4(0, -0.05, 0, 0, 0.02, 0.1, 0.02)],
        [GEO.sph, '#c9c9c9', mat4(0.07, -0.18, 0, 0, 0.08, 0.1, 0.08)],
        [GEO.sph, '#c9c9c9', mat4(-0.07, -0.18, 0, 0, 0.08, 0.1, 0.08)],
      ]), M.vcShiny);
      this.nuts.add(nm);
      chassis.add(this.nuts);
    }
    if (u.neon) {
      this.neonMat = new THREE.MeshBasicMaterial({ color: u.neonColor || 0xff2bd6, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      const n = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.2).rotateX(-Math.PI / 2), this.neonMat);
      n.position.y = 0.04 - lift;
      b.add(n);
      this.neonMesh = n;
    }

    // wheels
    const rimCol = u.rims ? '#eeeeee' : '#8a8f94';
    const r = this.wheelR;
    for (const [x, z] of [[0.55, 0.85], [-0.55, 0.85], [0.55, -0.85], [-0.55, -0.85]]) {
      const w = new THREE.Group();
      w.position.set(x * (u.lift ? 1.08 : 1), r, z);
      const spin = new THREE.Group();
      w.add(spin);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, u.lift ? 0.3 : 0.2, 14).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 }));
      tire.castShadow = true;
      spin.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, u.lift ? 0.32 : 0.22, 8).rotateZ(Math.PI / 2), u.rims ? M.chrome : new THREE.MeshStandardMaterial({ color: rimCol }));
      spin.add(hub);
      if (u.rims) {
        // spinner blades that keep spinning even when stopped
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, r * 1.1, 0.08), M.chrome);
        sp.position.x = x > 0 ? 0.17 : -0.17;
        w.add(sp);
        w.userData.spinner = sp;
      }
      b.add(w);
      this.wheels.push({ g: w, spin, front: z > 0 });
    }
    b.position.y = 0;
  }

  setPaint(c) {
    this.color = c;
    this.paintMat.color.set(c);
  }

  // input: {throttle -1..1, steer -1..1, handbrake bool, boost bool, drunk 0..1}
  update(dt, input, col) {
    this.t += dt;
    const st = this.stats();
    const h = this.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * fz - this.vz * fx;
    const onRoad = input.onRoad !== false;
    const offMul = onRoad ? 1 : st.offroad;
    let max = (input.boost ? st.turbo : st.max) * offMul;
    if (input.maxOverride) max = Math.min(max, input.maxOverride);
    const drunk = input.drunk || 0;
    let steerIn = input.steer || 0;
    if (drunk > 0.05) steerIn += Math.sin(this.t * 1.7) * 0.35 * drunk + Math.sin(this.t * 4.3) * 0.15 * drunk;
    steerIn = clamp(steerIn, -1, 1);
    const maxSteer = 0.55 - clamp(Math.abs(vf) / 30, 0, 0.25);
    this.steerAng = damp(this.steerAng, steerIn * maxSteer, drunk > 0.3 ? 5 : 10, dt);

    if (this.grounded && !this.sunk) {
      const th = input.throttle || 0;
      if (th > 0) {
        if (vf < -0.3) vf += 14 * dt;
        else vf += st.accel * th * dt * (1 - clamp(vf / max, 0, 1) ** 2) * (input.boost ? 1.7 : 1);
      } else if (th < 0) {
        if (vf > 0.3) vf -= 14 * dt;
        else vf = Math.max(vf - 4 * dt, -5);
      } else {
        vf *= Math.exp(-0.7 * dt);
        if (Math.abs(vf) < 0.05) vf = 0;
      }
      if (vf > max) vf = damp(vf, max, 2, dt);
      if (!onRoad) vf *= Math.exp(-0.15 * dt);
      const hb = input.handbrake;
      if (hb) vf *= Math.exp(-0.9 * dt);
      const wheelbase = 1.7;
      let yaw = (vf * Math.tan(this.steerAng)) / wheelbase;
      if (hb) yaw *= 1.5;
      this.heading = wrapAngle(this.heading + yaw * dt);
      const grip = (hb ? 1.6 : 9) * (input.wet ? 0.6 : 1);
      vl *= Math.exp(-grip * dt);
    } else if (!this.sunk) {
      this.heading = wrapAngle(this.heading + steerIn * 0.9 * dt);
    }
    if (this.sunk) {
      vf *= Math.exp(-3 * dt);
      vl *= Math.exp(-3 * dt);
    }

    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vx = nfx * vf + nfz * vl;
    this.vz = nfz * vf - nfx * vl;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // collisions
    this.lastImpact = 0;
    const p = { x: this.x, z: this.z };
    const hit = col.resolve(p, this.radius, this.y);
    if (hit) {
      this.x = p.x;
      this.z = p.z;
      const vn = this.vx * hit.nx + this.vz * hit.nz;
      if (vn < 0) {
        this.vx -= 1.35 * vn * hit.nx;
        this.vz -= 1.35 * vn * hit.nz;
        this.vx *= 0.85;
        this.vz *= 0.85;
        this.lastImpact = -vn;
        this.impactNormal = hit;
      }
    }

    // vertical
    const ground = heightAt(this.x, this.z);
    const prevGround = this._prevGround ?? ground;
    this._prevGround = ground;
    this.landed = 0;
    if (this.grounded) {
      const slopeV = (ground - prevGround) / Math.max(dt, 1e-3);
      const predicted = this.y + this.vy * dt - G * dt * dt;
      if (predicted > ground + 0.04 && this.vy > 1.2) {
        this.grounded = false;
        this.airT = 0;
        // ramps are spring-loaded. Physics is a suggestion.
        if (this._onRamp) this.vy *= 1.55;
      } else {
        this.y = ground;
        this.vy = clamp(slopeV, -12, 14);
      }
    }
    this._onRamp = rampHeight(this.x, this.z) > 0.05;
    if (!this.grounded) {
      this.vy -= G * dt;
      this.y += this.vy * dt;
      this.airT += dt;
      if (this.y <= ground) {
        this.landed = Math.max(0.1, -this.vy);
        this.y = ground;
        this.suspV -= Math.min(6, -this.vy * 0.6);
        this.vy = 0;
        this.grounded = true;
        this.lastAir = this.airT;
      }
    }

    // water: splashdown
    const wl = waterLevel(this.x, this.z);
    this.inWater = wl !== null && this.y < wl - 0.1;
    if (this.inWater && !this.sunk && this.grounded) this.sunk = true;
    if (this.sunk) this.y = Math.max(ground, this.y - dt * 0.6);

    this.syncMesh(dt, vf);
  }

  syncMesh(dt, vf = this.forwardSpeed) {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    if (dt > 0) {
      // pitch/roll from terrain under the wheels
      if (this.grounded) {
        const s = Math.sin(this.heading), c = Math.cos(this.heading);
        const hf = heightAt(this.x + s * 0.85, this.z + c * 0.85), hb = heightAt(this.x - s * 0.85, this.z - c * 0.85);
        const hl = heightAt(this.x + c * 0.55, this.z - s * 0.55), hr = heightAt(this.x - c * 0.55, this.z + s * 0.55);
        this.pitch = damp(this.pitch, -Math.atan2(hf - hb, 1.7), 18, dt);
        const lat = (this.vx * Math.cos(this.heading) - this.vz * Math.sin(this.heading));
        const turnRoll = clamp(vf * this.steerAng * 0.03, -0.12, 0.12);
        this.roll = damp(this.roll, Math.atan2(hl - hr, 1.1) + turnRoll + lat * 0.01, 10, dt);
      } else {
        this.pitch = damp(this.pitch, clamp(-this.vy * 0.04, -0.4, 0.4), 3, dt);
      }
      // suspension spring
      this.suspV += (-this.suspY * 160 - this.suspV * 9) * dt;
      this.suspY += this.suspV * dt;
      this.suspY = clamp(this.suspY, -0.25, 0.2);
      this.wheelRot += (vf / this.wheelR) * dt;
      for (const w of this.wheels) {
        w.spin.rotation.x = this.wheelRot;
        if (w.front) w.g.rotation.y = this.steerAng;
        if (w.g.userData.spinner) w.g.userData.spinner.rotation.x += dt * 6;
      }
      if (this.nuts) {
        // pendulum physics for the truck nuts. You're welcome.
        this.nutV = (this.nutV || 0) + (-(this.nuts.rotation.x) * 40 - (this.nutV || 0) * 1.5) * dt + (this._lastVf !== undefined ? (vf - this._lastVf) * 0.8 : 0) + this.suspV * dt * 3;
        this.nuts.rotation.x = clamp(this.nuts.rotation.x + this.nutV * dt, -1.2, 1.2);
      }
      this._lastVf = vf;
      if (this.sirenR && this.sirenOn) {
        const on = Math.floor(this.t * 6) % 2;
        this.sirenR.emissiveIntensity = on ? 4 : 0.2;
        this.sirenB.emissiveIntensity = on ? 0.2 : 4;
      } else if (this.sirenR) {
        this.sirenR.emissiveIntensity = this.sirenB.emissiveIntensity = 0.2;
      }
      if (this.neonMat) this.neonMat.opacity = 0.55 + Math.sin(this.t * 3) * 0.15;
      if (this.speakers && this.bass) this.speakers.scale.setScalar(1 + Math.max(0, Math.sin(this.t * 15)) * 0.08);
    }
    this.body.rotation.set(this.pitch, 0, this.roll);
    this.body.position.y = this.suspY;
  }

  setLights(on) {
    this.headMat.emissiveIntensity = on ? 3 : 0;
  }

  // world-space seat position
  seatWorld(side = 1) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const lx = 0.28 * side, lz = -0.28;
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c, y: this.y + this.lift + 0.02 };
  }

  exitPoint(side = 1) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const lx = 1.5 * side;
    return { x: this.x + lx * c, z: this.z - lx * s };
  }
}

export function seatCharacter(ch, cart, side = 1) {
  cart.chassis.add(ch.root);
  ch.root.position.set(0.28 * side, 0.9 - 0.85 + 0.0, -0.3);
  ch.root.rotation.set(0, 0, 0);
  ch.mode = 'sit';
}

export { lerp };
