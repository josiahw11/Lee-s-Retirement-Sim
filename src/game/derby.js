// BUMPER BRAWL — a nightly golf-cart demolition derby in the dirt lot behind the commercial strip.
// Derby Dan hands you a beater; five local lunatics try to T-bone you. Front bumpers are armored,
// sides crumple. Damaged carts smoke, then burn, then die. Last cart running takes the purse.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { heightAt } from '../world/terrain.js';
import { makeSignTexture } from '../gfx/textures.js';
import { audio } from '../core/audio.js';
import { clamp, rand, pick, money, wrapAngle } from '../core/utils.js';

export const ARENA = { x: 205, z: -14, w: 44, d: 40 };
const DAN = { x: 205, z: -37 };
const RIVALS = [
  ['"Crash" Carmichael', '#8a2b2b'], ['Wanda the Wrecker', '#3a6b3a'], ['Old Man Pruitt', '#6b5a2a'],
  ['Dolores "Demolition" Diaz', '#5a2a6b'], ['Big Hank', '#2a4a6b'],
];
const LEN = 120;
let arenaBuilt = false;

export function buildArena(g) {
  if (arenaBuilt) return;
  arenaBuilt = true;
  const A = ARENA, y = heightAt(A.x, A.z);
  // dirt floor with old tire scars
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#8a6a48'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '60,40,25' : '170,140,100'},${Math.random() * 0.25})`; x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  x.strokeStyle = 'rgba(40,28,18,0.35)'; x.lineWidth = 5;
  for (let i = 0; i < 14; i++) { x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 30 + Math.random() * 80, Math.random() * 6, Math.random() * 6 + 2); x.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(A.w, A.d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  floor.position.set(A.x, y + 0.03, A.z);
  floor.receiveShadow = true;
  g.scene.add(floor);
  // hay-bale walls, two high
  const parts = [];
  const x0 = A.x - A.w / 2, x1 = A.x + A.w / 2, z0 = A.z - A.d / 2, z1 = A.z + A.d / 2;
  const bale = (bx, bz, ry, row) => parts.push([GEO.box, row ? '#d9b86a' : '#c9a456', mat4(bx, y + 0.4 + row * 0.8, bz, ry + rand(-0.04, 0.04), 1.25, 0.8, 0.8)]);
  for (let row = 0; row < 2; row++) {
    for (let bx = x0 + 0.6; bx < x1; bx += 1.3) { bale(bx, z0, 0, row); bale(bx, z1, 0, row); }
    for (let bz = z0 + 0.6; bz < z1; bz += 1.3) { bale(x0, bz, Math.PI / 2, row); bale(x1, bz, Math.PI / 2, row); }
  }
  // floodlights at the corners
  for (const [lx, lz] of [[x0 - 1.5, z0 - 1.5], [x1 + 1.5, z0 - 1.5], [x0 - 1.5, z1 + 1.5], [x1 + 1.5, z1 + 1.5]]) {
    parts.push([GEO.cyl, '#7a7a7a', mat4(lx, y + 4.5, lz, 0, 0.12, 9, 0.12)]);
    parts.push([GEO.box, '#333', mat4(lx, y + 9.1, lz, Math.atan2(A.x - lx, A.z - lz), 1.6, 0.5, 0.4)]);
  }
  const walls = new THREE.Mesh(mergeParts(parts), M.vc);
  walls.castShadow = walls.receiveShadow = true;
  g.scene.add(walls);
  for (const [lx, lz] of [[x0 - 1.5, z0 - 1.5], [x1 + 1.5, z0 - 1.5], [x0 - 1.5, z1 + 1.5], [x1 + 1.5, z1 + 1.5]]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.3), M.lamp);
    lamp.position.set(lx, y + 8.8, lz);
    lamp.rotation.y = Math.atan2(A.x - lx, A.z - lz);
    g.scene.add(lamp);
  }
  const col = g.world.col;
  col.addBox(x0 - 0.5, z0 - 0.5, x1 + 0.5, z0 + 0.4, y + 1.6, 'hay');
  col.addBox(x0 - 0.5, z1 - 0.4, x1 + 0.5, z1 + 0.5, y + 1.6, 'hay');
  col.addBox(x0 - 0.5, z0 - 0.5, x0 + 0.4, z1 + 0.5, y + 1.6, 'hay');
  col.addBox(x1 - 0.4, z0 - 0.5, x1 + 0.5, z1 + 0.5, y + 1.6, 'hay');
  // sign facing Fairway Dr
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: makeSignTexture('BUMPER BRAWL', { bg: '#1d1d1d', fg: '#ff6b1a', font: 'bold 80px Impact, sans-serif', sub: 'NIGHTLY 5PM–1AM • NO REFUNDS • NO HIPS', subFont: 'bold 26px sans-serif', w: 512, h: 128 }), roughness: 0.7, emissive: 0x331100 }));
  sign.position.set(A.x, y + 2.6, z0 - 0.62);
  sign.rotation.y = Math.PI;
  g.scene.add(sign);
  for (const sx of [-2.6, 2.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), new THREE.MeshStandardMaterial({ color: 0x555555 }));
    post.position.set(A.x + sx, y + 1.3, z0 - 0.6);
    g.scene.add(post);
  }
}

