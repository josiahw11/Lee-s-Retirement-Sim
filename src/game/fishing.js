// Pier fishing off Boca Pier. Hold SPACE to charge a cast, let go to throw. Watch the bobber: nibbles
// are teases, the DUNK is the bite — hit SPACE to set the hook. Then it's a tug of war: hold SPACE to
// reel, ease off when the fish surges (red tension snaps the line, slack lets it run). Captain Roy buys
// everything you land, including, regrettably, the dentures.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { BEACH } from '../world/beach.js';
import { audio } from '../core/audio.js';
import { clamp, rand, pick, money } from '../core/utils.js';

const WATER = -0.3;
const FISH = [
  { name: 'Mullet', w: [1, 3], lb: 3, p: 30, str: 0.32, col: '#9aa4ad' },
  { name: 'Sheepshead', w: [2, 6], lb: 5, p: 18, str: 0.42, col: '#c9c9b0', stripes: true },
  { name: 'Snook', w: [4, 12], lb: 4, p: 16, str: 0.55, col: '#c8c2a0' },
  { name: 'Redfish', w: [5, 15], lb: 4, p: 13, str: 0.6, col: '#c9743a' },
  { name: 'Grouper', w: [12, 45], lb: 3.2, p: 6, str: 0.8, col: '#6b5a3a', far: true },
  { name: 'Tarpon, the Silver King', w: [70, 150], lb: 3.5, p: 1.2, str: 1, col: '#dfe8ef', far: true, legend: true },
];
const JUNK = [
  { name: 'Old boot', val: 0, line: 'A size 11 orthopedic. Still laced.' },
  { name: 'Somebody\'s dentures', val: 5, line: 'Uppers AND lowers. Mildred will want these back.', ach: 'dentures' },
  { name: 'A golf ball', val: 2, line: 'Titleist Pro V1. Gus will pay two bucks. Everyone pays two bucks.' },
  { name: 'Flip-flop (left)', val: 0, line: 'The right one is out there somewhere. Living its best life.' },
  { name: 'Message in a bottle', val: 20, line: '"Help. I\'m trapped in an HOA. — Earl, 1994." Roy buys it for the bottle.' },
];

const box = () => document.getElementById('mg-box');

function fishMesh(f, lbs) {
  const s = 0.5 + Math.cbrt(lbs) * 0.28;
  const parts = [
    [GEO.sph, f.col, mat4(0, 0, 0, 0, 0.12 * s, 0.1 * s, 0.34 * s)],
    [GEO.cone, f.col, mat4(0, 0, -0.38 * s, 0, 0.1 * s, 0.14 * s, 0.03 * s, Math.PI / 2)],
    [GEO.cone, f.col, mat4(0, 0.1 * s, -0.02 * s, 0, 0.02 * s, 0.1 * s, 0.1 * s)],
    [GEO.sph, '#111', mat4(0.07 * s, 0.03 * s, 0.24 * s, 0, 0.02 * s, 0.02 * s, 0.02 * s)],
    [GEO.sph, '#111', mat4(-0.07 * s, 0.03 * s, 0.24 * s, 0, 0.02 * s, 0.02 * s, 0.02 * s)],
  ];
  if (f.stripes) for (let i = -2; i <= 2; i++) parts.push([GEO.box, '#2a2a2a', mat4(0, 0, i * 0.1 * s, 0, 0.245 * s, 0.19 * s, 0.025 * s)]);
  const m = new THREE.Mesh(mergeParts(parts), M.vc);
  m.castShadow = true;
  return m;
}

