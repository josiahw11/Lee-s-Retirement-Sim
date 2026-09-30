// Shuffleboard Hustle: a real 3D frame on the clubhouse courts. Four pucks each, alternating.
// Aim with A/D, hold SPACE (or the button) to charge, release to shoot. Pucks slide with friction,
// knock each other around, fall in the gutter, and score 10 / 8 / 7 (or -10 OFF) where they stop.
import * as THREE from 'three';
import { Character, randomLook } from '../entities/character.js';
import { BUILDINGS, SHUFFLE_COURT as SC } from '../world/layout.js';
import { heightAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { clamp, rand, pick, money, damp } from '../core/utils.js';

const R = 0.15; // puck radius
const DECEL = 2.4; // m/s^2 (a real court is slicker; this keeps shots snappy)
const V0 = 6.5, VR = 5.0; // shot speed = V0 + power * VR
const PER_SIDE = 4;
const SHARKS = ['Sid "The Shark" Pomerantz', 'Marty "Hammer" Feldblum', 'Dolores "Ice Queen" Tatum'];
const PUCK_GEO = new THREE.CylinderGeometry(R, R, 0.04, 28);
const MATS = {
  me: new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.35, metalness: 0.1 }),
  them: new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.35, metalness: 0.1 }),
};
const box = () => document.getElementById('mg-box');

