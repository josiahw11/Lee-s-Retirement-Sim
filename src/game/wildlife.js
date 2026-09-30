// Florida wildlife: flocks of white ibises strutting across the lawns (they scatter when you get close),
// and residents walking poodles and chihuahuas on leashes. Deck a dog's owner and the chihuahua
// comes for your ankles.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { HOUSES } from '../world/layout.js';
import { heightAt, waterAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { rand, pick, chance, damp, dampAngle, clamp } from '../core/utils.js';

// ---------------------------------------------------------------- ibis
let IBIS = null;
function ibisGeo() {
  if (IBIS) return IBIS;
  // curved orange beak from three short cones
  const beak = [];
  for (let i = 0; i < 3; i++) beak.push([GEO.cone, '#e8603c', mat4(0, 0.64 - i * 0.045, 0.3 + i * 0.07, 0, 0.022 - i * 0.004, 0.1, 0.022 - i * 0.004, Math.PI / 2 + 0.35 + i * 0.3)]);
  IBIS = {
    body: mergeParts([
      [GEO.sph, '#f7f7f2', mat4(0, 0.42, 0, 0, 0.14, 0.12, 0.24)],
      [GEO.sph, '#f7f7f2', mat4(0, 0.4, -0.2, 0, 0.1, 0.07, 0.12, 0.3)], // tail
      [GEO.cyl, '#f7f7f2', mat4(0, 0.54, 0.16, 0, 0.035, 0.18, 0.035, 0.5)], // neck
      [GEO.sph, '#f2d6c9', mat4(0, 0.64, 0.23, 0, 0.055, 0.05, 0.06)], // bare red-pink face
      [GEO.sph, '#111', mat4(0.03, 0.66, 0.26, 0, 0.012, 0.012, 0.012)],
      [GEO.sph, '#111', mat4(-0.03, 0.66, 0.26, 0, 0.012, 0.012, 0.012)],
      ...beak,
      [GEO.cyl, '#e8603c', mat4(0.05, 0.16, 0, 0, 0.012, 0.32, 0.012)],
      [GEO.cyl, '#e8603c', mat4(-0.05, 0.16, 0, 0, 0.012, 0.32, 0.012)],
    ]),
    wing: mergeParts([
      [GEO.box, '#f7f7f2', mat4(0.2, 0, 0, 0, 0.4, 0.02, 0.2)],
      [GEO.box, '#1c1c1c', mat4(0.43, 0, -0.02, 0, 0.08, 0.021, 0.16)], // black wingtips
    ]),
  };
  return IBIS;
}

class Ibis {
  constructor(scene, x, z) {
    const g = ibisGeo();
    this.root = new THREE.Group();
    this.body = new THREE.Mesh(g.body, M.vc);
    this.body.castShadow = true;
    this.root.add(this.body);
    this.wL = new THREE.Mesh(g.wing, M.vc);
    this.wR = new THREE.Mesh(g.wing, M.vc);
    this.wR.scale.x = -1;
    for (const w of [this.wL, this.wR]) { w.position.set(0, 0.47, 0); w.visible = false; this.root.add(w); }
    scene.add(this.root);
    this.x = x; this.z = z; this.y = heightAt(x, z);
    this.h = rand(0, 6.28);
    this.state = 'walk';
    this.t = rand(0, 3);
    this.peck = 0;
    this.tx = x; this.tz = z;
  }
}

// lawns where ibises like to forage
function lawnSpot() {
  const h = pick(HOUSES);
  const l = h.lawn || { x: h.x, z: h.z + 12 }; // front lawn center (set by the world builder)
  return { x: l.x + rand(-4, 4), z: l.z + rand(-2, 2) };
}

export class Wildlife {
  constructor(g) {
    this.g = g;
    this.ibises = [];
    this.dogs = [];
    for (let f = 0; f < 6; f++) {
      const c = lawnSpot();
      const n = 3 + Math.floor(Math.random() * 4);
      const flock = { cx: c.x, cz: c.z };
      for (let i = 0; i < n; i++) {
        const b = new Ibis(g.scene, c.x + rand(-3, 3), c.z + rand(-3, 3));
        b.flock = flock;
        this.ibises.push(b);
      }
    }
    // a few residents walk their dogs
    const walkers = g.npcs.filter((n) => n.role === 'resident' && n.state === 'wander' && !n.cart).slice(0, 7);
    for (const n of walkers) this.dogs.push(new Dog(g, n, pick(['poodle', 'poodle', 'chihuahua', 'chihuahua', 'dachshund'])));
  }

  update(dt) {
    const g = this.g;
    const p = g.player;
    const px = p.cart ? p.cart.x : p.x, pz = p.cart ? p.cart.z : p.z;
    const scare = p.cart ? 11 : 5;
    const cam = g.camera.position;
    for (const b of this.ibises) {
      const dCam = Math.abs(b.x - cam.x) + Math.abs(b.z - cam.z);
      b.root.visible = dCam < 150;
      if (!b.root.visible && b.state !== 'fly') continue;
      b.t += dt;
      const dp = Math.hypot(b.x - px, b.z - pz);
      if (b.state !== 'fly' && dp < scare) {
        // the whole flock bolts
        const dest = lawnSpot();
        for (const o of this.ibises) if (o.flock === b.flock && o.state !== 'fly') { o.state = 'fly'; o.vy = rand(4, 6); o.dest = { x: dest.x + rand(-3, 3), z: dest.z + rand(-3, 3) }; o.t = 0; }
        b.flock.cx = dest.x; b.flock.cz = dest.z;
        if (dp < 20) audio.tone({ freq: 700, to: 500, type: 'square', dur: 0.08, vol: 0.05 });
      }
      if (b.state === 'fly') {
        const dx = b.dest.x - b.x, dz = b.dest.z - b.z, d = Math.hypot(dx, dz);
        const gy = heightAt(b.x, b.z);
        const cruise = gy + (d > 8 ? 9 : 0.1);
        b.vy = damp(b.vy, (cruise - b.y) * 1.5, 2, dt);
        b.y += b.vy * dt;
        const sp = Math.min(9, d * 1.5);
        if (d > 0.3) { b.x += (dx / d) * sp * dt; b.z += (dz / d) * sp * dt; b.h = dampAngle(b.h, Math.atan2(dx, dz), 4, dt); }
        const flap = Math.sin(b.t * (d > 8 ? 11 : 16));
        b.wL.visible = b.wR.visible = true;
        b.wL.rotation.z = flap * 0.9; b.wR.rotation.z = -flap * 0.9;
        if (d < 0.4 && b.y - gy < 0.3) { b.state = 'walk'; b.y = gy; b.wL.visible = b.wR.visible = false; }
      } else {
        // strut and peck around the flock center
        b.peck = Math.max(0, b.peck - dt);
        if (b.peck <= 0 && chance(dt * 0.6)) b.peck = rand(0.6, 1.4);
        const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
        if (d < 0.3 || chance(dt * 0.2)) { b.tx = b.flock.cx + rand(-4, 4); b.tz = b.flock.cz + rand(-4, 4); }
        if (b.peck <= 0 && d > 0.3) {
          b.x += (dx / d) * 0.45 * dt; b.z += (dz / d) * 0.45 * dt;
          b.h = dampAngle(b.h, Math.atan2(dx, dz), 3, dt);
        }
        if (waterAt(b.x, b.z)) { b.tx = b.flock.cx; b.tz = b.flock.cz; }
        b.y = heightAt(b.x, b.z);
      }
      b.root.position.set(b.x, b.y + (b.state === 'walk' ? Math.abs(Math.sin(b.t * 7)) * 0.02 : 0), b.z);
      b.root.rotation.y = b.h;
      b.body.rotation.x = b.state === 'walk' && b.peck > 0 ? Math.sin(Math.min(1, b.peck) * Math.PI) * 0.55 : 0;
    }
    for (const d of this.dogs) d.update(dt);
    this.dogs = this.dogs.filter((d) => !d.gone);
  }

  clear() {
    for (const b of this.ibises) this.g.scene.remove(b.root);
    for (const d of this.dogs) d.remove();
    this.ibises = [];
    this.dogs = [];
  }
}

// ---------------------------------------------------------------- dogs
const DOG_LOOK = {
  poodle: { col: '#f4f1ea', size: 0.9 },
  chihuahua: { col: '#d9a66b', size: 0.6 },
  dachshund: { col: '#6b3a1f', size: 0.75 },
};
const dogGeos = new Map();
function dogGeo(kind) {
  if (dogGeos.has(kind)) return dogGeos.get(kind);
  const c = DOG_LOOK[kind].col;
  let parts;
  if (kind === 'poodle') {
    parts = [
      [GEO.sph, c, mat4(0, 0.36, 0, 0, 0.13, 0.12, 0.2)],
      [GEO.sph, c, mat4(0, 0.4, -0.2, 0, 0.1, 0.1, 0.1)], // puffy haunch
      [GEO.sph, c, mat4(0, 0.6, 0.18, 0, 0.09, 0.1, 0.09)], // head poof
      [GEO.sph, c, mat4(0, 0.55, 0.28, 0, 0.045, 0.04, 0.07)], // snout
      [GEO.sph, '#222', mat4(0, 0.56, 0.35, 0, 0.018, 0.016, 0.016)],
      [GEO.sph, c, mat4(0, 0.5, -0.32, 0, 0.05, 0.05, 0.05)], // pom-pom tail
      [GEO.sph, '#ff9ec7', mat4(0, 0.66, 0.17, 0, 0.03, 0.02, 0.03)], // bow
    ];
  } else if (kind === 'chihuahua') {
    parts = [
      [GEO.sph, c, mat4(0, 0.26, 0, 0, 0.08, 0.075, 0.13)],
      [GEO.sph, c, mat4(0, 0.38, 0.13, 0, 0.07, 0.065, 0.07)],
      [GEO.sph, '#f0d5b0', mat4(0, 0.35, 0.19, 0, 0.03, 0.028, 0.04)],
      [GEO.cone, c, mat4(0.05, 0.47, 0.12, 0, 0.035, 0.1, 0.02, 0, -0.5)], // giant ears
      [GEO.cone, c, mat4(-0.05, 0.47, 0.12, 0, 0.035, 0.1, 0.02, 0, 0.5)],
      [GEO.sph, '#111', mat4(0.03, 0.4, 0.18, 0, 0.014, 0.016, 0.012)],
      [GEO.sph, '#111', mat4(-0.03, 0.4, 0.18, 0, 0.014, 0.016, 0.012)],
      [GEO.cyl, c, mat4(0, 0.33, -0.14, 0, 0.012, 0.12, 0.012, -0.8)],
      [GEO.box, '#e84a5f', mat4(0, 0.29, 0.03, 0, 0.13, 0.1, 0.16)], // little sweater
    ];
  } else {
    parts = [
      [GEO.cyl, c, mat4(0, 0.2, 0, 0, 0.07, 0.42, 0.07, Math.PI / 2)],
      [GEO.sph, c, mat4(0, 0.2, 0.22, 0, 0.07, 0.07, 0.07)],
      [GEO.sph, c, mat4(0, 0.2, -0.22, 0, 0.07, 0.07, 0.07)],
      [GEO.sph, c, mat4(0, 0.28, 0.3, 0, 0.06, 0.06, 0.08)],
      [GEO.sph, c, mat4(0, 0.25, 0.39, 0, 0.03, 0.03, 0.06)],
      [GEO.sph, '#111', mat4(0, 0.26, 0.45, 0, 0.015, 0.013, 0.013)],
      [GEO.sph, '#4a2a14', mat4(0.06, 0.24, 0.3, 0, 0.02, 0.07, 0.04)],
      [GEO.sph, '#4a2a14', mat4(-0.06, 0.24, 0.3, 0, 0.02, 0.07, 0.04)],
      [GEO.cyl, c, mat4(0, 0.24, -0.31, 0, 0.012, 0.14, 0.012, -1.0)],
    ];
  }
  const legs = mergeParts([[GEO.cyl, kind === 'poodle' ? c : c, mat4(0, -0.08, 0, 0, 0.02, 0.16, 0.02)]]);
  const g = { body: mergeParts(parts), leg: legs };
  dogGeos.set(kind, g);
  return g;
}

class Dog {
  constructor(g, owner, kind) {
    this.g = g;
    this.owner = owner;
    this.kind = kind;
    const geo = dogGeo(kind);
    this.root = new THREE.Group();
    const body = new THREE.Mesh(geo.body, M.vc);
    body.castShadow = true;
    this.root.add(body);
    const s = DOG_LOOK[kind];
    const legH = kind === 'dachshund' ? 0.13 : kind === 'chihuahua' ? 0.2 : 0.27;
    const lz = kind === 'dachshund' ? 0.18 : kind === 'chihuahua' ? 0.08 : 0.12;
    this.legs = [];
    for (const [x, z] of [[0.05, lz], [-0.05, lz], [0.05, -lz], [-0.05, -lz]]) {
      const l = new THREE.Mesh(geo.leg, M.vc);
      l.position.set(x, legH, z);
      l.scale.y = legH / 0.16;
      this.root.add(l);
      this.legs.push(l);
    }
    this.root.scale.setScalar(s.size + 0.3);
    g.scene.add(this.root);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.leash = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: pick([0xe84a5f, 0x23408e, 0xf2c94c]) }));
    this.leash.frustumCulled = false;
    g.scene.add(this.leash);
    this.x = owner.x + 1; this.z = owner.z; this.h = 0;
    this.t = rand(0, 3);
    this.barkT = 0;
    this.angry = false;
  }

  update(dt) {
    const g = this.g;
    const o = this.owner;
    const p = g.player;
    this.t += dt;
    if (!g.npcs.includes(o) || o.cart) return this.remove();
    const vis = o.visible !== false;
    this.root.visible = vis;
    this.leash.visible = vis && !this.angry;
    // owner knocked out by the player: the little one attacks
    if (o.state === 'ko' && !this.angry && Math.hypot(p.x - o.x, p.z - o.z) < 12) {
      this.angry = this.kind !== 'poodle'; // poodles are above this
      if (this.angry) o.say?.(pick(['GET HIM, PEANUT!', 'SIC HIM, TACO!']), 2);
    }
    let tx, tz, speed;
    if (this.angry) {
      tx = p.x; tz = p.z; speed = 5.5;
      const d = Math.hypot(tx - this.x, tz - this.z);
      this.barkT -= dt;
      if (d < 0.9 && this.barkT <= 0 && !p.cart) {
        this.barkT = 0.7;
        g.damagePlayer(1, this.x, this.z, 0.6);
        g.ui.float(p.x, p.y + 1.2, p.z, pick(['CHOMP!', 'YIP YIP!', 'MY ANKLE!']), '#ffd23f', 0.8);
        this.yip();
      }
      if (o.state !== 'ko' || Math.hypot(p.x - o.x, p.z - o.z) > 30) this.angry = false;
      // kicked away by a swing
      if (p.swing && d < 1.6) { this.angry = false; this.x += (this.x - p.x) * 3; this.z += (this.z - p.z) * 3; this.yip(); g.ui.float(this.x, 1, this.z, 'YELP!', '#fff', 0.8); }
    } else {
      // heel behind the owner's left side, at leash length
      const ohx = Math.sin(o.heading), ohz = Math.cos(o.heading);
      tx = o.x - ohx * 0.9 + ohz * 0.6;
      tz = o.z - ohz * 0.9 - ohx * 0.6;
      speed = Math.max(1.2, (o.char.speed || 1) * 1.3);
      // yap at the player
      this.barkT -= dt;
      if (this.barkT <= 0 && Math.hypot(p.x - this.x, p.z - this.z) < 5 && this.kind !== 'poodle' && vis) {
        this.barkT = rand(1.2, 2.5);
        this.yip();
      }
    }
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const moving = d > 0.25;
    if (moving) {
      const sp = Math.min(speed, d * 3);
      this.x += (dx / d) * sp * dt; this.z += (dz / d) * sp * dt;
      this.h = dampAngle(this.h, Math.atan2(dx, dz), 8, dt);
    }
    const y = heightAt(this.x, this.z);
    this.root.position.set(this.x, y + (moving ? Math.abs(Math.sin(this.t * 14)) * 0.03 : 0), this.z);
    this.root.rotation.y = this.h;
    for (let i = 0; i < 4; i++) this.legs[i].rotation.x = moving ? Math.sin(this.t * 14 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0;
    // leash from the owner's hand to the collar
    if (this.leash.visible) {
      const a = this.leash.geometry.attributes.position;
      const ohx = Math.sin(o.heading), ohz = Math.cos(o.heading);
      a.setXYZ(0, o.x + ohz * 0.28, o.y + 0.85, o.z - ohx * 0.28);
      a.setXYZ(1, this.x, y + 0.35 * this.root.scale.y, this.z);
      a.needsUpdate = true;
    }
  }

  yip() {
    const p = this.g.player;
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (d > 25) return;
    const f = this.kind === 'chihuahua' ? 1500 : 900;
    const v = clamp(1 - d / 25, 0.1, 1) * 0.08;
    audio.tone({ freq: f, to: f * 0.7, type: 'square', dur: 0.07, vol: v });
    audio.tone({ freq: f, to: f * 0.7, type: 'square', dur: 0.07, vol: v, at: 0.12 });
    if (chance(0.3)) this.g.ui.float(this.x, heightAt(this.x, this.z) + 0.8, this.z, 'YIP!', '#ffffff', 0.7);
  }

  remove() {
    this.gone = true;
    this.g.scene.remove(this.root);
    this.g.scene.remove(this.leash);
    this.leash.geometry.dispose();
  }
}