export class Fishing {
  constructor(g, { spotX = 456 } = {}) {
    this.g = g;
    this.fullSpeed = true;
    const P = BEACH.pier;
    this.deck = P.h;
    this.spot = { x: spotX, z: P.z - P.w / 2 + 0.9 }; // north rail, looking out to sea (-z)
    const p = g.player;
    this.prevHeld = p.char.heldType;
    p.char.setHeld('rod');
    p.char.poseRod = true;
    p.x = this.spot.x; p.z = this.spot.z;
    this.phase = 'aim';
    this.power = 0;
    this.t = 0;
    this.catches = [];
    this.cash = 0;
    this.msg = pick(['"Fish are biting today," says Phil. Phil says that every day.', 'The Gulf is calm. Your bladder is not. Let\'s make this quick.']);
    this.group = new THREE.Group();
    g.scene.add(this.group);
    const bob = mergeParts([
      [GEO.sph, '#e84a5f', mat4(0, 0.03, 0, 0, 0.08, 0.06, 0.08)],
      [GEO.sph, '#f4f4f4', mat4(0, -0.02, 0, 0, 0.078, 0.05, 0.078)],
      [GEO.cyl, '#222', mat4(0, 0.11, 0, 0, 0.01, 0.1, 0.01)],
    ]);
    this.bobber = new THREE.Mesh(bob, M.vc);
    this.bobber.visible = false;
    this.group.add(this.bobber);
    this.linePts = new Float32Array(16 * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.8 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.group.add(this.line);
    this.bob = { x: 0, z: 0, y: WATER };
    box().onclick = null;
    box().innerHTML = `
      <div class="sb-head"><span class="mg-title">🎣 PIER FISHING</span><span class="gf-info" id="fi-log"></span></div>
      <div class="fi-meter"><span id="fi-label">CAST</span><div class="fi-bar"><i id="fi-fill"></i><b class="fi-zone" id="fi-zone"></b></div></div>
      <div class="mg-msg" id="fi-msg"></div>
      <div class="sb-btns"><button class="btn big" id="fi-go">HOLD: CAST / REEL</button><button class="btn" id="fi-quit">PACK UP</button></div>
      <div class="mg-hint">Hold SPACE to charge a cast • SPACE on the DUNK to hook • hold SPACE to reel, ease off when it surges • ESC to pack up</div>`;
    document.getElementById('minigame').classList.add('mg-3d');
    document.getElementById('fi-quit').addEventListener('pointerdown', (e) => { e.preventDefault(); this.wantQuit = true; });
    const b = document.getElementById('fi-go');
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.btnDown = true; this.btnHit = true; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { this.btnDown = false; });
    this.render();
  }

  tip() {
    // the real rod tip (the held rod runs along the hand's -y; its far end is 1.9 m out)
    const h = this.g.player.char.held;
    if (!h) return { x: this.spot.x, y: this.deck + 2.2, z: this.spot.z - 1.5 };
    h.updateWorldMatrix(true, false);
    this._tip ||= new THREE.Vector3();
    this._tip.set(0, -1.9, 0).applyMatrix4(h.matrixWorld);
    return { x: this._tip.x, y: this._tip.y, z: this._tip.z };
  }

