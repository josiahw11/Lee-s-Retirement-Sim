// Unique Stunt Jumps and air tricks. Nine ramps around Sunset Palms each hide a stunt: hit it fast
// enough, clear the gap (or, for one of them, land in the pool) and it's banked forever, with a
// slow-motion side camera on the way. Any jump can also be a trick: hold SPACE + steer in the air to
// spin the cart, and land it straight for a 360 / 720 bonus. Land it crooked and you eat it.
import * as THREE from 'three';
import { RAMPS } from '../world/layout.js';
import { heightAt, waterAt } from '../world/terrain.js';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { audio } from '../core/audio.js';
import { pick, money } from '../core/utils.js';

// need = meters of air (measured from the lip, along the ramp) to clear the gap
export const STUNTS = [
  // stock cart
  { ramp: 'Grandkids Ramp', need: 5.5, pay: 100, blurb: 'A starter jump. The grandkids built it. The grandkids are not allowed back.' },
  { ramp: "Sal's Test Ramp", need: 5, pay: 100, blurb: 'Where Sal tests "suspension." Nobody asks follow-up questions.' },
  { ramp: 'Dumpster Dive', need: 7.5, pay: 100, blurb: 'Clear the dumpsters behind the Liquor Barrel. Or join the rest of the garbage.' },
  // needs Sal's governor removal
  { ramp: 'Lake Serenity Launch', need: 10.5, pay: 200, blurb: 'Clear the bank of Lake Serenity. Do not feed the fountain.' },
  { ramp: 'Gator Jump', need: 11, pay: 200, blurb: 'Long, flat and angry. Much like the gator.' },
  { ramp: 'Porta-Potty Leap', need: 10, pay: 200, blurb: 'Three porta-potties on Boca Beach. Occupied? Unknown. Clear them.' },
  { ramp: 'Pool Party Plunge', zone: 'pool', pay: 200, blurb: 'Land it IN the clubhouse pool. The lifeguard is 91. He will not intervene.' },
  // governor + nitrous
  { ramp: 'Rush Hour Leap', need: 13.5, pay: 400, blurb: 'Clear all four lanes of Palm Blvd. Nitrous recommended. Prayer mandatory.' },
  { ramp: 'Duck Pond Clearance', need: 19.5, pay: 500, blurb: 'The whole Duck Pond. Needs a governor AND nitrous. And a will.' },
];
for (const s of STUNTS) {
  const r = RAMPS.find((x) => x.name === s.ramp);
  s.r = r;
  s.id = r.name.toLowerCase().replace(/[^a-z]+/g, '-');
  s.sx = Math.sin(r.a); s.sz = Math.cos(r.a);
  s.lip = { x: r.x + s.sx * r.len, z: r.z + s.sz * r.len };
  s.x = r.x; s.z = r.z;
}

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
let propsBuilt = false;
const STAR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffb000, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.4 });

export class Stunts {
  constructor(g) {
    this.g = g;
    g.state.stunts ||= { done: [] };
    this.active = null;
    this.hold = 0;
    // gold stunt stars over every unfinished ramp
    const starGeo = mergeParts([
      [GEO.torus, '#ffd23f', mat4(0, 0, 0, 0, 0.9, 0.9, 0.5, Math.PI / 2)],
      [GEO.cone, '#ffe98a', mat4(0, 0.35, 0, 0, 0.3, 0.55, 0.3)],
      [GEO.cone, '#ffe98a', mat4(0, -0.35, 0, 0, 0.3, 0.55, 0.3, Math.PI)],
    ]);
    this.starGeo = starGeo;
    this.stars = STUNTS.map((s) => {
      const m = new THREE.Mesh(starGeo, STAR_MAT);
      m.position.set(s.x - s.sx * 3, heightAt(s.x, s.z) + 4.2, s.z - s.sz * 3);
      g.scene.add(m);
      return m;
    });
    this.buildProps();
  }

  get done() { return this.g.state.stunts.done; }
  pending() { return STUNTS.filter((s) => !this.done.includes(s.id)); }

