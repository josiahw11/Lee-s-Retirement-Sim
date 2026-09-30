// Beer Pong at the Tiki Hut. Six cups a side. The aim reticle sways with your buzz — sober hands
// shake a little, a few beers in you hit the Ballmer Peak and go steady, past that it's a hurricane.
// WASD aims, SPACE throws, Q toggles a bounce shot (off the table, counts as TWO cups). Sink three in a
// row and you're ON FIRE. Every cup you lose, you drink: real beer, real buzz, real bladder.
import * as THREE from 'three';
import { heightAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { clamp, rand, pick, money } from '../core/utils.js';

export const TABLE = { x: 112, z: -1, len: 2.44, w: 0.61, h: 0.72 };
const G = 9.8, BALL_R = 0.02, CUP_R = 0.047, CUP_H = 0.12, SPACING = 0.098;
const OPPS = [
  ['Tyler (somebody\'s grandson)', false, { hat: 'cap', hatColor: '#23408e', shirt: 5, glasses: 'none', belly: 0.9, hair: '#6b4a2a', skin: '#f0c8a8' }, '"Bro. I\'m literally undefeated at Delta Chi."'],
  ['Two-Beer Terry', false, { hat: 'bucket', shirt: 1, mustache: true, belly: 1.5 }, '"Two beers and I\'m a sniper. Three and I\'m a liability."'],
  ['Sister Mary Margaret (off duty)', true, { hat: 'none', glasses: 'readers', shirt: 6, hair: '#e8e8e8' }, '"The Lord guides my wrist, dear. Rack \'em."'],
];
const box = () => document.getElementById('mg-box');
const gauss = () => rand(-1, 1) + rand(-1, 1) + rand(-1, 1); // ~normal, sigma 1

let tableBuilt = false;
// the table itself lives in the world whether or not anyone's playing
export function buildPongTable(g) {
  if (tableBuilt) return;
  tableBuilt = true;
  const T = TABLE, y = heightAt(T.x, T.z);
  const grp = new THREE.Group();
  grp.position.set(T.x, y, T.z);
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(T.len, 0.04, T.w), new THREE.MeshStandardMaterial({ map: pongTopTexture(), roughness: 0.5 }));
  top.position.y = T.h - 0.02;
  top.castShadow = top.receiveShadow = true;
  grp.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, T.h - 0.04, 0.05), wood);
    leg.position.set(sx * (T.len / 2 - 0.1), (T.h - 0.04) / 2, sz * (T.w / 2 - 0.06));
    grp.add(leg);
  }
  g.scene.add(grp);
  g.world.col.addBox(T.x - T.len / 2, T.z - T.w / 2, T.x + T.len / 2, T.z + T.w / 2, y + T.h, 'pong');
  g.world.poi('pong', T.x, T.z + 1.3, 'Beer Pong Table', 2.2);
}

function pongTopTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#12355b'; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#f4f4f4'; x.lineWidth = 4;
  x.strokeRect(4, 4, 504, 120);
  x.beginPath(); x.moveTo(256, 4); x.lineTo(256, 124); x.stroke();
  x.fillStyle = '#ffd23f'; x.font = 'bold 30px "Comic Sans MS", cursive'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('SUNSET PALMS', 256, 44);
  x.font = 'bold 18px sans-serif'; x.fillStyle = '#f4f4f4';
  x.fillText('BEER PONG • EST. 1961', 256, 84);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// one red solo cup: red outside, white inside, beer in the bottom
function cupMesh() {
  const g = new THREE.Group();
  const out = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R, CUP_R * 0.74, CUP_H, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.45 }));
  const inn = new THREE.Mesh(out.geometry, new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6, side: THREE.BackSide }));
  const beer = new THREE.Mesh(new THREE.CircleGeometry(CUP_R * 0.86, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0a526, roughness: 0.2, emissive: 0x3a2400 }));
  beer.position.y = CUP_H * 0.18;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(CUP_R * 0.74, 16).rotateX(Math.PI / 2), out.material);
  bottom.position.y = -CUP_H / 2;
  for (const m of [out, inn, beer, bottom]) { m.castShadow = true; g.add(m); }
  return g;
}

