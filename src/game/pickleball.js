// Pickleball Hustle: a real rally on the community courts. WASD moves Lee around his half, SPACE
// swings when the ball's in reach (hold A/D while swinging to angle it; swing from up near the
// kitchen line for a soft dink). Rally scoring to 5, win by 2. The ball bounces, clips the net,
// lands out, and double-bounces for a point.
import * as THREE from 'three';
import { BUILDINGS } from '../world/layout.js';
import { heightAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { clamp, rand, pick, money } from '../core/utils.js';

const G = 9.8;
const HALF_W = 3.6, HALF_L = 8.1, NET_H = 0.9, KITCHEN = 2.7;
const REACH = 1.35;
const box = () => document.getElementById('mg-box');
const OPPS = [['Deb "The Dinker" Delgado', true], ['Marv "No Mercy" McAllister', false], ['Sylvia "Spin Doctor" Hobbs', true]];

export class Pickleball {
  constructor(g, { bet = 40, skill = 0.55 } = {}) {
    this.g = g;
    this.bet = bet;
    this.skill = skill;
    const pb = BUILDINGS.pickleball;
    this.cx = pb.x - 5; this.cz = pb.z; // court 1
    this.y0 = Math.max(heightAt(this.cx, this.cz), 0) + 0.05;
    this.fullSpeed = true; // characters animate at full speed during the rally
    this.me = { x: 0, z: 6, vx: 0, vz: 0, swingT: 0 };
    this.them = { x: 0, z: -6, swingT: 0, tx: 0, tz: -6 };
    this.score = { me: 0, them: 0 };
    this.server = 'me';
    this.phase = 'serve';
    this.waitT = 0.8;
    this.ball = null;
    this.done = false;
    const [oname, ofem] = pick(OPPS);
    this.oppName = oname;
    this.oppFirst = oname.split(' ')[0];
    this.her = ofem ? 'her' : 'his';
    this.msg = `${oname.split(' ')[0]}: "Twenty bucks says you can't return my dink shot."`;
    // ball + paddles
    this.group = new THREE.Group();
    g.scene.add(this.group);
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd9ff3a, roughness: 0.5, emissive: 0x2a3300 }));
    this.ballMesh.castShadow = true;
    this.group.add(this.ballMesh);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.group.add(this.shadow);
    // where the incoming ball will bounce (reading the ball is hard at 74)
    this.mark = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd9ff3a, transparent: true, opacity: 0.7, depthWrite: false }));
    this.group.add(this.mark);
    // Lee and the opponent take the court
    const p = g.player;
    this.prevHeld = p.char.heldType;
    p.char.setHeld('paddle');
    const n = g.spawnNPC({ name: oname, female: ofem, role: 'pbopp', x: this.cx, z: this.cz - 6, state: 'static', look: { hat: 'visor', shirt: 3, glasses: 'big' }, homePt: { x: this.cx, z: this.cz - 6 } });
    n.data.quiet = true;
    n.char.setHeld('paddle');
    this.opp = n;
    box().onclick = null;
    box().innerHTML = `
      <div class="sb-head"><span class="mg-title">🏓 PICKLEBALL HUSTLE</span><span class="gf-info">vs ${oname} • Bet ${money(bet)}</span><span class="pb-score" id="pb-score"></span></div>
      <div class="mg-msg" id="pb-msg"></div>
      <div class="sb-btns"><button class="btn" id="pb-l">◀</button><button class="btn" id="pb-u">▲</button><button class="btn big" id="pb-hit">SWING</button><button class="btn" id="pb-d">▼</button><button class="btn" id="pb-r">▶</button></div>
      <div class="mg-hint">WASD move • SPACE swing (hold A/D to aim) • swing from the kitchen line to DINK • ESC to forfeit</div>`;
    document.getElementById('minigame').classList.add('mg-3d');
    this.btnX = 0;
    this.btnZ = 0;
    const hold = (el, k, v) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this[k] = v; });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => { this[k] = 0; });
    };
    hold(document.getElementById('pb-l'), 'btnX', -1);
    hold(document.getElementById('pb-r'), 'btnX', 1);
    hold(document.getElementById('pb-u'), 'btnZ', -1);
    hold(document.getElementById('pb-d'), 'btnZ', 1);
    document.getElementById('pb-hit').addEventListener('pointerdown', (e) => { e.preventDefault(); this.wantSwing = true; });
    this.render();
  }

  // court space (x across, z toward Lee's baseline) -> world
  W(x, z) { return { x: this.cx + x, z: this.cz + z }; }

  // where a ball in flight will first bounce, and a comfortable spot to hit it after that bounce
  predict(b) {
    const h = b.y - 0.075;
    const vl = Math.sqrt(b.vy * b.vy + 2 * G * Math.max(0, h));
    const t = (b.vy + vl) / G;
    const lx = b.x + b.vx * t, lz = b.z + b.vz * t;
    const t2 = ((vl * 0.72) / G) * 1.3; // just past the top of the bounce
    return { lx, lz, hx: lx + b.vx * 0.9 * t2, hz: lz + b.vz * 0.9 * t2 };
  }

  // launch the ball from (x,y,z) to land at (tx,tz), passing over the net at height `clear`
  // (solves y(T) = ground and y(at the net) = clear for the flight time T)
  shoot(x, y, z, tx, tz, clear) {
    const f = z * tz < 0 ? Math.abs(z) / Math.abs(tz - z) : 0.5; // fraction of the flight spent reaching the net
    const need = clear - y - f * (0.075 - y);
    const T = clamp(Math.sqrt(Math.max(0.02, (2 * need) / (G * f * (1 - f)))), 0.35, 3);
    const vy = (0.075 - y + 0.5 * G * T * T) / T;
    this.ball = { x, y, z, vx: (tx - x) / T, vy, vz: (tz - z) / T, bounces: 0, last: null };
  }

  hit(who) {
    const b = this.ball;
    const me = who === 'me';
    const aimIn = me ? this.aimX : rand(-1, 1);
    const hitter = me ? this.me : this.them;
    const dir = me ? -1 : 1; // Lee hits toward -z
    const nearKitchen = Math.abs(hitter.z) < KITCHEN + 1.2;
    const err = (1 - (me ? 0.8 : this.skill)) * rand(-1, 1);
    const y = Math.max(0.4, b.y);
    let tz, tx, arc, kind = 'drive'; // arc = height the ball clears the net by
    if (me && b.y > 1.15 && !nearKitchen) {
      kind = 'smash'; // high ball: flat and fast, hard to return, easy to dump in the net
      tz = dir * rand(HALF_L - 3, HALF_L - 1); tx = aimIn * 2.8 + err; arc = 1 + rand(0, 0.12);
    } else if (nearKitchen && (me || Math.random() < 0.4)) {
      kind = 'dink';
      tz = dir * rand(1.2, KITCHEN - 0.3); tx = clamp(aimIn * 2 + err * 2, -HALF_W + 0.4, HALF_W - 0.4); arc = 1.05 + rand(0, 0.2);
    } else {
      tz = dir * rand(HALF_L - 3.5, HALF_L - 0.7) + err * 1.8; tx = aimIn * 2.6 + err * 2.4; arc = 1.25 + rand(0, 0.5);
    }
    if (!me && kind !== 'dink' && Math.random() < this.skill * 0.6) {
      // placement: hit it where Lee isn't. Drop it short when he's camped at the baseline, lob him at the kitchen
      const m = this.me;
      tx = clamp((m.x > 0 ? -1 : 1) * rand(1.8, 3.1) + err, -HALF_W - 0.3, HALF_W + 0.3);
      if (m.z > HALF_L - 1.5 && Math.random() < 0.5) { tz = rand(KITCHEN, KITCHEN + 1.5); arc = 1.2; kind = 'drop'; }
      else if (m.z < KITCHEN + 1.5) { tz = rand(HALF_L - 1.5, HALF_L - 0.4); arc = 3.3; kind = 'lob'; }
    }
    if (me) {
      // bad timing: the ball sails or dumps
      if (this.timingErr) { tz += dir * this.timingErr * 3; arc += this.timingErr * 0.7; }
      // how hard that shot is to handle: angles, depth, dinks and smashes all put the other side under pressure
      this.pressure = (Math.abs(tx) / HALF_W) * 0.1 + (Math.abs(tz) > HALF_L - 1.5 ? 0.08 : 0) + (kind === 'dink' ? 0.1 : kind === 'smash' ? 0.28 : 0);
      if (kind !== 'drive') this.msg = kind === 'smash' ? 'SMASH!' : 'Dink!';
    } else if (Math.random() < 0.05 + (1 - this.skill) * 0.16 + (this.pressure || 0)) {
      // unforced (or forced) error
      const f = pick(['net', 'long', 'wide']);
      if (f === 'net') arc = rand(0.35, 0.8);
      else if (f === 'long') tz = dir * (HALF_L + rand(0.4, 1.6));
      else tx = (tx >= 0 ? 1 : -1) * (HALF_W + rand(0.3, 1.2));
    }
    this.shoot(b.x, y, b.z, tx, tz, arc);
    this.ball.last = who;
    audio.tone({ freq: (kind === 'smash' ? 380 : 520) + rand(-40, 40), type: 'square', dur: 0.04, vol: kind === 'smash' ? 0.2 : 0.14 });
    audio.noiseBurst({ dur: 0.03, vol: 0.12, type: 'bandpass', freq: 1800 });
    (me ? this.g.player.char : this.opp.char).play('swing', 0.35);
  }

  point(winner, why) {
    this.score[winner]++;
    this.pressure = 0;
    this.timingErr = 0;
    this.msg = `${why} ${winner === 'me' ? 'Point Lee!' : `Point ${this.oppFirst}.`}`;
    audio.play(winner === 'me' ? 'success' : 'fail', { vol: 0.5 });
    this.server = winner;
    this.ball = null;
    const s = this.score;
    if ((s.me >= 5 || s.them >= 5) && Math.abs(s.me - s.them) >= 2) return this.finish(false);
    this.phase = 'serve';
    this.waitT = 1.2;
    this.render();
  }

  update(dt, input) {
    const g = this.g;
    this.cam(dt);
    if (this.done) {
      this.endT -= dt;
      if (this.endT <= 0) this.cleanup();
      return;
    }
    if (input.rawHit('Escape') || input.rawHit('PadB')) return this.finish(true);
    const drunk = g.state.buzz / 100;
    // Lee moves around his half
    const pad = input.pad ? input.pad.axes : [0, 0];
    const k = (c) => input.down.has(c);
    const mx = (k('KeyD') || k('ArrowRight') || k('PadRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') || k('PadLeft') ? 1 : 0) + this.btnX + (pad[0] || 0);
    const mz = (k('KeyS') || k('ArrowDown') || k('PadDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') || k('PadUp') ? 1 : 0) + this.btnZ + (pad[1] || 0);
    const sp = 3.6 * (1 - drunk * 0.35);
    const m = this.me;
    m.x = clamp(m.x + clamp(mx, -1, 1) * sp * dt, -HALF_W - 1, HALF_W + 1);
    m.z = clamp(m.z + clamp(mz, -1, 1) * sp * dt, 0.6, HALF_L + 1.5);
    this.aimX = clamp(mx, -1, 1); // hold left to hit left
    const want = input.rawHit('Space') || input.rawHit('PadA') || this.wantSwing;
    this.wantSwing = false;
    if (this.phase === 'serve') {
      this.waitT -= dt;
      if (this.server === 'me') {
        if (this.waitT <= 0 && !this.msgServe) { this.msgServe = true; this.msg = 'Your serve. SPACE.'; this.render(); }
        if (want && this.waitT <= 0) { this.msgServe = false; this.timingErr = 0; this.ball = { x: m.x, y: 0.9, z: m.z - 0.4 }; this.hit('me'); this.phase = 'rally'; this.msg = pick(["Serve's in play.", '"Nice serve, grandpa."', 'Here we go.']); this.render(); }
      } else if (this.waitT <= 0) {
        this.ball = { x: this.them.x, y: 0.9, z: this.them.z + 0.4 };
        this.hit('them');
        this.phase = 'rally';
      }
    } else if (this.phase === 'rally') this.rally(dt, want);
    // pose the players
    const pw = this.W(m.x, m.z);
    const p = g.player;
    p.x = pw.x; p.z = pw.z; p.y = heightAt(p.x, p.z);
    p.char.root.position.set(p.x, p.y, p.z);
    p.char.root.rotation.y = Math.PI; // facing the net
    p.char.mode = Math.abs(mx) + Math.abs(mz) > 0.1 ? 'walk' : 'idle';
    p.char.speed = p.char.mode === 'walk' ? sp : 0;
    const ow = this.W(this.them.x, this.them.z);
    const o = this.opp;
    o.x = ow.x; o.z = ow.z;
    o.char.root.position.set(o.x, heightAt(o.x, o.z), o.z);
    o.char.root.rotation.y = 0;
    o.char.mode = this.them.moving ? 'walk' : 'idle';
    o.char.speed = this.them.moving ? 3 : 0;
    // ball + shadow
    if (this.ball) {
      const bw = this.W(this.ball.x, this.ball.z);
      this.ballMesh.visible = this.shadow.visible = true;
      this.ballMesh.position.set(bw.x, this.y0 + this.ball.y, bw.z);
      this.shadow.position.set(bw.x, this.y0 + 0.01, bw.z);
    } else this.ballMesh.visible = this.shadow.visible = false;
    const b = this.ball;
    this.mark.visible = !!(b && this.phase === 'rally' && b.last === 'them' && b.bounces === 0 && b.vz > 0);
    if (this.mark.visible) {
      const pr = this.predict(b), mw = this.W(pr.lx, pr.lz);
      this.mark.position.set(mw.x, this.y0 + 0.012, mw.z);
      this.mark.scale.setScalar(1 + Math.sin(performance.now() / 90) * 0.12);
    }
  }

  rally(dt, want) {
    const b = this.ball;
    const prevZ = b.z;
    b.vy -= G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    // net
    if (Math.sign(prevZ) !== Math.sign(b.z) && b.y < NET_H) {
      return this.point(b.last === 'me' ? 'them' : 'me', 'Into the net!');
    }
    // bounce
    if (b.y <= 0.075) {
      b.y = 0.075;
      const side = b.z > 0 ? 'me' : 'them';
      const out = Math.abs(b.x) > HALF_W || Math.abs(b.z) > HALF_L;
      if (b.bounces === 0 && out) return this.point(b.last === 'me' ? 'them' : 'me', 'OUT!');
      if (b.bounces === 0 && side === b.last) return this.point(side === 'me' ? 'them' : 'me', 'Short!');
      b.bounces++;
      if (b.bounces >= 2) return this.point(side === 'me' ? 'them' : 'me', 'Double bounce!');
      b.vy = Math.abs(b.vy) * 0.72;
      b.vx *= 0.9; b.vz *= 0.9;
      audio.tone({ freq: 300, type: 'sine', dur: 0.04, vol: 0.08 });
    }
    if (Math.abs(b.z) > HALF_L + 6 || Math.abs(b.x) > HALF_W + 6) {
      // it bounced in and got past them: a winner for whoever hit it
      if (b.bounces >= 1) return this.point(b.last === 'me' ? 'me' : 'them', b.last === 'me' ? 'Winner!' : 'Blew right past you!');
      return this.point(b.last === 'me' ? 'them' : 'me', 'Way out!');
    }
    // Lee's swing
    const m = this.me;
    const d = Math.hypot(b.x - m.x, b.z - m.z);
    if (want) {
      if (b.last === 'them' && b.z > 0 && d < REACH && b.y < 2.2) {
        if (b.bounces === 0 && m.z < KITCHEN) { this.g.player.char.play('swing', 0.3); return this.point('them', 'Kitchen violation! No volleys in the kitchen.'); }
        this.timingErr = clamp((d - 0.5) / REACH, 0, 1) * rand(-1, 1) * 0.6;
        this.hit('me');
      } else {
        this.g.player.char.play('swing', 0.3); // whiff
        if (b.last === 'them' && b.z > 0 && d < REACH * 2) this.msg = 'Whiff! Get closer.';
      }
      this.render();
    }
    // the opponent chases and returns
    const t = this.them;
    if (b.last === 'me' && b.vz < 0) {
      // read the shot: get behind the bounce (a sharp player reads it sooner and better)
      if (t.readFor !== b) {
        const pr = this.predict(b);
        const slop = (1 - this.skill) * 1.6;
        t.read = { x: pr.hx + rand(-slop, slop), z: pr.hz + rand(-slop, slop) * 0.5 };
        t.readFor = b;
        t.react = 0.25 - this.skill * 0.18;
      }
      t.react -= dt;
      if (t.react <= 0) {
        t.tx = clamp(t.read.x - 0.35, -HALF_W - 1, HALF_W + 1);
        t.tz = clamp(t.read.z - 0.4, -HALF_L - 2, -KITCHEN - 0.2);
      }
    } else { t.tx = clamp(b.x * 0.4, -1.5, 1.5); t.tz = -5.8; }
    const dx = t.tx - t.x, dz = t.tz - t.z, dd = Math.hypot(dx, dz);
    const osp = 2.6 + this.skill * 1.6;
    t.moving = dd > 0.2;
    if (t.moving) { t.x += (dx / dd) * Math.min(osp * dt, dd); t.z += (dz / dd) * Math.min(osp * dt, dd); }
    const od = Math.hypot(b.x - t.x, b.z - t.z);
    if (b.last === 'me' && b.z < 0 && od < REACH * (0.8 + this.skill * 0.3) && b.y < 2.2 && b.y > 0.15 && (b.bounces >= 1 || (Math.abs(t.z) > KITCHEN && b.y < 1.4))) {
      if (b.whiffed) return;
      if (Math.random() < 0.05 * (1.3 - this.skill)) { b.whiffed = true; this.opp.char.play('swing', 0.3); this.msg = `${this.oppFirst} whiffs!`; this.render(); return; }
      this.hit('them');
    }
  }

  cam(dt) {
    const rig = this.g.camRig;
    const V = this.g.player.char.root.position.constructor;
    const pw = this.W(this.me.x * 0.6, this.me.z + 5.5);
    const look = this.W(this.me.x * 0.3, -2);
    const pos = new V(pw.x, this.y0 + 3.4, pw.z);
    const lk = new V(look.x, this.y0 + 0.6, look.z);
    if (!rig.cinematic) rig.cinematic = { pos: pos.clone(), look: lk.clone() };
    rig.cinematic.pos.lerp(pos, 1 - Math.exp(-5 * dt));
    rig.cinematic.look.lerp(lk, 1 - Math.exp(-5 * dt));
  }

  render() {
    const el = (id) => document.getElementById(id);
    if (!el('pb-score')) return;
    el('pb-score').innerHTML = `<b>${this.score.me}</b> — <b>${this.score.them}</b>`;
    el('pb-msg').textContent = this.msg;
  }

  finish(forfeit) {
    if (this.done) return;
    this.done = true;
    this.endT = 3;
    this.ball = null;
    const g = this.g;
    const won = !forfeit && this.score.me > this.score.them;
    if (won) {
      g.addMoney(this.bet * 2, 'pickleball');
      g.xp('str', 2);
      g.xp('stat', 1);
      g.achievement('pickle');
      g.state.counters.pickleWins = (g.state.counters.pickleWins || 0) + 1;
      audio.play('levelup');
      this.msg = `YOU WIN ${this.score.me}–${this.score.them}! ${this.oppFirst} throws ${this.her} paddle into the retention pond. +${money(this.bet * 2)}`;
    } else {
      audio.play('sadTrombone');
      this.msg = forfeit ? 'You forfeit. Your knee thanks you.' : `${this.oppFirst} wins ${this.score.them}–${this.score.me}. "Nice try, sweetie." You're out ${money(this.bet)}.`;
    }
    this.render();
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    const g = this.g;
    g.scene.remove(this.group);
    this.ballMesh.geometry.dispose();
    this.shadow.geometry.dispose();
    this.mark.geometry.dispose();
    for (const m of [this.ballMesh, this.shadow, this.mark]) m.material.dispose();
    if (g.npcs.includes(this.opp)) g.removeNPC(this.opp);
    g.player.char.setHeld(this.prevHeld && this.prevHeld !== 'fists' ? this.prevHeld : (g.state.weapon === 'fists' ? null : g.state.weapon));
    g.player.char.mode = 'idle';
    g.camRig.cinematic = null;
    document.getElementById('minigame').classList.remove('mg-3d');
    g.endMinigame();
  }
}

export function pickleballNode(g) {
  const play = (bet, skill) => () => { g.startMinigame('pickle', { bet, skill }); g.ui.closeDialogue(); return 'keep'; };
  return {
    name: 'Pickleball Hustle', title: 'Winners stay. Losers file complaints.',
    text: '"Twenty bucks says you can\'t return my dink shot, old man." — a 70-year-old in compression sleeves. Game to 5, win by 2.',
    choices: [
      { text: 'Play a game', tag: `bet ${money(40)}`, disabled: g.state.money < 40, action: play(40, 0.5) },
      { text: 'Take on the club champion', tag: `bet ${money(150)}`, disabled: g.state.money < 150, action: play(150, 0.82) },
      { text: 'Walk away', action: () => null },
    ],
  };
}