// the rivals' brains: pick a victim, lead them, floor it; back up when stuck
class DerbyDriver {
  constructor(derby, cart) {
    this.derby = derby;
    this.cart = cart;
    this.speed = 0;
    this.honkNow = false;
    this.repathT = 0;
    this.revT = 0;
    this.stuckT = 0;
    this.retargetT = 0;
    this.target = null;
    this.aggro = rand(0.7, 1.15);
  }

  routeTo() {}

  control(dt) {
    const c = this.cart, d = this.derby;
    if (d.phase !== 'fight' || c.derby.hp <= 0) return { throttle: 0, steer: 0, handbrake: true };
    this.retargetT -= dt;
    if (this.retargetT <= 0 || !this.target || this.target.derby.hp <= 0) {
      const alive = d.carts.filter((o) => o !== c && o.derby.hp > 0);
      const score = (o) => Math.hypot(o.x - c.x, o.z - c.z) * (o === d.mine ? 0.85 : 1) + rand(0, 12);
      this.target = alive.sort((a, b) => score(a) - score(b))[0] || null;
      this.retargetT = rand(2.5, 5);
    }
    const t = this.target;
    if (!t) return { throttle: 0, steer: 0 };
    const dist = Math.hypot(t.x - c.x, t.z - c.z);
    const lead = clamp(dist / 14, 0, 0.7);
    const want = Math.atan2(t.x + t.vx * lead - c.x, t.z + t.vz * lead - c.z);
    const err = wrapAngle(want - c.heading);
    // stalled (against the bales, or pushing a pinned cart): back off for a fresh run-up
    if (c.speed < 0.8) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > (dist < 3.2 ? 0.8 : 1.1)) { this.revT = rand(0.9, 1.4); this.stuckT = 0; }
    if (this.revT > 0) { this.revT -= dt; return { throttle: -1, steer: -Math.sign(err) || 1 }; }
    return { throttle: (Math.abs(err) > 2 ? 0.45 : 1) * this.aggro, steer: clamp(err * 2.2, -1, 1), handbrake: Math.abs(err) > 1.3 && c.speed > 5 };
  }
}

export class Derby {
  constructor(g) {
    this.g = g;
    this.phase = 'idle';
    this.carts = [];
    this.drivers = [];
    this.crowd = [];
    this.dan = g.spawnNPC({ name: 'Derby Dan', female: false, role: 'derbyman', x: DAN.x, z: DAN.z, state: 'static', look: { hat: 'cap', hatColor: '#ff6b1a', shirt: 7, mustache: true, belly: 1.5, glasses: 'aviator' }, homePt: { x: DAN.x, z: DAN.z } });
    this.dan.data.face = Math.PI;
    this.dan.data.quiet = true;
    let el = document.getElementById('derby-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'derby-hud';
      el.className = 'hidden';
      document.getElementById('hud').appendChild(el);
    }
    this.hud = el;
  }

  open() {
    const h = this.g.state.minutes / 60;
    return h >= 17 || h < 1;
  }