  // things to jump over (and to crash into when you come up short)
  buildProps() {
    if (propsBuilt) return;
    propsBuilt = true;
    const g = this.g, col = g.world.col;
    const parts = [];
    const potty = RAMPS.find((r) => r.name === 'Porta-Potty Leap');
    for (let i = -1; i <= 1; i++) {
      const x = potty.x + i * 1.5, z = potty.z + potty.len + 7;
      const y = heightAt(x, z);
      const c = ['#3c7dd9', '#2f9e5b', '#e0e0e0'][i + 1];
      parts.push([GEO.box, c, mat4(x, y + 1.15, z, 0, 1.3, 2.3, 1.3)]);
      parts.push([GEO.box, '#f4f4f4', mat4(x, y + 2.35, z, 0, 1.36, 0.12, 1.36)]);
      parts.push([GEO.box, '#1d1d1d', mat4(x, y + 1.9, z - 0.66, 0, 0.5, 0.12, 0.02)]); // OCCUPIED slot
      col.addBox(x - 0.65, z - 0.65, x + 0.65, z + 0.65, y + 2.4, 'potty');
    }
    const dump = RAMPS.find((r) => r.name === 'Dumpster Dive');
    for (let i = -1; i <= 1; i++) {
      const x = dump.x + dump.len + 5.2, z = dump.z + i * 2.1;
      const y = heightAt(x, z);
      parts.push([GEO.box, '#2e6b3d', mat4(x, y + 0.7, z, 0, 1.3, 1.4, 1.9)]);
      parts.push([GEO.box, '#1f4a2a', mat4(x + 0.1, y + 1.45, z, 0, 1.4, 0.1, 2.0, 0, 0.25)]); // lid
      col.addBox(x - 0.65, z - 0.95, x + 0.65, z + 0.95, y + 1.5, 'dumpster');
    }
    const mesh = new THREE.Mesh(mergeParts(parts), M.vc);
    mesh.castShadow = mesh.receiveShadow = true;
    g.scene.add(mesh);
  }

  update(dt) {
    const g = this.g;
    const t = performance.now() / 1000;
    this.stars.forEach((m, i) => {
      m.visible = !this.done.includes(STUNTS[i].id);
      m.rotation.y = t * 1.6 + i;
      m.position.y = heightAt(STUNTS[i].x, STUNTS[i].z) + 4.2 + Math.sin(t * 2 + i) * 0.25;
    });
    const p = g.player;
    const pc = p.cart;
    if (this.hold > 0) {
      this.hold -= dt;
      const cin = g.camRig.cinematic;
      if (cin && cin === this.cin && p.cart) cin.look.lerp(new cin.look.constructor(p.cart.x, p.cart.y + 0.6, p.cart.z), 0.2);
      if (this.hold <= 0 && !this.active) { if (g.camRig.cinematic === this.cin) g.camRig.cinematic = null; this.cin = null; g.slowmoScale = null; }
    }
    if (!pc || g.ui.modal) { if (this.active) this.abort(); this.wasGrounded = true; return; }

    // ---- takeoff
    if (pc.grounded && !pc.sunk) this.lastGround = { x: pc.x, z: pc.z };
    if (this.wasGrounded && !pc.grounded && !this.active && this.lastGround) {
      const s = STUNTS.find((s) => {
        const dx = this.lastGround.x - s.r.x, dz = this.lastGround.z - s.r.z;
        const u = dx * s.sx + dz * s.sz, v = dx * s.sz - dz * s.sx;
        return u > s.r.len - 3.5 && u < s.r.len + 1 && Math.abs(v) < s.r.w / 2 + 0.6;
      });
      if (s && (pc.vx * s.sx + pc.vz * s.sz) > 5) this.launch(s, pc);
    }
    this.wasGrounded = pc.grounded;

    // ---- in the air
    const a = this.active;
    if (a) {
      a.t += dt;
      if (pc.lastImpact > 1) a.clipped = true;
      g.slowmo = Math.max(g.slowmo || 0, 0.05);
      g.slowmoScale = 0.42;
      const cin = g.camRig.cinematic;
      if (cin && cin === this.cin) cin.look.lerp(new cin.look.constructor(pc.x, pc.y + 0.6, pc.z), 0.35); // only steer our own camera
      if (pc.grounded || pc.sunk || a.t > 5) this.land(pc);
    }
    if (pc.landed && !a) this.trick(pc); // ordinary jumps still score tricks
  }

  launch(s, pc) {
    const g = this.g;
    this.active = { s, t: 0, clipped: false };
    this.hold = 0;
    // side camera, level with the peak of the jump, looking across the gap
    const mid = s.zone === 'pool' ? 7 : (s.need || 10) * 0.55;
    const side = 11 + (s.need || 10) * 0.3;
    const cx = s.lip.x + s.sx * mid + s.sz * side, cz = s.lip.z + s.sz * mid - s.sx * side;
    const V = g.camRig.cam.position.constructor;
    if (g.camRig.cinematic && g.camRig.cinematic !== this.cin) { this.cin = null; return; } // something else has the camera: no stunt cam
    this.cin = g.camRig.cinematic = { pos: new V(cx, heightAt(cx, cz) + 3.4, cz), look: new V(pc.x, pc.y + 0.6, pc.z) };
    g.camRig.cam.position.set(cx, heightAt(cx, cz) + 3.4, cz); // cut, don't pan
    const n = this.done.includes(s.id) ? '' : 'UNIQUE ';
    g.ui.splash(`${n}STUNT JUMP`, s.ramp, 1.2, '#ffd23f');
    audio.play('whistle', { vol: 0.6 });
  }