  update(dt, input) {
    const g = this.g;
    this.t += dt;
    this.cam(dt);
    this.pose();
    if (input.rawHit('Escape') || input.rawHit('PadB') || this.wantQuit) return this.quit();
    const held = input.down.has('Space') || (input.pad && input.pad.held.has('PadA')) || this.btnDown;
    const hit = input.rawHit('Space') || input.rawHit('PadA') || this.btnHit;
    this.btnHit = false;
    const b = this.bob;
    switch (this.phase) {
      case 'aim':
        if (held) { this.charging = true; this.power = Math.min(1, this.power + dt / 1.1); }
        else if (this.charging) this.cast();
        break;
      case 'cast': {
        this.flyT += dt / 0.8;
        const u = Math.min(1, this.flyT);
        const tp = this.tip();
        b.x = tp.x + (this.target.x - tp.x) * u;
        b.z = tp.z + (this.target.z - tp.z) * u;
        b.y = tp.y + (WATER - tp.y) * u + Math.sin(u * Math.PI) * 3.5;
        if (u >= 1) {
          this.phase = 'wait';
          this.biteT = rand(2, 7) * this.biteMul();
          this.nibbles = Math.floor(rand(0, 3));
          g.particles.burst('drop', b.x, WATER, b.z, 8, { speed: 1, up: 1.5, life: 0.5, size: 0.12, gravity: 9 });
          audio.tone({ freq: 300, to: 120, type: 'sine', dur: 0.12, vol: 0.12 });
        }
        break;
      }
      case 'wait':
        b.y = WATER + Math.sin(this.t * 2.3) * 0.03;
        this.biteT -= dt;
        if (this.nibbles > 0 && this.biteT < this.nibbles * 1.1 && !this.nibT) this.nibT = 0.25;
        if (this.nibT) { this.nibT -= dt; b.y -= 0.05; if (this.nibT <= 0) { this.nibT = 0; this.nibbles--; audio.tone({ freq: 600, type: 'sine', dur: 0.04, vol: 0.05 }); } }
        if (hit && this.biteT > 0) { this.msg = pick(['Too early! You yanked it out of the water.', 'Patience, grasshopper. That was a nibble.']); this.reset(); break; }
        if (this.biteT <= 0) {
          this.phase = 'bite';
          this.hookT = 0.65;
          this.msg = '!!! DUNK !!! — HIT SPACE!';
          audio.play('splash', { vol: 0.3 });
          g.particles.burst('drop', b.x, WATER, b.z, 6, { speed: 0.8, up: 1.2, life: 0.4, size: 0.1, gravity: 9 });
          this.render();
        }
        break;
      case 'bite':
        b.y = WATER - 0.18;
        this.hookT -= dt;
        if (hit) this.hook();
        else if (this.hookT <= 0) { this.msg = pick(['It stole your bait! Crafty little...', 'Missed it. The fish is laughing at you.']); this.reset(); }
        break;
      case 'reel': this.reel(dt, held); break;
      case 'show':
        this.showT -= dt;
        if (this.trophy) { const tp = this.tip(); this.trophy.position.set(tp.x, tp.y - 0.9, tp.z + 0.2); this.trophy.rotation.z = Math.sin(this.t * 9) * 0.5; }
        if (this.showT <= 0) this.reset();
        break;
    }
    this.draw();
    if (this.phase === 'aim' || this.phase === 'reel') this.renderMeter();
  }

  biteMul() {
    const h = this.g.state.minutes / 60;
    return (h >= 5 && h < 8) || (h >= 17 && h < 20) ? 0.6 : 1; // dawn and dusk: they're biting
  }

  cast() {
    this.charging = false;
    const d = 5 + this.power * 23;
    this.castDist = d;
    this.target = { x: this.spot.x + rand(-2.5, 2.5), z: this.spot.z - 1.5 - d };
    this.phase = 'cast';
    this.flyT = 0;
    this.bobber.visible = this.line.visible = true;
    this.g.player.char.play('swing', 0.5);
    audio.tone({ freq: 1400, to: 500, type: 'sine', dur: 0.35, vol: 0.06 }); // zzzzing
    this.msg = d > 20 ? 'A monster cast! The big ones live out there.' : d > 12 ? 'Nice cast.' : 'A gentle plop by the pilings.';
    this.render();
  }

  hook() {
    const far = this.castDist > 16;
    const h = this.g.state.minutes / 60, night = h >= 20 || h < 5;
    // junk sometimes; otherwise weighted by distance (the big ones live far out)
    if (Math.random() < 0.12) this.fish = { junk: pick(JUNK), str: 0.25, stamina: 0.5 };
    else {
      const pool = FISH.filter((f) => !f.far || far).map((f) => ({ f, p: f.p * (f.legend && night ? 2 : 1) * (f.far ? 1.5 : 1) }));
      let r = Math.random() * pool.reduce((a, x) => a + x.p, 0), f = pool[0].f;
      for (const x of pool) { r -= x.p; if (r <= 0) { f = x.f; break; } }
      const lbs = rand(f.w[0], f.w[1]);
      this.fish = { f, lbs, str: f.str, stamina: 1 + lbs / 40 };
    }
    this.phase = 'reel';
    this.tension = 0.3;
    this.len = Math.hypot(this.bob.x - this.spot.x, this.bob.z - this.spot.z);
    this.surgeT = rand(1, 2.5);
    this.slackT = 0;
    this.msg = this.fish.junk ? 'Hooked! It\'s... not fighting much.' : this.fish.str > 0.75 ? 'HOOKED! Something BIG! The rod is bending like your spine!' : 'Hooked! Reel it in!';
    audio.play('pickup');
    this.render();
  }

