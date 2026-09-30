// Closest to the Pin: challenge a golfer on the tee. Aim with A/D, then the classic three-press swing:
// SPACE to start, SPACE to set power, SPACE again as the needle comes back through the accuracy mark
// (early = hook, late = slice). Real ball flight with drag, wind and sidespin; it bounces and rolls
// differently on green, fringe, fairway, rough and sand, finds water and trees, and can go in.
import * as THREE from 'three';
import { heightAt, waterAt, onFairway, onCourse } from '../world/terrain.js';
import { BUNKERS } from '../world/layout.js';
import { audio } from '../core/audio.js';
import { clamp, rand, pick, money } from '../core/utils.js';

const G = 9.8;
const LOFT = 0.44; // ~25 degrees: a mid iron that lands steep
const DRAG = 0.11;
const V0 = 22, VR = 40; // launch speed = V0 + power * VR
const BALL_GEO = new THREE.SphereGeometry(0.11, 14, 10);
const REST = { green: 0.25, fringe: 0.28, fairway: 0.32, rough: 0.16, sand: 0.02 };
const KEEP = { green: 0.45, fringe: 0.42, fairway: 0.5, rough: 0.3, sand: 0.05 };
const ROLL = { green: 1.7, fringe: 3.2, fairway: 4.5, rough: 10, sand: 40 };
const box = () => document.getElementById('mg-box');

function surface(x, z, pin) {
  if (waterAt(x, z)) return 'water';
  for (const b of BUNKERS) if (((x - b.x) / b.rx) ** 2 + ((z - b.z) / b.rz) ** 2 < 1) return 'sand';
  const d = Math.hypot(x - pin.x, z - pin.z);
  if (d < 12.5) return 'green';
  if (d < 15) return 'fringe';
  if (onFairway(x, z)) return 'fairway';
  if (onCourse(x, z)) return 'rough';
  return 'oob';
}