  land(pc) {
    const g = this.g;
    const a = this.active;
    this.active = null;
    this.hold = 1.1;
    const s = a.s;
    const dist = (pc.x - s.lip.x) * s.sx + (pc.z - s.lip.z) * s.sz;
    let ok, why;
    if (s.zone === 'pool') {
      ok = pc.sunk && waterAt(pc.x, pc.z) === 'pool';
      why = ok ? 'CANNONBALL!' : 'You were supposed to land IN the pool.';
    } else {
      ok = !pc.sunk && !a.clipped && dist >= s.need && Math.abs(wrap(pc.spinLanded || 0)) < 0.8;
      why = pc.sunk ? 'Straight into the drink.' : a.clipped ? 'Clipped it. Ouch.' : dist < s.need ? `${dist.toFixed(1)} m of ${s.need} m. So close. Not really.` : 'Crooked landing.';
    }
    const trick = this.trick(pc, true);
    if (!ok) { g.ui.splash('STUNT JUMP FAILED', why, 2, '#ff6b6b'); return; }
    const first = !this.done.includes(s.id);
    if (first) {
      this.done.push(s.id);
      g.state.counters.stuntsDone = (g.state.counters.stuntsDone || 0) + 1;
      g.addMoney(s.pay, 'Unique stunt jump');
      g.xp('stat', 2);
      g.achievement('stuntman');
      if (this.done.length === STUNTS.length) { g.achievement('knievel'); g.addMoney(1000, 'Every stunt jump in Sunset Palms'); }
      audio.play('levelup');
    } else audio.play('success');
    g.ui.splash(first ? 'UNIQUE STUNT JUMP COMPLETED' : 'STUNT JUMP', `${s.ramp} • ${this.done.length}/${STUNTS.length}${first ? ` • +${money(s.pay)}` : ''}${trick ? ` • ${trick}` : ''}`, 2.6, '#ffd23f');
    if (first) g.celebrate?.(8, pc.x, pc.z);
    for (const n of g.npcs) if (n.visible && !n.cart && Math.hypot(n.x - pc.x, n.z - pc.z) < 22 && Math.random() < 0.5) n.say(pick(['WHAT IN THE—', 'Evel Knievel?!', 'My pacemaker!', 'I\'m calling the HOA!', 'DO IT AGAIN!']), 2);
  }

  abort() {
    this.active = null;
    if (this.g.camRig.cinematic === this.cin) this.g.camRig.cinematic = null;
    this.cin = null;
    this.g.slowmoScale = null;
  }

  // air spins: resolved on landing. Returns a label for the stunt banner (quiet mode) or shows its own.
  trick(pc, quiet = false) {
    const spin = pc.spinLanded || 0;
    pc.spinLanded = 0;
    const n = Math.round(Math.abs(spin) / TAU);
    const clean = Math.abs(wrap(spin)) < 0.8;
    const g = this.g;
    if (Math.abs(spin) < 2.4) return '';
    if (!clean) {
      if (!quiet) g.ui.splash('BOTCHED!', 'Land it straight next time. Your hip says hi.', 1.4, '#ff6b6b');
      audio.play('crash', { vol: 0.7 });
      g.camRig.addShake(0.6);
      return '';
    }
    if (n < 1) return '';
    const label = `${n * 360}°${n >= 3 ? ' INSANE' : ''}`;
    const pay = 40 * n * n;
    g.addMoney(pay, 'Air trick');
    g.xp('stat', 0.5 * n);
    g.state.counters.bestSpin = Math.max(g.state.counters.bestSpin || 0, n);
    if (n >= 2) g.achievement('spin720');
    if (!quiet) g.ui.splash(label + '!', `${pick(['Stuck it!', 'Tony Hawk\'s grandpa!', 'Clean!', 'The hip held!'])} +${money(pay)}`, 1.6, '#4cc9f0');
    audio.play('success', { vol: 0.6 });
    return `${label} +${money(pay)}`;
  }

  clear() {
    for (const m of this.stars) this.g.scene.remove(m);
    this.stars = [];
    this.starGeo?.dispose();
    if (this.active) this.abort();
  }
}