  reel(dt, held) {
    const F = this.fish;
    // the fish pulls in waves and surges; surges are when you let off
    this.surgeT -= dt;
    let pull = F.str * (0.55 + 0.35 * Math.sin(this.t * 2.2)) * clamp(F.stamina, 0.25, 1.2);
    if (this.surgeT < 0) { pull *= 2.1; if (this.surgeT < -0.9) this.surgeT = rand(1.2, 3); }
    if (this.surgeT < 0 && this.surgeT > -dt * 1.5) { this.msg = F.junk ? 'It\'s snagged on something!' : 'It\'s making a RUN!'; this.render(); }
    if (held) {
      this.tension += (0.3 + pull * 1.2) * dt;
      this.len -= (2.4 - pull * 1.1) * dt;
    } else {
      this.tension -= 0.75 * dt;
      this.len += pull * 1.6 * dt; // line pays out
    }
    this.tension = clamp(this.tension, 0, 1.05);
    if (this.tension > 0.35) F.stamina -= dt * 0.1;
    this.slackT = this.tension < 0.08 ? this.slackT + dt : 0;
    if (this.tension >= 1) return this.lose('SNAP! The line broke. You say a word the ladies at bingo would not approve of.');
    if (this.slackT > 1.8) return this.lose('Slack line! It shook the hook and swam off to tell its friends.');
    if (this.len > 36) return this.lose('It spooled you! All your line, gone to Cuba.');
    // the bobber thrashes along the line toward the pier
    const dir = this.len / Math.max(0.1, Math.hypot(this.bob.x - this.spot.x, this.bob.z - this.spot.z));
    this.bob.x = this.spot.x + (this.bob.x - this.spot.x) * dir + Math.sin(this.t * 3.1) * pull * 0.04;
    this.bob.z = this.spot.z + (this.bob.z - this.spot.z) * dir;
    this.bob.y = WATER - 0.05 - pull * 0.08;
    if (Math.random() < pull * dt * 6) this.g.particles.emit('drop', this.bob.x, WATER + 0.05, this.bob.z, { vx: rand(-1, 1), vy: rand(1, 2.5), vz: rand(-1, 1), life: 0.5, size: 0.12, gravity: 9 });
    if (held && Math.random() < dt * 8) audio.tone({ freq: 2200, type: 'square', dur: 0.015, vol: 0.02 }); // reel clicks
    if (this.len < 2.2) this.land();
  }

  land() {
    const g = this.g, F = this.fish;
    let val, name, line;
    if (F.junk) {
      val = F.junk.val; name = F.junk.name; line = F.junk.line;
      if (F.junk.ach) g.achievement(F.junk.ach);
    } else {
      val = Math.round(F.lbs * F.f.lb);
      name = `${F.lbs.toFixed(1)} lb ${F.f.name}`;
      line = F.f.legend ? 'THE SILVER KING! Phil drops his rod. Moe weeps openly. Sully calls his ex-wife to brag.' : F.lbs > (F.f.w[0] + F.f.w[1]) / 2 + (F.f.w[1] - F.f.w[0]) * 0.3 ? 'A real lunker! Phil is jealous. Phil will lie about this.' : pick(['Not bad for an old man.', 'Roy nods. That\'s Roy for "impressive."', 'Into the cooler it goes.']);
      const c = g.state.counters;
      c.fish = (c.fish || 0) + 1;
      c.bigFish = Math.max(c.bigFish || 0, F.lbs);
      g.achievement('angler');
      if (F.f.legend) { g.achievement('silverking'); g.celebrate?.(8, this.spot.x, this.spot.z - 6); }
      this.trophy = fishMesh(F.f, F.lbs);
      this.group.add(this.trophy);
      g.xp('stat', F.f.legend ? 3 : 0.3);
    }
    if (val) g.addMoney(val, 'fish sold to Captain Roy');
    this.cash += val;
    this.catches.push(name);
    this.msg = `🎣 ${name}! ${line}${val ? ` Captain Roy pays ${money(val)}.` : ''}`;
    audio.play(F.f && F.f.legend ? 'levelup' : 'success', { vol: 0.6 });
    this.phase = 'show';
    this.showT = F.f && F.f.legend ? 4.5 : 2.6;
    this.bobber.visible = this.line.visible = false;
    this.render();
  }

