// KEG STAND at the Tiki Hut. Two regulars hoist Lee upside-down over the keg; A/D keeps him balanced
// (it gets wobblier the drunker he gets), every second on the tap is a real gulp, and the crowd counts.
// SPACE taps out. Beat Manny's house record for a free bar tab — the record climbs every time you do.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { heightAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { clamp, rand, pick, money } from '../core/utils.js';

const SPOT = { x: 103.5, z: 7.5 }; // beside the Tiki Hut
const box = () => document.getElementById('mg-box');
const COUNT = ['ONE!', 'TWO!', 'THREE!', 'FOUR!', 'FIVE!', 'SIX!', 'SEVEN!', 'EIGHT!', 'NINE!', 'TEN!', 'ELEVEN!', 'TWELVE!', 'THIRTEEN!', 'FOURTEEN!', 'FIFTEEN!'];

export class KegStand {
  constructor(g) {
    this.g = g;
    this.fullSpeed = true;
    const s = g.state;
    s.kegRecord ||= 12;
    this.record = s.kegRecord;
    this.y0 = heightAt(SPOT.x, SPOT.z);
    this.t = 0;
    this.secs = 0;
    this.x = 0; this.v = 0; // balance: 0 = perfect, ±1 = over you go
    this.phase = 'hoist';
    this.hoistT = 1.2;
    this.lastCount = -1;
    this.msg = `Manny: "House record is ${this.record} seconds. Beat it and your tab's on me."`;
    this.group = new THREE.Group();
    g.scene.add(this.group);
    const keg = new THREE.Mesh(mergeParts([
      [GEO.cyl16, '#b9c0c6', mat4(0, 0.45, 0, 0, 0.3, 0.9, 0.3)],
      [GEO.torus, '#8a9096', mat4(0, 0.25, 0, 0, 0.31, 0.31, 0.6, Math.PI / 2)],
      [GEO.torus, '#8a9096', mat4(0, 0.7, 0, 0, 0.31, 0.31, 0.6, Math.PI / 2)],
      [GEO.cyl, '#333', mat4(0, 0.95, 0, 0, 0.05, 0.1, 0.05)],
      [GEO.box, '#222', mat4(0.08, 1.0, 0, 0, 0.14, 0.04, 0.04)],
      [GEO.cyl16, '#2a6fb0', mat4(0, 0.2, 0, 0, 0.42, 0.4, 0.42)], // ice bucket
    ]), M.vcShiny);
    keg.position.set(SPOT.x, this.y0, SPOT.z);
    keg.castShadow = true;
    this.group.add(keg);
    // two regulars do the hoisting, a few more come to chant
    const p = g.player;
    this.prevHeld = p.char.heldType;
    p.char.setHeld(null);
    this.helpers = [-1, 1].map((s, i) => {
      const n = g.spawnNPC({ name: ['Big Sal "The Funnel"', 'Irv the Sponge'][i], female: false, role: 'kegcrew', x: SPOT.x + s * 0.75, z: SPOT.z - 0.1, state: 'static', look: { hat: pick(['bucket', 'cap']), shirt: 1 + i * 3, belly: 1.5 } });
      n.data.quiet = true;
      return n;
    });
    this.crowd = g.npcs.filter((n) => (n.role === 'resident' || n.role === 'lady') && !n.cart && !n.hostile && !n.data.hasDog && !n.data.aqua && !n.data.hail && !n.data.riding && !n.talking && Math.hypot(n.x - SPOT.x, n.z - SPOT.z) < 60).slice(0, 5);
    this.crowd.forEach((n, i) => {
      n.data.prevState = n.state;
      const a = Math.PI - 1 + i * 0.5; // an arc behind the keg, facing the camera
      n.x = SPOT.x + Math.sin(a) * 3.2; n.z = SPOT.z + Math.cos(a) * 3.2;
      n.state = 'party';
      n.char.root.position.set(n.x, heightAt(n.x, n.z), n.z);
      n.char.root.rotation.y = Math.atan2(SPOT.x - n.x, SPOT.z - n.z);
    });
    box().onclick = null;
    box().innerHTML = `
      <div class="sb-head"><span class="mg-title">🍺 KEG STAND</span><span class="gf-info">House record: <b id="ks-rec">${this.record}s</b></span><span class="pb-score" id="ks-time">0.0s</span></div>
      <div class="ks-bal"><i class="ks-zone"></i><b id="ks-needle"></b></div>
      <div class="mg-msg" id="ks-msg"></div>
      <div class="sb-btns"><button class="btn" id="ks-l">◀ LEAN</button><button class="btn big" id="ks-out">TAP OUT</button><button class="btn" id="ks-r">LEAN ▶</button></div>
      <div class="mg-hint">A / D (or ◀ ▶) keep your balance • SPACE taps out • every second is a real gulp</div>`;
    document.getElementById('minigame').classList.add('mg-3d');
    this.btn = 0;
    const hold = (id, v) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.btn = v; });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => { this.btn = 0; });
    };
    hold('ks-l', -1); hold('ks-r', 1);
    document.getElementById('ks-out').addEventListener('pointerdown', (e) => { e.preventDefault(); this.wantOut = true; });
    this.render();
  }

  update(dt, input) {
    const g = this.g, s = g.state;
    this.t += dt;
    this.cam(dt);
    this.pose();
    if (this.phase === 'done') {
      this.endT -= dt;
      if (this.endT <= 0) this.cleanup();
      return;
    }
    if (input.rawHit('Escape') || input.rawHit('PadB')) return this.finish('quit');
    if (this.phase === 'hoist') {
      this.hoistT -= dt;
      if (this.hoistT <= 0) { this.phase = 'chug'; this.msg = 'GO GO GO GO!'; audio.play('horn', { vol: 0.4 }); this.render(); }
      return;
    }
    // balance: an inverted pendulum that gets twitchier as the buzz climbs
    const drunk = s.buzz / 100;
    const k = (c) => input.down.has(c);
    const ctl = clamp((k('KeyD') || k('ArrowRight') || k('PadRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') || k('PadLeft') ? 1 : 0) + this.btn + (input.pad ? input.pad.axes[0] || 0 : 0), -1, 1);
    // gusts: every so often the crowd jostles you
    this.gustT = (this.gustT ?? rand(1.5, 3)) - dt;
    if (this.gustT <= 0) { this.gustT = rand(1.2, 3) * (1 - drunk * 0.4); this.v += rand(0.5, 1) * (Math.random() < 0.5 ? -1 : 1) * (0.6 + drunk * 0.8); }
    this.v += (this.x * (2.4 + drunk * 2.6) + rand(-1, 1) * (1.6 + drunk * 3) + Math.sin(this.t * 1.7) * drunk + ctl * 3.4) * dt; // lean against the tip
    this.v *= Math.exp(-1.0 * dt);
    this.x += this.v * dt;
    if (Math.abs(this.x) >= 1) return this.finish('fall');
    // the gulps
    this.secs += dt;
    s.buzz = Math.min(100, s.buzz + 3.6 * dt);
    s.bladder = Math.min(100, s.bladder + 2 * dt);
    const whole = Math.floor(this.secs);
    if (whole !== this.lastCount && whole >= 1) {
      this.lastCount = whole;
      const line = COUNT[whole - 1] || `${whole}!`;
      const who = pick([...this.crowd, ...this.helpers]);
      if (who) who.say(whole === this.record ? 'TIED THE RECORD!' : whole === this.record + 1 ? 'NEW RECORD!!!' : line, 0.9);
      audio.tone({ freq: 300 + whole * 18, type: 'square', dur: 0.08, vol: 0.07 });
      audio.play('glug', { vol: 0.4 });
      if (whole % 4 === 0) s.counters.beers++;
      for (const n of this.crowd) if (Math.random() < 0.5) n.char.play('cheer', 0.8);
    }
    if (s.buzz >= 99) return this.finish('limit');
    if (input.rawHit('Space') || input.rawHit('PadA') || this.wantOut) return this.finish('out');
    this.renderLive();
  }

  pose() {
    const g = this.g, p = g.player;
    const up = this.phase === 'hoist' ? clamp(1 - this.hoistT / 1.2, 0, 1) : this.phase === 'done' && this.fell ? 0 : 1;
    // upside down, head in the keg's tap, legs in the air, wobbling with the balance
    const r = p.char.root;
    r.position.set(SPOT.x + this.x * 0.25 * up, this.y0 + (0.2 + up * 2.55), SPOT.z + 0.05);
    r.rotation.set(0, 0, up * Math.PI + this.x * 0.35 * up);
    p.char.mode = 'idle';
    for (const [i, n] of this.helpers.entries()) { // the hoisters face Lee
      const s = i ? 1 : -1;
      n.char.root.position.set(SPOT.x + s * 0.72, heightAt(n.x, n.z), SPOT.z - 0.05);
      n.char.root.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (!n.char.action) n.char.play('cheer', 0.6);
    }
  }

  cam(dt) {
    const rig = this.g.camRig;
    const V = this.g.player.char.root.position.constructor;
    const pos = new V(SPOT.x + 0.8, this.y0 + 2.2, SPOT.z + 5.2);
    const look = new V(SPOT.x, this.y0 + 1.5, SPOT.z);
    if (!rig.cinematic) rig.cinematic = { pos: pos.clone(), look: look.clone() };
    rig.cinematic.pos.lerp(pos, 1 - Math.exp(-4 * dt));
    rig.cinematic.look.lerp(look, 1 - Math.exp(-4 * dt));
  }

  renderLive() {
    const t = document.getElementById('ks-time'), nd = document.getElementById('ks-needle');
    if (!t) return;
    t.textContent = `${this.secs.toFixed(1)}s`;
    t.style.color = this.secs > this.record ? '#2f9e5b' : '';
    nd.style.left = `${50 + this.x * 48}%`;
    nd.style.background = Math.abs(this.x) > 0.7 ? '#e84a5f' : '#1d2b53';
  }

  render() {
    const m = document.getElementById('ks-msg');
    if (m) m.textContent = this.msg;
    this.renderLive();
  }

  finish(how) {
    if (this.phase === 'done') return;
    const g = this.g, s = g.state;
    this.phase = 'done';
    this.endT = 3;
    this.fell = how === 'fall';
    const secs = Math.floor(this.secs * 10) / 10;
    const beat = secs > this.record && how !== 'quit';
    s.counters.kegBest = Math.max(s.counters.kegBest || 0, secs);
    if (how === 'fall') { audio.play('crash', { vol: 0.7 }); g.camRig.addShake(0.6); }
    if (beat) {
      s.kegRecord = Math.ceil(secs) + 1;
      const tab = 100;
      g.addMoney(tab, 'Keg stand record (bar tab)');
      g.xp('stat', 2);
      g.achievement('kegstand');
      if (secs >= 20) g.achievement('kegking');
      audio.play('levelup');
      g.celebrate?.(6, SPOT.x, SPOT.z);
      this.msg = `NEW HOUSE RECORD: ${secs}s! Manny rings the bell. Free tab (+${money(tab)}). The new record is ${s.kegRecord}s. Manny has "a feeling."`;
      for (const n of this.crowd) n.say(pick(['LEGEND!', 'HE\'S NOT HUMAN!', 'Somebody call his cardiologist!', 'MARRY ME!']), 2);
    } else {
      this.msg = how === 'fall' ? `Down you go at ${secs}s — straight into the hydrangeas. The crowd loves it anyway.` : how === 'limit' ? `${secs}s. Manny cuts you off. "That's enough, champ. I've seen your liver on X-ray."` : how === 'quit' ? 'You wriggle free. Somebody boos. It was you.' : `Tapped out at ${secs}s. ${secs > this.record - 3 ? 'SO close!' : 'Respectable. For an accountant.'}`;
      if (how !== 'quit') audio.play(how === 'fall' ? 'oof' : 'burp');
    }
    this.render();
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    const g = this.g, p = g.player;
    g.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const n of this.helpers) if (g.npcs.includes(n)) g.removeNPC(n);
    for (const n of this.crowd) if (g.npcs.includes(n) && !n.hostile) { n.state = n.data.prevState || 'wander'; if (n.state === 'party') n.resumeBase(); }
    const r = p.char.root;
    r.rotation.set(0, 0, 0);
    p.x = SPOT.x + 1.2; p.z = SPOT.z + 1.5; p.y = heightAt(p.x, p.z);
    r.position.set(p.x, p.y, p.z);
    p.char.setHeld(this.prevHeld && this.prevHeld !== 'fists' ? this.prevHeld : (g.state.weapon === 'fists' ? null : g.state.weapon));
    g.camRig.cinematic = null;
    document.getElementById('minigame').classList.remove('mg-3d');
    g.endMinigame();
  }
}

export function kegChoice(g) {
  const rec = g.state.kegRecord || 12;
  return { text: `🍺 Keg stand challenge (house record: ${rec}s)`, tag: 'free tab if you beat it', action: () => { g.startMinigame('keg'); g.ui.closeDialogue(); return 'keep'; } };
}