export class Shuffleboard {
  constructor(game, { bet = 30, skill = 0.6, onWin, onLose } = {}) {
    this.g = game;
    this.bet = bet;
    this.skill = skill;
    this.onWin = onWin;
    this.onLose = onLose;
    const sb = BUILDINGS.shuffle;
    this.zc = sb.z - 5; // court 0
    this.cx = sb.x;
    this.x0 = sb.x - SC.len / 2; // target end
    this.startX = sb.x + SC.len / 2 - 1.3;
    this.y = heightAt(sb.x, this.zc) + 0.08;
    this.apexX = this.x0 + SC.apex;
    this.baseX = this.x0 + SC.base;
    this.deadX = this.x0 + SC.dead;
    this.oppName = pick(SHARKS);
    this.pucks = [];
    this.left = { me: PER_SIDE, them: PER_SIDE };
    this.turn = 'me';
    this.phase = 'aim';
    this.aim = 0;
    this.power = 0;
    this.powerT = 0;
    this.charging = false;
    this.t = 0;
    this.waitT = 0;
    this.done = false;
    this.endT = 0;
    this.msg = 'Aim with A/D, hold SPACE to charge, release to shoot. Land in the triangle!';

    const scene = game.scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    // aim guide: a row of fading dots from the puck spot (plus a ghost puck where it starts)
    this.aimLine = new THREE.Group();
    this.dotGeo = new THREE.CircleGeometry(0.05, 12).rotateX(-Math.PI / 2);
    for (let i = 1; i <= 16; i++) {
      const m = new THREE.Mesh(this.dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 * (1 - i / 18), depthWrite: false }));
      m.position.x = -i * 0.6;
      this.aimLine.add(m);
    }
    const ghost = new THREE.Mesh(PUCK_GEO, new THREE.MeshStandardMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.55 }));
    ghost.position.y = 0.0;
    this.aimLine.add(ghost);
    this.group.add(this.aimLine);

    // clear loiterers off the court (the world is paused while we play)
    for (const npc of game.npcs) {
      if (npc.cart || npc.x < this.x0 - 1 || npc.x > this.x0 + SC.len + 1 || Math.abs(npc.z - this.zc) > 1.6) continue;
      npc.z = this.zc - 2.6 - Math.random() * 1.5;
      npc.y = heightAt(npc.x, npc.z);
      npc.char.root.position.set(npc.x, npc.y, npc.z);
      npc.char.root.rotation.y = 0;
    }
    // Lee takes his end of the court; the shark waits beside it
    const p = game.player;
    p.x = this.startX + 1.1; p.z = this.zc - 1.35; p.y = heightAt(p.x, p.z);
    p.heading = -Math.PI / 2;
    p.char.root.position.set(p.x, p.y, p.z);
    p.char.root.rotation.y = p.heading;
    const look = randomLook(this.oppName.startsWith('Dolores'));
    look.hat = 'visor';
    this.opp = new Character(look);
    this.opp.root.position.set(this.startX + 2.3, heightAt(this.startX + 2.3, this.zc + 1.5), this.zc + 1.5);
    this.opp.root.rotation.y = -Math.PI / 2 - 0.5;
    this.opp.setNear?.(true);
    scene.add(this.opp.root);

    box().innerHTML = `
      <div class="sb-head"><span class="mg-title">🥌 SHUFFLEBOARD</span><span class="sb-score"><b id="sb-me">0</b><span>—</span><b id="sb-them">0</b></span><span class="sb-left" id="sb-left"></span></div>
      <div class="mg-sub">${game.state.name} <span class="sb-dot me"></span> vs ${this.oppName} <span class="sb-dot them"></span> • Bet ${money(bet)}</div>
      <div class="chug-bar sb-bar"><div id="sb-power"></div><div class="sb-sweet" id="sb-sweet"></div><div class="sb-ten" id="sb-ten"></div></div>
      <div class="mg-msg" id="sb-msg"></div>
      <div class="sb-btns"><button class="btn" id="sb-l">◀</button><button class="btn big" id="sb-shoot">HOLD TO SHOOT</button><button class="btn" id="sb-r">▶</button></div>
      <div class="mg-hint">A/D aim • hold SPACE, release to shoot • ESC to forfeit</div>`;
    document.getElementById('minigame').classList.add('mg-3d');
    // mark the power band that lands in the triangle (and the 10) on a straight shot
    const pw = (x) => (Math.sqrt(2 * DECEL * (this.startX - x)) - V0) / VR * 100;
    const H = this.apexX - this.baseX;
    const band = (id, a, b) => { const el = document.getElementById(id); el.style.left = `${a}%`; el.style.width = `${b - a}%`; };
    band('sb-sweet', pw(this.apexX), pw(this.baseX));
    band('sb-ten', pw(this.apexX), pw(this.apexX - H / 3));
    const hold = (el, on, off) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, off);
    };
    this.btnAim = 0;
    hold(document.getElementById('sb-l'), () => (this.btnAim = 1), () => (this.btnAim = 0));
    hold(document.getElementById('sb-r'), () => (this.btnAim = -1), () => (this.btnAim = 0));
    hold(document.getElementById('sb-shoot'), () => (this.btnHold = true), () => (this.btnHold = false));
    this.render();
  }

  // ---------------------------------------------------------------- scoring
  pointsFor(pk) {
    if (pk.out) return 0;
    const H = this.apexX - this.baseX;
    const along = (this.apexX - pk.x) / H; // 0 at the apex, 1 at the base line
    const lat = Math.abs(pk.z - this.zc);
    if (along > 1 && along < 1 + SC.off / H && lat < SC.half) return -10;
    if (along <= 0 || along >= 1) return 0;
    if (lat > along * SC.half - 0.02) return 0; // on or outside the triangle's sides
    return along < 1 / 3 ? 10 : along < 2 / 3 ? 8 : 7;
  }

  scores() {
    const s = { me: 0, them: 0 };
    for (const pk of this.pucks) s[pk.side] += this.pointsFor(pk);
    return s;
  }

  // ---------------------------------------------------------------- shooting
  shoot(side, aim, power, lateral = 0) {
    const v = V0 + clamp(power, 0, 1) * VR;
    const mesh = new THREE.Mesh(PUCK_GEO, MATS[side]);
    mesh.castShadow = true;
    const pk = { side, mesh, x: this.startX, z: this.zc + lateral, vx: -Math.cos(aim) * v, vz: Math.sin(aim) * v, out: false, fall: 0 };
    mesh.position.set(pk.x, this.y, pk.z);
    this.group.add(mesh);
    this.pucks.push(pk);
    this.left[side]--;
    this.active = pk;
    this.phase = 'slide';
    this.slideT = 0;
    audio.play('plastic', { vol: 0.6 });
    (side === 'me' ? this.g.player.char : this.opp).play?.('punch', 0.5);
  }

  // Is the straight line from the shooting spot to (tx, tz) clear of pucks (ignoring `skip`)?
  pathClear(tz0, tx, tz, skip = null) {
    const ax = this.startX, az = tz0, dx = tx - ax, dz = tz - az, L2 = dx * dx + dz * dz;
    for (const p of this.pucks) {
      if (p.out || p === skip) continue;
      const t = clamp(((p.x - ax) * dx + (p.z - az) * dz) / L2, 0, 1);
      if (Math.hypot(ax + dx * t - p.x, az + dz * t - p.z) < R * 2 + 0.04) return false;
    }
    return true;
  }

  // The shark: blasts your best puck when it has a lane, otherwise draws to the best open spot
  // (10, then the 8s and 7s) with a clear path, or parks a guard in front of its own best puck.
  oppShot() {
    const cha = this.g.state.stats?.cha?.lvl ?? 1;
    const noise = (1.15 - this.skill) * (1 + cha * 0.04); // your charm is distracting
    const H = this.apexX - this.baseX;
    const live = this.pucks.filter((p) => !p.out);
    const mine = live.filter((p) => p.side === 'me' && this.pointsFor(p) >= 7).sort((a, b) => this.pointsFor(b) - this.pointsFor(a));
    let tx, tz, extra = 0;
    const lane = mine.find((p) => this.pathClear(this.zc + clamp(p.z - this.zc, -0.5, 0.5) * 0.4, p.x, p.z, p));
    if (lane && Math.random() < 0.3 + this.skill * 0.5) {
      tx = lane.x; tz = lane.z; extra = 2.2;
      this.say(pick(['Knock knock.', 'Say goodbye to that one.', "Nothing personal, it's business."]));
    } else {
      const cands = [];
      for (const [val, u0, u1, side] of [[10, 0.1, 0.28, 0], [8, 0.42, 0.6, 1], [8, 0.42, 0.6, -1], [7, 0.74, 0.93, 1], [7, 0.74, 0.93, -1]]) {
        for (let k = 0; k < 4; k++) {
          const u = rand(u0, u1), w = u * SC.half;
          const cz = this.zc + (side === 0 ? rand(-0.3, 0.3) * w : side * rand(0.3, 0.65) * w);
          const cx = this.apexX - H * u;
          let room = 9;
          for (const p of live) room = Math.min(room, Math.hypot(p.x - cx, p.z - cz));
          if (room < R * 2.3) continue;
          const lat = clamp(cz - this.zc, -0.5, 0.5) * 0.4;
          if (!this.pathClear(this.zc + lat, cx, cz)) continue;
          cands.push({ val: val + room * 0.5 + rand(0, 0.3), cx, cz });
        }
      }
      cands.sort((a, b) => b.val - a.val);
      const own = live.filter((p) => p.side === 'them' && this.pointsFor(p) >= 7).sort((a, b) => this.pointsFor(b) - this.pointsFor(a))[0];
      if (!cands.length && own) {
        tx = own.x + rand(0.9, 1.4); tz = own.z; // guard it
        this.say(pick(['Nobody touches my ten.', 'Parking a bodyguard.', 'Defense wins championships.']));
      } else {
        const c = cands[0] || { cx: this.apexX - H * 0.2, cz: this.zc };
        tx = c.cx; tz = c.cz;
        this.say(pick(['Watch and learn.', 'Easy money.', 'This is my court.', 'Wax on, pal.']));
      }
    }
    const dist = this.startX - tx;
    const v = Math.sqrt(2 * DECEL * Math.max(1, dist)) + extra + rand(-0.15, 0.15) * noise;
    const lateral = clamp(tz - this.zc, -0.5, 0.5) * 0.4;
    const aim = Math.atan2(tz - this.zc - lateral, dist) + rand(-0.007, 0.007) * noise;
    this.shoot('them', aim, (v - V0) / VR, lateral);
  }

  say(text) {
    this.msg = `${this.oppName.split(' ')[0]}: "${text}"`;
    this.render();
  }

  // ---------------------------------------------------------------- physics
  step(dt) {
    let moving = false;
    for (const pk of this.pucks) {
      if (pk.out) {
        pk.fall += dt;
        pk.mesh.position.y = this.y - pk.fall * 0.8;
        pk.mesh.visible = pk.fall < 0.6;
        continue;
      }
      const sp = Math.hypot(pk.vx, pk.vz);
      if (sp > 0) {
        const ns = Math.max(0, sp - DECEL * dt);
        pk.vx *= ns / sp; pk.vz *= ns / sp;
        pk.x += pk.vx * dt; pk.z += pk.vz * dt;
        if (ns > 0.02) moving = true; else { pk.vx = 0; pk.vz = 0; }
        pk.mesh.rotation.y += sp * dt * 0.6;
      }
      if (Math.abs(pk.z - this.zc) > SC.play || pk.x < this.x0 + R * 0.5) {
        pk.out = true;
        this.flash(pk.x < this.x0 + 0.5 ? 'Off the end!' : 'In the gutter!');
        audio.play('thud', { vol: 0.4 });
      }
    }
    // puck-on-puck (equal mass, a little energy lost)
    for (let i = 0; i < this.pucks.length; i++) for (let j = i + 1; j < this.pucks.length; j++) {
      const a = this.pucks[i], b = this.pucks[j];
      if (a.out || b.out) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= R * 2 || d === 0) continue;
      const nx = dx / d, nz = dz / d;
      const push = (R * 2 - d) / 2;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel > 0) {
        const imp = rel * 0.92;
        a.vx -= imp * nx; a.vz -= imp * nz; b.vx += imp * nx; b.vz += imp * nz;
        audio.play('hit', { vol: clamp(rel / 5, 0.2, 0.8) });
        moving = true;
      }
    }
    for (const pk of this.pucks) if (!pk.out) pk.mesh.position.set(pk.x, this.y, pk.z);
    return moving;
  }

  flash(text) {
    this.msg = text;
    this.render();
  }

  // ---------------------------------------------------------------- camera + loop
  camera(dt) {
    const rig = this.g.camRig;
    let pos, look;
    if (this.phase === 'slide' && this.active) {
      const ax = Math.max(this.active.x, this.x0 + 3);
      pos = new THREE.Vector3(ax + 5.5, this.y + 1.7, this.zc);
      look = new THREE.Vector3(ax - 5, this.y, this.zc);
    } else if (this.phase === 'review' || this.done) {
      const mx = (this.apexX + this.baseX) / 2;
      pos = new THREE.Vector3(mx + 4.6, this.y + 5.4, this.zc + 0.01);
      look = new THREE.Vector3(mx + 1.1, this.y, this.zc);
    } else {
      pos = new THREE.Vector3(this.startX + 5, this.y + 2.0, this.zc);
      look = new THREE.Vector3(this.startX - 13, this.y, this.zc);
    }
    if (!rig.cinematic) rig.cinematic = { pos: pos.clone(), look: look.clone() };
    rig.cinematic.pos.lerp(pos, 1 - Math.exp(-4 * dt));
    rig.cinematic.look.lerp(look, 1 - Math.exp(-5 * dt));
  }

  update(dt, input) {
    this.t += dt;
    this.opp.update(dt);
    this.camera(dt);
    if (this.done) {
      this.endT -= dt;
      if (this.endT <= 0) this.cleanup();
      return;
    }
    if (input.rawHit('Escape') || input.rawHit('PadB')) return this.finish('forfeit');

    const aiming = this.phase === 'aim' && this.turn === 'me';
    this.aimLine.visible = aiming;
    if (this.phase === 'aim') {
      if (this.turn === 'me') {
        const dir = (input.down.has('KeyA') || input.down.has('ArrowLeft') ? 1 : 0) - (input.down.has('KeyD') || input.down.has('ArrowRight') ? 1 : 0) + this.btnAim;
        this.aim = clamp(this.aim + dir * dt * 0.09, -0.07, 0.07);
        const drunk = this.g.state.buzz / 100;
        const wob = Math.sin(this.t * 2.3) * 0.012 * drunk;
        this.aimLine.position.set(this.startX, this.y + 0.01, this.zc);
        this.aimLine.rotation.y = this.aim + wob;
        const holding = input.down.has('Space') || input.down.has('PadA') || this.btnHold;
        if (holding) {
          this.charging = true;
          // linear ping-pong sweep (0 -> 1 in 2 s); beer speeds it up
          this.powerT += dt * (1 + drunk * 0.6);
          this.power = 1 - Math.abs(((this.powerT * 0.5) % 2) - 1);
          this.render();
        } else if (this.charging) {
          this.charging = false;
          this.shoot('me', this.aim + wob, this.power + rand(-0.02, 0.02) * (1 + drunk * 3));
          this.powerT = 0;
        }
      } else {
        this.waitT -= dt;
        if (this.waitT <= 0) this.oppShot();
      }
    } else if (this.phase === 'slide') {
      this.slideT += dt;
      const sub = 4;
      let moving = false;
      for (let i = 0; i < sub; i++) moving = this.step(dt / sub) || moving;
      if (!moving && this.slideT > 0.4) {
        // pucks that died before the far dead line come off the board
        for (const pk of this.pucks) if (!pk.out && pk.x > this.deadX) { pk.out = true; if (pk === this.active) this.flash("Didn't reach the line. Puck's dead."); }
        const pts = this.pointsFor(this.active);
        if (pts) this.flash(pts < 0 ? '10 OFF! Ouch.' : `${pts} points!${pts === 10 ? ' 🎯' : ''}`);
        if (pts === 10 && this.active.side === 'me') audio.play('success');
        this.phase = 'review';
        this.reviewT = 1.3;
        this.render();
      }
    } else if (this.phase === 'review') {
      this.step(dt);
      this.reviewT -= dt;
      if (this.reviewT <= 0) this.nextTurn();
    }
  }

  nextTurn() {
    if (this.left.me + this.left.them === 0) return this.finish();
    this.turn = this.turn === 'me' ? (this.left.them > 0 ? 'them' : 'me') : (this.left.me > 0 ? 'me' : 'them');
    this.phase = 'aim';
    this.power = 0;
    this.powerT = 0;
    if (this.turn === 'them') { this.waitT = 1.1; this.msg = `${this.oppName.split(' ')[0]} lines up a shot...`; } else this.msg = 'Your shot. A/D to aim, hold SPACE, release.';
    this.render();
  }

  render() {
    const s = this.scores();
    const el = (id) => document.getElementById(id);
    if (!el('sb-me')) return;
    el('sb-me').textContent = s.me;
    el('sb-them').textContent = s.them;
    el('sb-left').innerHTML = `<span class="sb-dot me"></span>`.repeat(this.left.me) + '<i></i>' + `<span class="sb-dot them"></span>`.repeat(this.left.them);
    el('sb-power').style.width = `${this.power * 100}%`;
    el('sb-msg').textContent = this.msg;
  }

  finish(forfeit) {
    if (this.done) return;
    this.done = true;
    this.endT = 3.2;
    this.phase = 'done';
    this.aimLine.visible = false;
    const g = this.g;
    const s = this.scores();
    if (forfeit === 'forfeit') {
      this.msg = 'You forfeit. The shark pockets the pot and cackles.';
      audio.play('sadTrombone');
      if (this.onLose) this.onLose();
    } else if (s.me > s.them) {
      this.msg = `${g.state.name} WINS ${s.me}–${s.them}! +${money(this.bet * 2)}`;
      g.addMoney(this.bet * 2, 'shuffleboard');
      g.xp('cha', 1);
      g.xp('stat', 1);
      g.achievement('shuffle');
      audio.play('levelup');
      g.celebrate(4, this.cx - 8, this.zc);
      if (this.onWin) this.onWin();
    } else if (s.me === s.them) {
      this.msg = `Tie game, ${s.me}–${s.them}. Bets are returned. Nobody's happy.`;
      g.addMoney(this.bet, 'shuffleboard');
    } else {
      this.msg = `${this.oppName.split(' ')[0]} wins ${s.them}–${s.me}. You're out ${money(this.bet)}.`;
      audio.play('sadTrombone');
      if (this.onLose) this.onLose();
    }
    this.render();
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    this.g.scene.remove(this.group);
    this.g.scene.remove(this.opp.root);
    this.opp.dispose?.();
    this.dotGeo.dispose();
    this.g.camRig.cinematic = null;
    document.getElementById('minigame').classList.remove('mg-3d');
    this.g.endMinigame();
  }
}