  lose(why) {
    this.msg = why;
    audio.play('fail', { vol: 0.5 });
    this.reset();
  }

  reset() {
    if (this.trophy) { this.group.remove(this.trophy); this.trophy.geometry.dispose(); this.trophy = null; }
    this.phase = 'aim';
    this.power = 0;
    this.charging = false;
    this.fish = null;
    this.bobber.visible = this.line.visible = false;
    this.render();
  }

  // bobber + a sagging line from the rod tip
  draw() {
    const b = this.bob, tp = this.tip();
    this.bobber.position.set(b.x, b.y + 0.05, b.z);
    if (!this.line.visible) return;
    const sag = this.phase === 'reel' ? (1 - this.tension) * 1.2 : this.phase === 'cast' ? 0 : 1.6;
    for (let i = 0; i < 16; i++) {
      const u = i / 15;
      this.linePts[i * 3] = tp.x + (b.x - tp.x) * u;
      this.linePts[i * 3 + 1] = tp.y + (b.y + 0.1 - tp.y) * u - Math.sin(u * Math.PI) * sag;
      this.linePts[i * 3 + 2] = tp.z + (b.z - tp.z) * u;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }

  pose() {
    const p = this.g.player;
    p.char.root.position.set(this.spot.x, this.deck, this.spot.z);
    p.char.root.rotation.y = Math.PI; // facing the Gulf
    if (p.char.mode !== 'idle') p.char.mode = 'idle';
  }

  cam(dt) {
    const rig = this.g.camRig;
    const V = this.g.player.char.root.position.constructor;
    const reel = this.phase === 'reel' || this.phase === 'bite' || this.phase === 'wait';
    const pos = new V(this.spot.x + 1.6, this.deck + 2.6, this.spot.z + 3.2);
    const look = reel ? new V((this.spot.x + this.bob.x) / 2, 0, (this.spot.z + this.bob.z) / 2) : new V(this.spot.x, 0.5, this.spot.z - 14);
    if (!rig.cinematic) rig.cinematic = { pos: pos.clone(), look: look.clone() };
    rig.cinematic.pos.lerp(pos, 1 - Math.exp(-4 * dt));
    rig.cinematic.look.lerp(look, 1 - Math.exp(-3 * dt));
  }

  renderMeter() {
    const fill = document.getElementById('fi-fill'), zone = document.getElementById('fi-zone'), label = document.getElementById('fi-label');
    if (!fill) return;
    if (this.phase === 'aim') {
      label.textContent = 'CAST';
      fill.style.width = `${this.power * 100}%`;
      fill.style.background = '#4cc9f0';
      zone.style.display = 'none';
    } else {
      label.textContent = 'TENSION';
      const t = clamp(this.tension, 0, 1);
      fill.style.width = `${t * 100}%`;
      fill.style.background = t > 0.85 ? '#ff4d4d' : t < 0.15 ? '#9aa4ad' : '#5dff7a';
      zone.style.display = '';
    }
  }

  render() {
    const el = (id) => document.getElementById(id);
    if (!el('fi-msg')) return;
    el('fi-msg').textContent = this.msg;
    el('fi-log').textContent = `${this.catches.length} caught • ${money(this.cash)}`;
    this.renderMeter();
  }

  quit() {
    const g = this.g;
    g.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.line.material.dispose();
    g.player.char.poseRod = false;
    g.player.char.setHeld(this.prevHeld && this.prevHeld !== 'fists' ? this.prevHeld : (g.state.weapon === 'fists' ? null : g.state.weapon));
    g.camRig.cinematic = null;
    document.getElementById('minigame').classList.remove('mg-3d');
    if (this.catches.length) g.ui.toast(`🎣 Packed up: ${this.catches.length} catch${this.catches.length > 1 ? 'es' : ''}, ${money(this.cash)} from Captain Roy.`, 'quest', 4);
    g.endMinigame();
  }
}