  // ---------------------------------------------------------------- run
  start(fee) {
    const g = this.g, A = ARENA, p = g.player;
    g.spend(fee);
    this.fee = fee;
    this.phase = 'count';
    this.t = 0;
    this.clock = LEN;
    this.dealt = 0;
    this.order = [];
    g.fadeOut(() => {
      if (p.cart) p.exitCart();
      const y = heightAt(A.x, A.z);
      const spots = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        spots.push({ x: A.x + Math.sin(a) * (A.w / 2 - 5), z: A.z + Math.cos(a) * (A.d / 2 - 5), ry: a + Math.PI });
      }
      this.carts = spots.map((s, i) => {
        const c = g.addCart({ x: s.x, z: s.z, ry: s.ry, kind: 'club', color: i === 0 ? '#e8e0d0' : RIVALS[i - 1][1] });
        c.y = y; c.derby = { hp: 100, i, name: i === 0 ? 'You' : RIVALS[i - 1][0], smokeT: 0 };
        c.derbySpot = s;
        return c;
      });
      this.mine = this.carts[0];
      p.enterCart(this.mine);
      g.announceRadio();
      this.drivers = this.carts.slice(1).map((c, i) => {
        const n = g.spawnNPC({ name: RIVALS[i][0], female: RIVALS[i][0].includes('Wanda') || RIVALS[i][0].includes('Dolores'), role: 'derby', x: c.x, z: c.z, look: { hat: pick(['cap', 'bucket', 'visor']), glasses: pick(['aviator', 'big']) } });
        n.data.quiet = true;
        n.seatIn(c, new DerbyDriver(this, c));
        return n;
      });
      // the crowd along the north bales
      const pool = g.npcs.filter((n) => n.role === 'resident' && !n.cart && !n.hostile && !n.data.hasDog && !n.data.aqua && !n.data.hail && !n.data.riding && !n.talking).slice(0, 8);
      this.crowd = pool.map((n, i) => {
        n.data.prevState = n.state;
        n.x = A.x - 10 + i * 2.8 + rand(-0.4, 0.4); n.z = A.z - A.d / 2 - 2.2;
        n.state = 'party';
        n.data.face = 0;
        n.char.root.position.set(n.x, heightAt(n.x, n.z), n.z);
        n.char.root.rotation.y = 0;
        return n;
      });
      const V = g.camRig.cam.position.constructor;
      g.camRig.cinematic = { pos: new V(A.x, y + 16, A.z + A.d / 2 + 10), look: new V(A.x, y, A.z) };
    }, 1.2, '💥 BUMPER BRAWL', 'Last cart running wins. Front bumpers are strong. Sides are not.', '#ff6b1a');
  }

  update(dt) {
    const g = this.g, p = g.player;
    if (this.phase === 'idle') return;
    if (!this.carts.length) return; // still fading in
    this.t += dt;
    if (this.phase === 'count') {
      // hold everyone on their marks for the countdown
      for (const c of this.carts) { const s = c.derbySpot; c.x = s.x; c.z = s.z; c.vx = c.vz = 0; c.heading = s.ry; }
      const n = 3 - Math.floor(this.t);
      if (n !== this.lastN) {
        this.lastN = n;
        if (n > 0) { g.ui.splash(String(n), '', 0.8, '#ff6b1a'); audio.tone({ freq: 440, type: 'square', dur: 0.2, vol: 0.2 }); } else { g.ui.splash('WRECK \'EM!', '', 1, '#ff6b1a'); audio.tone({ freq: 880, type: 'square', dur: 0.45, vol: 0.25 }); audio.play('horn'); }
      }
      if (this.t > 3) { this.phase = 'fight'; g.camRig.cinematic = null; }
      this.renderHud();
      return;
    }
    if (this.phase === 'done') {
      this.endT -= dt;
      if (this.endT <= 0) this.cleanup();
      return;
    }
    // fight
    this.clock -= dt;
    if (p.cart !== this.mine) return this.finish('bail');
    for (const c of this.carts) {
      const D = c.derby;
      if (c.lastImpact > 3 && D.hp > 0) this.damage(c, c.lastImpact * 1.3, null); // bales hurt too
      if (D.hp <= 0) { c.vx *= Math.exp(-3 * dt); c.vz *= Math.exp(-3 * dt); }
      // smoke, then fire, then a funeral pyre
      D.smokeT -= dt;
      const hurt = 1 - D.hp / 100;
      if (hurt > 0.35 && D.smokeT <= 0) {
        D.smokeT = D.hp <= 0 ? 0.06 : 0.28 - hurt * 0.2;
        const hx = c.x + Math.sin(c.heading) * 0.9, hz = c.z + Math.cos(c.heading) * 0.9;
        g.particles.emit('smoke', hx, c.y + 0.9, hz, { vy: 1.4, vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), life: 1.6, size: 0.6 + hurt * 0.6, grow: 1.4, tint: hurt > 0.7 ? [0.18, 0.18, 0.18] : [0.5, 0.5, 0.5] });
        if (hurt > 0.7) g.particles.emit('spark', hx, c.y + 0.7, hz, { vy: 1.6, life: 0.45, size: 0.5, grow: -0.6, tint: [1, 0.5, 0.12] });
      }
    }
    const alive = this.carts.filter((c) => c.derby.hp > 0);
    if (this.mine.derby.hp <= 0) return this.finish('wrecked');
    if (alive.length === 1) return this.finish('win');
    if (this.clock <= 0) return this.finish('time');
    // the crowd goes wild
    for (const n of this.crowd) if (Math.random() < dt * 0.4) n.char.play('cheer', 1.2);
    this.renderHud();
  }

  // called by the game's cart-vs-cart collision with the closing speed and the normal from a to b
  impact(a, b, rv, nx, nz) {
    if (this.phase !== 'fight' || rv < 2 || !a.derby || !b.derby) return;
    const part = (c, dx, dz) => {
      const f = Math.sin(c.heading) * dx + Math.cos(c.heading) * dz; // 1 = hit with the front bumper
      return f > 0.55 ? 0.45 : f < -0.55 ? 1 : 1.35; // T-bones hurt the most
    };
    // Dan's beater has a church pew for a bumper and a little extra plating
    const armor = (c) => (c === this.mine ? 0.7 : 1);
    const da = rv * 3 * part(a, nx, nz) * armor(a), db = rv * 3 * part(b, -nx, -nz) * armor(b);
    this.damage(a, da, b);
    this.damage(b, db, a);
    const big = Math.max(da, db) > 25;
    if (big) {
      audio.play('crash', { vol: 1 });
      audio.noiseBurst({ dur: 0.9, vol: 0.12, type: 'bandpass', freq: 900, q: 0.6, at: 0.1 }); // OOOOH from the crowd
      for (const n of this.crowd) if (Math.random() < 0.25) n.say(pick(['OOOOH!', 'GET HIM!', 'THAT\'S GONNA LEAVE A MARK!', 'My pacemaker skipped!']), 1.4);
    }
  }

  damage(c, amt, by) {
    const g = this.g, D = c.derby;
    if (D.hp <= 0) return;
    const before = D.hp;
    D.hp = Math.max(0, D.hp - amt);
    if (by === this.mine) {
      this.dealt += before - D.hp;
      if (amt > 12) g.ui.float(c.x, c.y + 1.8, c.z, `-${Math.round(amt)}`, amt > 30 ? '#ff4d4d' : '#ffd23f', 0.9);
    }
    if (c === this.mine && amt > 8) g.camRig.addShake(clamp(amt / 40, 0.15, 0.8));
    if (D.hp <= 0) {
      this.order.push(c);
      g.particles.burst('spark', c.x, c.y + 0.8, c.z, 30, { speed: 5, up: 4, life: 0.8, size: 0.4, gravity: 6 });
      g.ui.float(c.x, c.y + 2.6, c.z, c === this.mine ? 'YOU\'RE WRECKED' : `${D.name.toUpperCase()} WRECKED!`, '#ff6b1a', 1.8);
      audio.play('crash', { vol: 1 });
      if (c !== this.mine && by === this.mine) { g.state.counters.derbyKills = (g.state.counters.derbyKills || 0) + 1; }
      const drv = this.drivers.find((n) => n.cart === c);
      if (drv) drv.say(pick(['MY CART!', 'I\'ll get you next Friday!', 'That\'s it, I\'m calling my lawyer. He\'s also my nephew.']), 2);
    }
  }

  finish(how) {
    const g = this.g;
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.endT = 3.5;
    const alive = this.carts.filter((c) => c.derby.hp > 0).sort((a, b) => b.derby.hp - a.derby.hp);
    const mutual = how === 'wrecked' && !alive.length; // you and the last rival took each other out
    const place = how === 'win' || mutual ? 1 : how === 'time' ? (alive.indexOf(this.mine) + 1 || alive.length + 1) : alive.length + 1;
    const bonus = Math.round(this.dealt);
    const purse = mutual ? 125 : place === 1 ? 250 : place === 2 ? 80 : 0;
    let pay = bonus + purse;
    if (how === 'bail') pay = 0;
    if (pay) g.addMoney(pay, 'Bumper Brawl');
    if (place === 1 && !mutual && how !== 'bail') { g.achievement('derby'); g.xp('stat', 2); g.xp('str', 1); g.state.counters.derbyWins = (g.state.counters.derbyWins || 0) + 1; }
    const title = how === 'bail' ? 'YOU BAILED' : mutual ? 'MUTUAL DESTRUCTION!' : place === 1 ? 'LAST CART STANDING!' : `WRECKED • ${place}${['st', 'nd', 'rd'][place - 1] || 'th'} PLACE`;
    g.ui.splash(title, how === 'bail' ? 'The crowd throws Ensure bottles at you.' : `+${money(pay)} (${money(bonus)} for damage dealt${purse ? `, ${money(purse)} ${mutual ? 'split ' : ''}purse` : ''})`, 3.4, place === 1 ? '#ffd23f' : '#ff6b1a');
    audio.play(place === 1 ? 'levelup' : 'sadTrombone');
    if (place === 1) g.celebrate?.(10, ARENA.x, ARENA.z);
    this.hud.classList.add('hidden');
  }

  cleanup() {
    const g = this.g, p = g.player;
    this.phase = 'idle';
    if (p.cart && p.cart.derby) p.exitCart();
    p.x = DAN.x + 1.5; p.z = DAN.z - 2.5; p.heading = Math.PI;
    for (const n of this.drivers) if (g.npcs.includes(n)) g.removeNPC(n);
    for (const c of this.carts) { g.scene.remove(c.group); c.paintMat?.dispose(); }
    g.carts = g.carts.filter((c) => !c.derby);
    for (const n of this.crowd) if (g.npcs.includes(n) && !n.hostile) { n.state = n.data.prevState || 'wander'; if (n.state === 'party') n.resumeBase(); }
    this.carts = []; this.drivers = []; this.crowd = []; this.mine = null;
    g.camRig.cinematic = null;
  }

  renderHud() {
    const hp = this.mine ? Math.round(this.mine.derby.hp) : 0;
    const left = this.carts.filter((c) => c.derby.hp > 0).length;
    const cl = Math.max(0, this.clock), mm = Math.floor(cl / 60), ss = String(Math.floor(cl % 60)).padStart(2, '0');
    this.hud.classList.remove('hidden');
    this.hud.innerHTML = `<span class="sh-clock">💥 ${mm}:${ss}</span><span class="dh-bar"><i style="width:${hp}%;background:${hp > 60 ? '#5dff7a' : hp > 30 ? '#ffd23f' : '#ff4d4d'}"></i></span><span>${hp}%</span><span>${left} carts left</span><span>dealt ${Math.round(this.dealt)}</span>`;
  }

  clear() {
    if (this.phase !== 'idle') this.cleanup();
    if (this.dan && this.g.npcs.includes(this.dan)) this.g.removeNPC(this.dan);
    this.hud.classList.add('hidden');
  }
}

export function danNode(g) {
  const d = g.derby;
  const open = d.open();
  return {
    name: 'Derby Dan', title: 'Bumper Brawl • nightly 5PM–1AM',
    text: open
      ? '"Six carts. One winner. Front bumper\'s reinforced with a church pew — hit \'em in the SIDE. Entry\'s forty bucks, winner takes two-fifty plus a buck for every point of damage you dish out. Your own cart stays safe with me. Mostly."'
      : '"Brawl starts at 5PM, champ. The fellas are still at water aerobics."',
    choices: open
      ? [{ text: '💥 Enter the Bumper Brawl', tag: `entry ${money(40)}`, disabled: g.state.money < 40 || !!g.minigame, action: () => { d.start(40); return null; } }, { text: 'Maybe later', action: () => null }]
      : [{ text: 'Fine.', action: () => null }],
  };
}