export class ClosestToPin {
  constructor(g, { hole, opp = null, bet = 50, onDone } = {}) {
    this.g = g;
    this.hole = hole;
    this.opp = opp;
    this.bet = bet;
    this.onDone = onDone;
    this.tee = { x: hole.tee[0], z: hole.tee[1] };
    this.tee.y = heightAt(this.tee.x, this.tee.z) + 0.11;
    this.pin = { x: hole.green[0], z: hole.green[1] };
    this.pin.y = heightAt(this.pin.x, this.pin.z);
    this.len = Math.hypot(this.pin.x - this.tee.x, this.pin.z - this.tee.z);
    this.yaw0 = Math.atan2(this.pin.x - this.tee.x, this.pin.z - this.tee.z);
    this.aim = 0;
    const wa = rand(0, Math.PI * 2), ws = rand(0, 5.5);
    this.wind = { x: Math.sin(wa) * ws, z: Math.cos(wa) * ws, mph: Math.round(ws * 2.237) };
    this.balls = [];
    this.group = new THREE.Group();
    g.scene.add(this.group);
    this.target = this.powerFor(this.len - 2); // a good shot finishes just short of the pin
    this.phase = opp ? 'opp' : 'address';
    this.waitT = 1.6;
    this.meter = 0;
    this.power = 0;
    this.msg = opp ? `${opp.name.split(' ')[0]} tees up first. "Watch and weep."` : 'A/D to aim. SPACE to start your swing.';
    // Lee steps up to the tee with an iron
    const p = g.player;
    this.prevHeld = p.char.heldType;
    p.x = this.tee.x - Math.sin(this.yaw0) * 0.9 + Math.cos(this.yaw0) * 0.5;
    p.z = this.tee.z - Math.cos(this.yaw0) * 0.9 - Math.sin(this.yaw0) * 0.5;
    p.y = heightAt(p.x, p.z);
    p.heading = this.yaw0;
    p.char.root.position.set(p.x, p.y, p.z);
    p.char.root.rotation.y = p.heading;
    p.char.setHeld('iron');
    if (opp) {
      this.oppHome = { x: opp.x, z: opp.z };
      opp.x = this.tee.x + Math.cos(this.yaw0) * 1.6;
      opp.z = this.tee.z - Math.sin(this.yaw0) * 1.6;
      opp.char.root.position.set(opp.x, heightAt(opp.x, opp.z), opp.z);
      opp.char.root.rotation.y = this.yaw0;
    }
    const windRel = Math.atan2(this.wind.x, this.wind.z) - this.yaw0;
    box().onclick = null;
    box().innerHTML = `
      <div class="sb-head"><span class="mg-title">⛳ CLOSEST TO THE PIN</span><span class="gf-info">Hole ${hole.n} • ${Math.round(this.len)} m • Bet ${money(bet)}</span><span class="gf-wind"><i style="transform:rotate(${(windRel * 180) / Math.PI}deg)">⬆</i> ${this.wind.mph} mph</span></div>
      <div class="gf-meter"><div class="gf-band" style="left:${(this.target / 1.1) * 100 - 2}%"></div><div class="gf-acc"></div><div class="gf-needle" id="gf-needle"></div><div class="gf-lock" id="gf-lock"></div></div>
      <div class="mg-msg" id="gf-msg"></div>
      <div class="sb-btns"><button class="btn" id="gf-l">◀</button><button class="btn big" id="gf-swing">SWING</button><button class="btn" id="gf-r">▶</button></div>
      <div class="mg-hint">A/D aim • SPACE start → power → accuracy (the ◆ mark) • ESC to concede</div>`;
    document.getElementById('minigame').classList.add('mg-3d');
    this.btnAim = 0;
    const hold = (el, v) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.btnAim = v; });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => { this.btnAim = 0; });
    };
    hold(document.getElementById('gf-l'), 1);
    hold(document.getElementById('gf-r'), -1);
    document.getElementById('gf-swing').addEventListener('pointerdown', (e) => { e.preventDefault(); this.press(); });
    // aim line: dots toward the pin
    this.aimDots = new THREE.Group();
    const dg = new THREE.CircleGeometry(0.18, 10).rotateX(-Math.PI / 2);
    const dm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
    for (let i = 1; i <= 14; i++) { const m = new THREE.Mesh(dg, dm); m.position.z = i * 2.2; this.aimDots.add(m); }
    this.aimDots.position.set(this.tee.x, this.tee.y, this.tee.z);
    this.group.add(this.aimDots);
    this.render();
  }

  // find the power whose straight, windless shot comes to rest `dist` down the line, by running the
  // real ball physics over this hole's actual terrain (side effects off)
  powerFor(dist) {
    let lo = 0, hi = 1.1;
    for (let it = 0; it < 18; it++) {
      const mid = (lo + hi) / 2;
      if (this.simRest(mid) < dist) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  simRest(power) {
    const v = V0 + power * VR, hv = Math.cos(LOFT) * v;
    const b = { x: this.tee.x, y: this.tee.y, z: this.tee.z, vx: Math.sin(this.yaw0) * hv, vy: Math.sin(LOFT) * v, vz: Math.cos(this.yaw0) * hv, spin: 0, state: 'fly', t: 0, sim: true };
    const w = this.wind;
    this.wind = { x: 0, z: 0 };
    for (let i = 0; i < 2400 && (b.state === 'fly' || b.state === 'roll'); i++) this.step(b, 1 / 120);
    this.wind = w;
    return b.state === 'holed' ? this.len : Math.hypot(b.x - this.tee.x, b.z - this.tee.z) * Math.cos(Math.atan2(b.x - this.tee.x, b.z - this.tee.z) - this.yaw0);
  }

  launch(who, power, aim, spin) {
    const yaw = this.yaw0 + aim;
    const v = V0 + clamp(power, 0, 1.1) * VR;
    const hv = Math.cos(LOFT) * v;
    const mesh = new THREE.Mesh(BALL_GEO, new THREE.MeshStandardMaterial({ color: who === 'me' ? 0xffd23f : 0xffffff, roughness: 0.4, emissive: who === 'me' ? 0x553d00 : 0x222222 }));
    mesh.castShadow = true;
    const b = { who, mesh, x: this.tee.x, y: this.tee.y, z: this.tee.z, vx: Math.sin(yaw) * hv, vy: Math.sin(LOFT) * v, vz: Math.cos(yaw) * hv, spin, state: 'fly', t: 0 };
    mesh.position.set(b.x, b.y, b.z);
    this.group.add(mesh);
    this.balls.push(b);
    this.active = b;
    this.phase = 'fly';
    audio.play('swing');
    audio.play('ball');
    const who3 = who === 'me' ? this.g.player.char : this.opp && this.opp.char;
    if (who3) who3.play('swing', 0.6);
  }

  // the AI golfer's shot
  oppShoot() {
    const skill = 0.55;
    const pw = this.target + rand(-0.07, 0.07) * (1.2 - skill);
    // good golfers aim off to cancel the crosswind
    const cross = (this.wind.x * Math.cos(this.yaw0) - this.wind.z * Math.sin(this.yaw0));
    this.launch('them', pw, rand(-0.025, 0.025) + cross * 0.004, rand(-0.5, 0.5) * (1.1 - skill));
  }

  press() {
    if (this.done) return;
    if (this.phase === 'address') {
      this.phase = 'power';
      this.meter = 0;
      this.msg = 'Backswing... SPACE to set the power.';
    } else if (this.phase === 'power') {
      this.power = this.meter;
      this.phase = 'accuracy';
      this.msg = 'Downswing! SPACE on the ◆ mark!';
    } else if (this.phase === 'accuracy') {
      const err = this.meter - 0.03; // the mark sits just above zero
      const spin = clamp(err * 6, -1.4, 1.4);
      this.msg = Math.abs(err) < 0.02 ? 'Pure! Right off the screws.' : err > 0 ? 'Early release... it\'s drawing left!' : 'Late! That\'s a slice!';
      this.launch('me', this.power, this.aim + rand(-0.006, 0.006), spin);
    }
    this.render();
  }

  step(b, dt) {
    const pin = this.pin;
    if (b.state === 'fly') {
      b.vy -= G * dt;
      b.vx += (this.wind.x * 0.18 - b.vx * DRAG) * dt;
      b.vz += (this.wind.z * 0.18 - b.vz * DRAG) * dt;
      b.vy -= b.vy * DRAG * 0.3 * dt;
      // sidespin: curve perpendicular to travel
      // sidespin curves the ball toward its left (+spin, a draw) or right (-spin, a slice)
      const hs = Math.hypot(b.vx, b.vz) || 1;
      const lx = b.vz / hs, lz = -b.vx / hs;
      b.vx += lx * b.spin * 4.5 * dt;
      b.vz += lz * b.spin * 4.5 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.t += dt;
      const gy = heightAt(b.x, b.z);
      // trees swat low balls
      if (b.y < gy + 7) {
        for (const o of this.g.world.col.query(b.x, b.z, 0.4)) {
          if (o.t === 'c' && o.tag === 'tree' && Math.hypot(b.x - o.x, b.z - o.z) < o.r + 0.6) {
            b.vx *= -0.3; b.vz *= -0.3; b.vy = Math.min(b.vy, 0);
            if (!b.sim) { this.msg = 'THWACK! Right into a tree.'; audio.play('thud', { vol: 0.6 }); this.render(); }
            break;
          }
        }
      }
      if (b.y <= gy + 0.11) {
        b.y = gy + 0.11;
        const s = surface(b.x, b.z, pin);
        if (s === 'water') return this.lost(b, 'SPLASH! In the drink.');
        if (s === 'oob') return this.lost(b, 'OUT OF BOUNDS. It hit a condo.');
        const bite = b.bounced ? 1 : 0.55; // backspin grabs on the first bounce
        b.bounced = true;
        if (b.sim) { b.vy = -b.vy * REST[s]; b.vx *= KEEP[s] * bite; b.vz *= KEEP[s] * bite; if (Math.abs(b.vy) < 1.4) b.state = 'roll'; return; }
        b.vy = -b.vy * REST[s];
        b.vx *= KEEP[s] * bite; b.vz *= KEEP[s] * bite;
        b.spin *= 0.3;
        audio.play('land', { vol: 0.3 });
        if (!b.landedOn) { b.landedOn = s; this.msg = { green: 'On the green!', fringe: 'Just on the fringe.', fairway: 'Fairway.', rough: 'In the rough.', sand: 'Beach! Find your sand wedge.' }[s]; this.render(); }
        if (Math.abs(b.vy) < 1.4) b.state = 'roll';
      }
    } else if (b.state === 'roll') {
      const s = surface(b.x, b.z, pin);
      if (s === 'water') return this.lost(b, 'It trickled into the water. Of course it did.');
      const sp = Math.hypot(b.vx, b.vz);
      const dpin = Math.hypot(b.x - pin.x, b.z - pin.z);
      if (dpin < 0.13 && sp < 1.6) {
        b.state = 'holed';
        b.x = pin.x; b.z = pin.z; b.y = pin.y - 0.05;
        if (b.mesh) b.mesh.position.set(b.x, b.y, b.z);
        return;
      }
      if (sp < 0.05) { b.vx = b.vz = 0; b.state = 'rest'; return; }
      const ns = Math.max(0, sp - (ROLL[s] || 3) * dt);
      b.vx *= ns / sp; b.vz *= ns / sp;
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.y = heightAt(b.x, b.z) + 0.11;
    }
    if (b.mesh) b.mesh.position.set(b.x, b.y, b.z);
  }

  lost(b, why) {
    b.state = 'lost';
    if (b.sim) return;
    b.mesh.visible = false;
    this.msg = why;
    if (why.startsWith('SPLASH') || why.includes('water')) { audio.play('splash', { vol: 0.5 }); this.g.particles.burst('drop', b.x, b.y, b.z, 14, { speed: 2, up: 4, life: 0.8, size: 0.2, gravity: 10 }); }
    this.render();
  }

  dist(b) {
    if (b.state === 'lost') return Infinity;
    if (b.state === 'holed') return 0;
    return Math.hypot(b.x - this.pin.x, b.z - this.pin.z);
  }

  camera(dt) {
    const rig = this.g.camRig;
    const dx = Math.sin(this.yaw0), dz = Math.cos(this.yaw0);
    let pos, look;
    const b = this.active;
    if (this.phase === 'fly' && b && b.state !== 'lost') {
      pos = new THREE.Vector3(b.x - dx * 9, Math.max(b.y + 3.5, heightAt(b.x, b.z) + 3), b.z - dz * 9);
      look = new THREE.Vector3(b.x + dx * 6, b.y, b.z + dz * 6);
    } else if (this.phase === 'review' || this.phase === 'result') {
      pos = new THREE.Vector3(this.pin.x - dx * 14, this.pin.y + 13, this.pin.z - dz * 14);
      look = new THREE.Vector3(this.pin.x, this.pin.y, this.pin.z);
    } else {
      pos = new THREE.Vector3(this.tee.x - dx * 6 - dz * 0.6, this.tee.y + 2.4, this.tee.z - dz * 6 + dx * 0.6);
      look = new THREE.Vector3(this.tee.x + dx * 40, this.tee.y + 1, this.tee.z + dz * 40);
    }
    if (!rig.cinematic) rig.cinematic = { pos: pos.clone(), look: look.clone() };
    rig.cinematic.pos.lerp(pos, 1 - Math.exp(-(this.phase === 'fly' ? 6 : 2.5) * dt));
    rig.cinematic.look.lerp(look, 1 - Math.exp(-(this.phase === 'fly' ? 8 : 3) * dt));
  }

  update(dt, input) {
    this.camera(dt);
    if (this.done) {
      this.endT -= dt;
      if (this.endT <= 0) this.cleanup();
      return;
    }
    if (input.rawHit('Escape') || input.rawHit('PadB')) return this.finish(true);
    const drunk = this.g.state.buzz / 100;
    if (this.phase === 'opp') {
      this.waitT -= dt;
      if (this.waitT <= 0) this.oppShoot();
    } else if (this.phase === 'address' || this.phase === 'power' || this.phase === 'accuracy') {
      const dir = (input.down.has('KeyA') || input.down.has('ArrowLeft') ? 1 : 0) - (input.down.has('KeyD') || input.down.has('ArrowRight') ? 1 : 0) + this.btnAim - (input.pad ? input.pad.axes[0] : 0);
      if (this.phase === 'address') this.aim = clamp(this.aim + dir * dt * 0.12, -0.25, 0.25);
      this.aimDots.visible = true;
      this.aimDots.rotation.y = this.yaw0 + this.aim + Math.sin(this.g.camRig.t || performance.now() / 700) * 0.01 * drunk;
      if (this.phase === 'power') { this.meter += dt * (0.75 + drunk * 0.5); if (this.meter >= 1.1) { this.power = 1.1; this.phase = 'accuracy'; this.msg = 'Full power! SPACE on the ◆ mark!'; } }
      else if (this.phase === 'accuracy') { this.meter -= dt * (1.5 + drunk * 0.8); if (this.meter < -0.12) { this.meter = -0.12; this.press(); } }
      if (input.rawHit('Space') || input.rawHit('PadA')) this.press();
      this.render();
    } else if (this.phase === 'fly') {
      this.aimDots.visible = false;
      for (let i = 0; i < 4; i++) for (const b of this.balls) if (b.state === 'fly' || b.state === 'roll') this.step(b, dt / 4);
      const b = this.active;
      if (b.state === 'fly' && Math.random() < 0.6) this.g.particles.emit('dust', b.x, b.y, b.z, { vy: 0, life: 0.4, size: 0.12, grow: 0.2 });
      if (b.state === 'rest' || b.state === 'lost' || b.state === 'holed' || b.t > 14) {
        if (b.state === 'fly' || b.state === 'roll') this.lost(b, 'Lost it in the sun.');
        this.phase = 'review';
        this.reviewT = 2.4;
        const d = this.dist(b);
        if (b.state === 'holed') {
          this.msg = b.who === 'me' ? '⛳ HOLE IN ONE!!! The whole course heard it.' : `${this.opp.name.split(' ')[0]} HOLES IT! Unbelievable.`;
          audio.play('levelup');
          this.g.celebrate(10, this.pin.x, this.pin.z);
        } else if (d < Infinity) {
          this.g.ui.float(b.x, b.y + 1.2, b.z, `${d.toFixed(1)} m`, b.who === 'me' ? '#ffd23f' : '#ffffff', 3);
          if (!this.msg || this.msg.length < 18) this.msg = `${b.who === 'me' ? 'You' : this.opp.name.split(' ')[0]}: ${d.toFixed(1)} m from the pin.`;
        }
        this.render();
      }
    } else if (this.phase === 'review') {
      this.reviewT -= dt;
      if (this.reviewT <= 0) {
        if (!this.balls.some((x) => x.who === 'me')) { this.phase = 'address'; this.meter = 0; this.msg = `Your shot. ${Math.round(this.len)} m, wind ${this.wind.mph} mph. A/D aim, SPACE to swing.`; this.render(); }
        else this.finish(false);
      }
    }
  }

  render() {
    const el = (id) => document.getElementById(id);
    if (!el('gf-needle')) return;
    el('gf-needle').style.left = `${(clamp(this.meter, -0.12, 1.1) / 1.1) * 100}%`;
    el('gf-lock').style.left = `${(this.power / 1.1) * 100}%`;
    el('gf-lock').style.display = this.phase === 'accuracy' || this.phase === 'fly' ? '' : 'none';
    el('gf-msg').textContent = this.msg;
  }

  finish(conceded) {
    if (this.done) return;
    this.done = true;
    this.endT = 3.2;
    this.phase = 'result';
    const g = this.g;
    const mine = this.balls.find((b) => b.who === 'me');
    const theirs = this.balls.find((b) => b.who === 'them');
    const dm = mine ? this.dist(mine) : Infinity, dt = theirs ? this.dist(theirs) : Infinity;
    if (conceded) { this.msg = 'You concede. The golfers chuckle and pocket your money.'; audio.play('sadTrombone'); }
    else if (dm === 0) {
      g.addMoney(this.bet * 2 + 500, 'HOLE IN ONE');
      g.achievement('ace');
      g.xp('stat', 3);
      this.msg = `ACE! Bet + a $500 hole-in-one bonus from the clubhouse. They're naming a bench after you. (+${money(this.bet * 2 + 500)})`;
    } else if (dm < dt) {
      g.addMoney(this.bet * 2, 'closest to the pin');
      g.xp('str', 1);
      g.xp('stat', 1);
      this.msg = `YOU WIN! ${dm.toFixed(1)} m vs ${dt === Infinity ? 'a lost ball' : `${dt.toFixed(1)} m`}. +${money(this.bet * 2)}`;
      audio.play('cash');
    } else if (dm === dt) { g.addMoney(this.bet, 'push'); this.msg = 'Dead even. Money back. Handshakes. Mild disappointment.'; }
    else { this.msg = `${this.opp ? this.opp.name.split(' ')[0] : 'They'} wins${dm === Infinity ? '' : ` by ${(dm - dt).toFixed(1)} m`}. You're out ${money(this.bet)}.`; audio.play('sadTrombone'); }
    this.render();
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    const g = this.g;
    g.scene.remove(this.group);
    for (const b of this.balls) b.mesh.material.dispose();
    g.camRig.cinematic = null;
    g.player.char.setHeld(this.prevHeld && this.prevHeld !== 'fists' ? this.prevHeld : (g.state.weapon === 'fists' ? null : g.state.weapon));
    if (this.opp && this.oppHome) { this.opp.x = this.oppHome.x; this.opp.z = this.oppHome.z; }
    document.getElementById('minigame').classList.remove('mg-3d');
    g.endMinigame();
    if (this.onDone) this.onDone();
  }
}

export function golferChallenge(g, npc) {
  const hole = npc.data.hole;
  if (!hole) return null;
  const play = (bet) => () => { g.startMinigame('ctp', { hole, opp: npc, bet }); g.ui.closeDialogue(); return 'keep'; };
  return {
    name: npc.name, title: `Golfer • Hole ${hole.n} tee`,
    text: pick(['"Closest to the pin? You and me, one ball each. I\'ve been practicing this shot since the Nixon administration."', '"You want to lose money to a 79-year-old with a bad shoulder? Step up to the tee, pal."']),
    choices: [
      { text: 'Closest to the pin for $50', disabled: g.state.money < 50, action: play(50) },
      { text: 'Make it interesting: $200', disabled: g.state.money < 200, action: play(200) },
      { text: 'Leave', action: () => null },
    ],
  };
}