export class BeerPong {
  constructor(g, { bet = 30, skill = 0.55, opp = null } = {}) {
    this.g = g;
    this.bet = bet;
    this.skill = skill;
    this.fullSpeed = true;
    const T = TABLE;
    this.y0 = heightAt(T.x, T.z) + T.h; // table top
    const [name, fem, look, line] = opp || pick(OPPS);
    this.oppName = name;
    this.oppFirst = name.split(' ')[0];
    this.group = new THREE.Group();
    g.scene.add(this.group);
    // cups: Lee's six at the east end (+x), theirs at the west end
    this.cups = { me: this.rack(1), them: this.rack(-1) };
    // ball, reticle
    this.ball = null;
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x222222 }));
    this.ballMesh.visible = false;
    this.group.add(this.ballMesh);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.042, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthTest: false }));
    this.reticle.renderOrder = 5;
    this.group.add(this.reticle);
    this.aim = { x: T.x - T.len / 2 + 0.25, z: T.z }; // on their cups
    this.turn = 'me';
    this.waitT = 0.6;
    this.streak = 0;
    this.onFire = false;
    this.bounceShot = false;
    this.oppBuzz = 0;
    this.drinkT = 0;
    this.t = 0;
    this.msg = `${this.oppFirst}: ${line}`;
    // the players take their ends of the table
    const p = g.player;
    this.prevHeld = p.char.heldType;
    p.char.setHeld(null);
    this.prevFov = g.camRig.baseFov;
    g.camRig.baseFov = 36; // tighter lens so the far cups read
    p.x = T.x + T.len / 2 + 0.28; p.z = T.z + 0.52;
    this.opp = g.spawnNPC({ name, female: fem, role: 'pongopp', x: T.x - T.len / 2 - 0.45, z: T.z, state: 'static', look, homePt: { x: T.x - T.len / 2 - 0.45, z: T.z } });
    this.opp.data.quiet = true;
    box().onclick = null;
    box().innerHTML = `
      <div class="sb-head"><span class="mg-title">🍺 BEER PONG</span><span class="gf-info">vs ${name} • Bet ${money(bet)}</span><span class="pb-score" id="bp-score"></span></div>
      <div class="bp-row"><span id="bp-sway"></span><span id="bp-mode"></span></div>
      <div class="mg-msg" id="bp-msg"></div>
      <div class="sb-btns"><button class="btn" id="bp-l">◀</button><button class="btn" id="bp-u">▲</button><button class="btn big" id="bp-go">THROW</button><button class="btn" id="bp-d">▼</button><button class="btn" id="bp-r">▶</button><button class="btn" id="bp-q">BOUNCE</button></div>
      <div class="mg-hint">WASD aim • SPACE throw • Q bounce shot (2 cups) • time it with the sway • ESC to forfeit</div>`;
    document.getElementById('minigame').classList.add('mg-3d');
    this.btn = { x: 0, z: 0 };
    const hold = (id, k, v) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.btn[k] = v; });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => { this.btn[k] = 0; });
    };
    hold('bp-l', 'z', 1); hold('bp-r', 'z', -1); hold('bp-u', 'x', -1); hold('bp-d', 'x', 1);
    document.getElementById('bp-go').addEventListener('pointerdown', (e) => { e.preventDefault(); this.wantThrow = true; });
    document.getElementById('bp-q').addEventListener('pointerdown', (e) => { e.preventDefault(); this.wantBounce = true; });
    this.render();
  }

  rack(side) {
    const T = TABLE, cups = [];
    // triangle of 3-2-1, point toward the middle of the table
    const baseX = T.x + side * (T.len / 2 - 0.08);
    let k = 0;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i <= 2 - row; i++) {
        const x = baseX - side * (row * SPACING * 0.87 + CUP_R);
        const z = T.z + (i - (2 - row) / 2) * SPACING;
        const m = cupMesh();
        m.position.set(x, this.y0 + CUP_H / 2, z);
        this.group.add(m);
        cups.push({ x, z, m, alive: true, id: k++ });
      }
    }
    return cups;
  }

  alive(side) { return this.cups[side].filter((c) => c.alive); }

  // how far the aim wanders, from your buzz: sober shakes, the Ballmer Peak is steady, drunk is chaos
  swayAmp() {
    const b = this.g.state.buzz;
    let a = b < 20 ? 0.05 : b < 55 ? 0.028 : 0.028 + ((b - 55) / 45) * 0.2;
    if (this.onFire) a *= 0.35;
    return a;
  }

  sway() {
    const a = this.swayAmp(), t = this.t;
    return { x: a * Math.sin(t * 1.9) * 0.8, z: a * Math.sin(t * 2.7 + 1.3) };
  }

  // launch a ball from (x,y,z) toward (tx,tz): direct shots drop into the cup; bounce shots are solved
  // against the same physics the ball actually uses
  throwBall(from, tx, tz, bounce, who) {
    const b = { x: from.x, y: from.y, z: from.z, who, bounces: 0, bounceShot: bounce, t: 0 };
    const dx = tx - b.x, dz = tz - b.z, D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D;
    if (!bounce) {
      const apex = this.y0 + 0.55 + D * 0.06, yT = this.y0 + CUP_H;
      const vy = Math.sqrt(2 * G * (apex - b.y));
      const T1 = vy / G + Math.sqrt((2 * (apex - yT)) / G);
      Object.assign(b, { vx: (dx / T1), vy, vz: (dz / T1) });
    } else {
      // low line drive into the table; bisect on speed so the ball comes down on the cup after one bounce
      const vy = 1.2;
      let lo = 1, hi = 9;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        const d = this.simCross({ ...b, vx: ux * mid, vy, vz: uz * mid });
        if (d < D) lo = mid; else hi = mid;
      }
      const v = (lo + hi) / 2;
      Object.assign(b, { vx: ux * v, vy, vz: uz * v });
    }
    this.ball = b;
  }

  // distance (horizontal) at which a ball, after one table bounce, falls back through rim height
  simCross(b0) {
    const b = { ...b0, bounces: 0 };
    const x0 = b.x, z0 = b.z, dt = 1 / 240, yT = this.y0 + CUP_H;
    for (let i = 0; i < 2000; i++) {
      b.vy -= G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= this.y0 + BALL_R && b.vy < 0) {
        if (b.bounces) return Math.hypot(b.x - x0, b.z - z0);
        b.y = this.y0 + BALL_R; b.vy = -b.vy * 0.72; b.vx *= 0.9; b.vz *= 0.9; b.bounces = 1;
      }
      if (b.bounces && b.vy < 0 && b.y <= yT) return Math.hypot(b.x - x0, b.z - z0);
    }
    return 99;
  }

  throwMine() {
    const T = TABLE, s = this.sway();
    // even a perfectly timed throw scatters: distance (depth) is harder to judge than line
    const f = this.onFire ? 0.35 : 1;
    const tx = this.aim.x + s.x + gauss() * 0.045 * f, tz = this.aim.z + s.z + gauss() * 0.02 * f;
    const from = { x: T.x + T.len / 2 + 0.2, y: this.y0 + 0.45, z: T.z + 0.3 + rand(-0.02, 0.02) };
    this.throwBall(from, tx, tz, this.bounceShot, 'me');
    this.g.player.char.play('point', 0.5);
    audio.tone({ freq: 700, to: 500, type: 'sine', dur: 0.08, vol: 0.08 });
  }

  throwTheirs() {
    const T = TABLE;
    // aim at the heart of what's left: a miss can still drop into a neighbour
    const targets = this.alive('me');
    const cx = targets.reduce((a, c) => a + c.x, 0) / targets.length, cz = targets.reduce((a, c) => a + c.z, 0) / targets.length;
    const c = targets.reduce((best, c) => (Math.hypot(c.x - cx, c.z - cz) < Math.hypot(best.x - cx, best.z - cz) ? c : best));
    const bounce = Math.random() < 0.15;
    const sd = 0.024 + (1 - this.skill) * 0.045 + this.oppBuzz * 0.0003 + (bounce ? 0.012 : 0); // they get sloppier as they drink
    const from = { x: T.x - T.len / 2 - 0.3, y: this.y0 + 0.42, z: T.z + rand(-0.04, 0.04) };
    this.throwBall(from, c.x + gauss() * sd, c.z + gauss() * sd * 0.5, bounce, 'them');
    this.opp.char.play('point', 0.5);
  }

  update(dt, input) {
    const g = this.g;
    this.t += dt;
    this.cam(dt);
    this.pose();
    if (this.drinkT > 0) {
      this.drinkT -= dt;
      if (this.drinkT <= 0) g.player.char.setHeld(null);
    }
    if (this.done) {
      this.endT -= dt;
      if (this.endT <= 0) this.cleanup();
      return;
    }
    if (input.rawHit('Escape') || input.rawHit('PadB')) return this.finish(true);
    // aim
    const k = (c) => input.down.has(c);
    const ax = (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0) + this.btn.x + (input.pad ? input.pad.axes[1] || 0 : 0);
    const az = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0) + this.btn.z - (input.pad ? input.pad.axes[0] || 0 : 0);
    const T = TABLE;
    this.aim.x = clamp(this.aim.x + clamp(ax, -1, 1) * 0.5 * dt, T.x - T.len / 2 + 0.02, T.x - T.len / 2 + 0.5);
    this.aim.z = clamp(this.aim.z + clamp(az, -1, 1) * 0.5 * dt, T.z - 0.24, T.z + 0.24);
    if (input.rawHit('KeyQ') || this.wantBounce) { this.bounceShot = !this.bounceShot; this.wantBounce = false; this.render(); }
    const s = this.sway();
    this.reticle.visible = this.turn === 'me' && !this.ball;
    this.reticle.position.set(this.aim.x + s.x, this.y0 + CUP_H + 0.004, this.aim.z + s.z);
    const want = input.rawHit('Space') || input.rawHit('PadA') || this.wantThrow;
    this.wantThrow = false;
    if (this.ball) this.fly(dt);
    else {
      this.waitT -= dt;
      if (this.waitT <= 0) {
        if (this.turn === 'me' && want) this.throwMine();
        else if (this.turn === 'them') this.throwTheirs();
      }
    }
    if (this.ball) {
      this.ballMesh.visible = true;
      this.ballMesh.position.set(this.ball.x, this.ball.y, this.ball.z);
      if (this.onFire && this.ball.who === 'me' && Math.random() < 0.7) g.particles.emit('spark', this.ball.x, this.ball.y, this.ball.z, { vy: 0.4, life: 0.35, size: 0.18, grow: -0.4 });
    } else this.ballMesh.visible = false;
  }

  fly(dt) {
    const b = this.ball, T = TABLE;
    const target = b.who === 'me' ? 'them' : 'me';
    const steps = 6, h = dt / steps;
    for (let i = 0; i < steps && this.ball; i++) {
      b.t += h;
      b.vy -= G * h;
      b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
      // cups
      for (const c of this.cups[target]) {
        if (!c.alive) continue;
        const r = Math.hypot(b.x - c.x, b.z - c.z);
        const top = this.y0 + CUP_H;
        if (b.vy < 0 && b.y <= top + BALL_R && b.y > top - 0.03 && r < CUP_R + BALL_R) {
          if (r < CUP_R - BALL_R * 0.4 || (r < CUP_R + BALL_R * 0.5 && Math.random() < 0.3)) return this.sink(c, target, r >= CUP_R - BALL_R * 0.4);
          // rim: rattle and pop out
          const nx = (b.x - c.x) / (r || 1), nz = (b.z - c.z) / (r || 1);
          b.vx = nx * 0.9 + b.vx * 0.2; b.vz = nz * 0.9 + b.vz * 0.2; b.vy = Math.abs(b.vy) * 0.45;
          audio.tone({ freq: 1400, type: 'triangle', dur: 0.04, vol: 0.08 });
          this.msg = pick(['Rimmed out!', 'Off the rim!', 'SO close.']);
          this.render();
        } else if (b.y < top && b.y > this.y0 && r < CUP_R + BALL_R) {
          // clipped the side of a cup
          const nx = (b.x - c.x) / (r || 1), nz = (b.z - c.z) / (r || 1), hs = Math.hypot(b.vx, b.vz);
          b.vx = nx * hs * 0.5; b.vz = nz * hs * 0.5; b.vy *= 0.5;
          audio.tone({ freq: 500, type: 'triangle', dur: 0.03, vol: 0.06 });
        }
      }
      // table
      const onTable = Math.abs(b.x - T.x) < T.len / 2 && Math.abs(b.z - T.z) < T.w / 2;
      if (onTable && b.y <= this.y0 + BALL_R && b.vy < 0) {
        b.y = this.y0 + BALL_R;
        b.vy = -b.vy * 0.72; b.vx *= 0.9; b.vz *= 0.9;
        b.bounces++;
        audio.tone({ freq: 900 + rand(-60, 60), type: 'sine', dur: 0.03, vol: 0.1 });
        if (b.bounces > 3) return this.miss();
      }
      if (b.y < this.y0 - 0.7 || b.t > 4) return this.miss();
    }
  }

  sink(c, side, rimmed) {
    const g = this.g;
    const b = this.ball;
    this.ball = null;
    const worth = b.bounceShot && b.bounces >= 1 ? 2 : 1;
    const gone = [c];
    if (worth === 2) { const other = this.alive(side).find((x) => x !== c); if (other) gone.push(other); }
    for (const x of gone) { x.alive = false; x.m.visible = false; }
    audio.play('splash', { vol: 0.35 });
    g.particles.burst('drop', c.x, this.y0 + CUP_H, c.z, 10, { speed: 0.8, up: 1.4, life: 0.5, size: 0.05, gravity: 9 });
    if (b.who === 'me') {
      this.streak++;
      const was = this.onFire;
      this.onFire = this.streak >= 3;
      this.oppBuzz += 12 * gone.length;
      this.msg = `${rimmed ? 'Rimmed in! ' : ''}${worth === 2 ? 'BOUNCE SHOT! Two cups! ' : pick(['SPLASH! ', 'Nothing but beer! ', 'Drink up! '])}${this.onFire ? (was ? 'Still ON FIRE 🔥' : 'HE\'S ON FIRE! 🔥') : this.streak === 2 ? 'Heating up...' : ''}`;
      this.opp.char.play('drink', 1.2);
      this.opp.say(pick(['Ugh, warm Natty.', 'Lucky shot, gramps.', '*chug*', 'Is this... Busch?']), 1.8);
      audio.play('success', { vol: 0.5 });
    } else {
      this.msg = `${worth === 2 ? 'Bounce shot! Two cups. ' : ''}${this.oppFirst} sinks one. Drink up, Lee.`;
      this.leeDrinks(gone.length);
    }
    this.next();
    if (!this.alive('them').length) return this.finish(false);
    if (!this.alive('me').length) return this.finish(false);
  }

  leeDrinks(n) {
    const g = this.g, s = g.state, p = g.player;
    for (let i = 0; i < n; i++) {
      s.buzz = Math.min(100, s.buzz + 9);
      s.bladder = Math.min(100, s.bladder + 6);
      s.counters.beers++;
      s.counters.beersToday++;
    }
    if (s.counters.beersToday >= 6) g.achievement('sixpack');
    p.char.setHeld('beer');
    p.char.play('drink', 1.3);
    this.drinkT = 1.3;
    audio.play('drink');
    if (Math.random() < 0.5) setTimeout(() => audio.play('burp'), 900);
  }

  miss() {
    const b = this.ball;
    this.ball = null;
    if (b.who === 'me') {
      if (this.onFire) this.msg = 'Fire\'s out. 🧯';
      else this.msg = pick(['Miss!', 'Airball!', 'Off the table.', 'Your grandkids would be ashamed.']);
      this.streak = 0;
      this.onFire = false;
    } else this.msg = pick([`${this.oppFirst} misses!`, `${this.oppFirst} airballs. The Tiki Hut boos.`, 'Miss! Your turn.']);
    this.next();
  }

  next() {
    this.turn = this.turn === 'me' ? 'them' : 'me';
    this.waitT = this.turn === 'them' ? 1.1 : 0.5;
    this.render();
  }

  pose() {
    const g = this.g, p = g.player;
    const y = heightAt(p.x, p.z);
    p.char.root.position.set(p.x, y, p.z);
    p.char.root.rotation.y = -Math.PI / 2 - 0.35; // facing down the table from the corner
    if (p.char.mode !== 'idle') p.char.mode = 'idle';
    const o = this.opp;
    o.char.root.position.set(o.x, heightAt(o.x, o.z), o.z);
    o.char.root.rotation.y = Math.PI / 2;
  }

  cam(dt) {
    const rig = this.g.camRig, T = TABLE;
    const V = this.g.player.char.root.position.constructor;
    // straight down the table from just behind Lee's end (Lee leans on the corner)
    const pos = new V(T.x + T.len / 2 + 0.8, this.y0 + 0.88, T.z);
    const look = new V(T.x - T.len / 2 + 0.3, this.y0 + 0.24, T.z);
    if (!rig.cinematic) rig.cinematic = { pos: pos.clone(), look: look.clone() };
    rig.cinematic.pos.lerp(pos, 1 - Math.exp(-6 * dt));
    rig.cinematic.look.lerp(look, 1 - Math.exp(-6 * dt));
  }

  render() {
    const el = (id) => document.getElementById(id);
    if (!el('bp-score')) return;
    el('bp-score').innerHTML = `🥤${this.alive('me').length} — ${this.alive('them').length}🥤`;
    const b = this.g.state.buzz;
    el('bp-sway').textContent = this.onFire ? '🔥 ON FIRE: steady as a surgeon' : b < 20 ? '🤚 Sober: shaky hands' : b < 55 ? '🎯 BALLMER PEAK: dead steady' : '🌀 Hammered: good luck';
    el('bp-mode').textContent = this.bounceShot ? '🏓 BOUNCE SHOT (2 cups)' : '🎯 Straight shot';
    el('bp-msg').textContent = this.turn === 'them' && !this.done ? `${this.msg} ${this.msg ? '•' : ''} ${this.oppFirst} is shooting...` : this.msg;
  }

  finish(forfeit) {
    if (this.done) return;
    this.done = true;
    this.endT = 3;
    this.ball = null;
    this.reticle.visible = false;
    const g = this.g;
    const won = !forfeit && this.alive('them').length === 0;
    if (won) {
      g.addMoney(this.bet * 2, 'beer pong');
      g.xp('cha', 1);
      g.xp('stat', 1);
      g.achievement('pong');
      g.state.counters.pongWins = (g.state.counters.pongWins || 0) + 1;
      audio.play('levelup');
      this.msg = `YOU WIN! ${this.oppFirst} has to drink the last cup AND the rack water. +${money(this.bet * 2)}`;
      g.celebrate?.(6, TABLE.x, TABLE.z);
    } else {
      audio.play('sadTrombone');
      this.msg = forfeit ? 'You forfeit. Somebody finishes your cups for you.' : `${this.oppFirst} wins. You're out ${money(this.bet)} and several beers.`;
    }
    this.render();
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    const g = this.g;
    g.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    if (g.npcs.includes(this.opp)) g.removeNPC(this.opp);
    g.player.char.setHeld(this.prevHeld && this.prevHeld !== 'fists' ? this.prevHeld : (g.state.weapon === 'fists' ? null : g.state.weapon));
    g.camRig.cinematic = null;
    g.camRig.baseFov = this.prevFov;
    document.getElementById('minigame').classList.remove('mg-3d');
    g.endMinigame();
  }
}

export function pongNode(g) {
  const h = g.state.minutes / 60;
  const open = h >= 11 || h < 2;
  const play = (bet, skill) => () => { g.startMinigame('pong', { bet, skill }); g.ui.closeDialogue(); return 'keep'; };
  return {
    name: 'Beer Pong Table', title: 'Tiki Hut • winner stays, loser drinks',
    text: open ? 'A sticky table, twelve red cups and a ping-pong ball that has seen things. Six cups a side. Every cup you lose, you drink.' : '"Table opens at 11AM, hon. We\'re not animals." — the bartender, at 8AM, pouring you a mimosa.',
    choices: open ? [
      { text: 'Play a game', tag: `bet ${money(30)}`, disabled: g.state.money < 30, action: play(30, 0.5) },
      { text: 'Play the house champ', tag: `bet ${money(120)}`, disabled: g.state.money < 120, action: play(120, 0.8) },
      { text: 'Walk away', action: () => null },
    ] : [{ text: 'Fine.', action: () => null }],
  };
}
