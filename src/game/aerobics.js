// Water Aerobics with Chad: every morning 10:00–11:30 a class bobs in the clubhouse pool while a
// 71-year-old former Chippendale yells moves into a headset. Join in for a rhythm mini-game:
// hit the arrows on the beat, move with the ladies, outshine Chad.
import { POOL } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { pick, rand, clamp, chance } from '../core/utils.js';

const BPM = 112;
const BEAT = 60 / BPM;
const MOVES = ['up', 'left', 'right', 'down'];
const ARROW = { up: '↑', left: '←', right: '→', down: '↓' };
const KEYS = { up: ['ArrowUp', 'KeyW', 'PadUp'], left: ['ArrowLeft', 'KeyA', 'PadLeft'], right: ['ArrowRight', 'KeyD', 'PadRight'], down: ['ArrowDown', 'KeyS', 'PadDown'] };
const CALLS = {
  up: ['AND REACH FOR THE SKY!', 'ARMS UP, LADIES!', 'REACH! REACH! REACH!'],
  left: ['LEAN LEFT! LIKE YOUR POLITICS!', 'LEFT SIDE! FEEL IT!'],
  right: ['AND RIGHT! RIGHT!', 'OTHER SIDE, DORIS!'],
  down: ['SQUAT IT OUT!', 'DOWN! LIKE YOU DROPPED YOUR TEETH!', 'AND DIP!'],
};
const CHAD_BARKS = ['FEEL THE BURN!', 'You call that aqua jazz?!', 'Hydrate! Not with THAT, Earl!', "That's what I'm talkin' about!", 'Five more! Four more!', 'Mmm! Water resistance!'];
const X0 = POOL.x0 + 5, Z0 = POOL.z0 + 3.2; // class grid in the shallow end
const deckX = POOL.x0 + 11, deckZ = POOL.z0 - 1.6;

export function inClassHours(g) {
  const h = g.state.minutes / 60;
  return h >= 10 && h < 11.5;
}

// ---------------------------------------------------------------- the class (world side)
export class AerobicsClass {
  constructor(g) {
    this.g = g;
    this.active = false;
    this.members = [];
    this.chad = null;
    this.t = 0;
    this.beat = 0;
    this.move = 'up';
  }

  update(dt) {
    const g = this.g;
    const on = inClassHours(g);
    if (on && !this.active) this.start();
    else if (!on && this.active && !(g.minigame && g.minigame.aqua)) this.stop();
    if (!this.active) return;
    this.t += dt;
    const b = Math.floor(this.t / BEAT);
    if (b !== this.beat) {
      this.beat = b;
      if (b % 4 === 0) {
        this.move = MOVES[Math.floor(b / 4) % 4 === 3 ? 3 : (Math.floor(b / 4) * 7 + 1) % 4];
        if (chance(0.6)) this.chad.say(pick(CALLS[this.move]), 1.8);
        else if (chance(0.3)) this.chad.say(pick(CHAD_BARKS), 1.8);
      }
      this.chad.char.play(b % 2 ? 'cheer' : 'point', BEAT * 0.9);
      for (const m of this.members) {
        if (Math.random() < 0.15) continue; // not everyone keeps time
        aquaMove(m.char, Math.random() < 0.1 ? pick(MOVES) : this.move);
      }
      // faint music when you're poolside
      const p = g.player;
      if (Math.hypot(p.x - (POOL.x0 + POOL.x1) / 2, p.z - (POOL.z0 + POOL.z1) / 2) < 30 && !g.minigame) beatSound(b, 0.35);
    }
  }

  start() {
    const g = this.g;
    this.active = true;
    this.t = 0;
    this.chad = g.spawnNPC({ name: 'Chad Brickman', female: false, role: 'instructor', x: deckX, z: deckZ, state: 'static', look: { hat: 'none', shirt: 3, shorts: '#e84a5f', glasses: 'aviator', skin: '#c68863', hair: '#1c1c1c', belly: 0.85, height: 1.06, mustache: true }, homePt: { x: deckX, z: deckZ } });
    this.chad.data.face = 0;
    this.chad.data.quiet = true;
    const names = ['Myrna', 'Sylvia', 'Harriet', 'Rhoda', 'Estelle', 'Earl', 'Pearl'];
    if (!g.state.flags.aquaHint) {
      g.state.flags.aquaHint = true;
      g.ui.toast('📱 Clubhouse bulletin: "AQUA JAZZ with Chad, 10AM daily in the pool! Low impact, high attitude. Speedos encouraged."', 'quest', 7);
    }
    for (let i = 0; i < 7; i++) {
      const x = X0 + (i % 4) * 2.4 + (i >= 4 ? 1.2 : 0), z = Z0 + (i >= 4 ? 2.4 : 0);
      const female = names[i] !== 'Earl';
      const n = g.spawnNPC({ name: names[i], female, role: 'aerobics', x, z, state: 'static', look: { hat: female && chance(0.5) ? 'sunhat' : 'none', glasses: 'none' }, homePt: { x, z } });
      n.data.aqua = true;
      n.data.face = Math.PI; // facing Chad on the deck
      n.data.quiet = true;
      n.talkable = false;
      this.members.push(n);
    }
  }

  stop() {
    const g = this.g;
    this.active = false;
    for (const m of this.members) g.removeNPC(m);
    if (this.chad) g.removeNPC(this.chad);
    this.members = [];
    this.chad = null;
  }
}

// Pose a character for one beat of an aqua move.
function aquaMove(char, move) {
  char.play('aqua', BEAT * 0.95);
  char.action.move = move;
}

// kick on the beat, hat on the off-beat, a little bassline and a cheesy synth stab every bar
function beatSound(b, vol = 1) {
  audio.tone({ freq: 110, to: 45, type: 'sine', dur: 0.16, vol: 0.5 * vol });
  audio.noiseBurst({ dur: 0.04, vol: 0.12 * vol, type: 'highpass', freq: 7000, at: BEAT / 2 });
  const bass = [55, 55, 65.4, 73.4][Math.floor(b / 4) % 4];
  audio.tone({ freq: bass, type: 'sawtooth', dur: BEAT * 0.8, vol: 0.12 * vol });
  if (b % 4 === 0) for (const f of [261.6, 329.6, 392]) audio.tone({ freq: f * (Math.floor(b / 8) % 2 ? 1.122 : 1), type: 'square', dur: 0.18, vol: 0.035 * vol });
}

// ---------------------------------------------------------------- the rhythm mini-game
const box = () => document.getElementById('mg-box');

export class AquaAerobics {
  constructor(g, { onDone } = {}) {
    this.g = g;
    this.aqua = true;
    this.onDone = onDone;
    this.cls = g.aerobicsClass;
    this.t = -BEAT * 4; // one bar count-in
    this.lastBeat = -99;
    // chart: 12 bars; each bar is one move called by Chad; later bars add off-beat notes
    this.notes = [];
    for (let bar = 0; bar < 12; bar++) {
      const move = bar === 0 ? 'up' : MOVES[(bar * 5 + 2) % 4];
      for (let k = 0; k < 4; k++) {
        this.notes.push({ t: (bar * 4 + k) * BEAT, move, hit: null });
        if (bar >= 6 && k % 2 === 1 && chance(0.5)) this.notes.push({ t: (bar * 4 + k + 0.5) * BEAT, move: pick(MOVES), hit: null });
      }
    }
    this.end = this.notes[this.notes.length - 1].t + BEAT * 2;
    this.combo = 0;
    this.best = 0;
    this.perfect = 0;
    this.good = 0;
    this.miss = 0;
    this.msg = 'Chad: "ONE, TWO, THREE, FOUR — let\'s get WET, people!"';
    // Lee wades in front and center
    const p = g.player;
    this.home = { x: p.x, z: p.z };
    this.spot = { x: X0 + 3.6, z: Z0 - 1.6 };
    p.x = this.spot.x; p.z = this.spot.z; p.heading = Math.PI;
    box().onclick = null;
    box().innerHTML = `
      <div class="sb-head"><span class="mg-title">💦 AQUA JAZZ WITH CHAD</span><span class="aq-score" id="aq-score">0%</span><span class="aq-combo" id="aq-combo"></span></div>
      <div class="aq-track" id="aq-track">
        ${MOVES.map((m) => `<div class="aq-lane" data-m="${m}"><span class="aq-key">${ARROW[m]}</span></div>`).join('')}
        <div class="aq-hit"></div>
      </div>
      <div class="mg-msg" id="aq-msg"></div>
      <div class="bj-btns aq-btns">${MOVES.map((m) => `<button class="btn" data-m="${m}">${ARROW[m]}</button>`).join('')}</div>
      <div class="mg-hint">Hit the arrow (or WASD) as it reaches the line • ESC to climb out</div>`;
    document.getElementById('minigame').classList.add('mg-3d');
    for (const b of box().querySelectorAll('.aq-btns button')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.press(b.dataset.m); });
    this.track = document.getElementById('aq-track');
    this.noteEls = this.notes.map((n) => {
      const el = document.createElement('div');
      el.className = `aq-note m-${n.move}`;
      el.textContent = ARROW[n.move];
      el.style.top = `${MOVES.indexOf(n.move) * 25 + 2}%`;
      this.track.appendChild(el);
      return el;
    });
    this.render();
  }

  press(move) {
    if (this.done) return;
    // nearest unjudged note in that lane
    let best = null, bd = 1;
    for (const n of this.notes) {
      if (n.hit || n.move !== move) continue;
      const d = Math.abs(n.t - this.t);
      if (d < bd) { bd = d; best = n; }
    }
    const p = this.g.player;
    aquaMove(p.char, move);
    if (!best || bd > 0.2) {
      this.combo = 0;
      this.stray = (this.stray || 0) + 1; // flailing counts against you, so mashing every arrow doesn't pay
      this.msg = pick(['Wrong move! Chad sighs into the headset.', 'Off beat! Gloria splashes you.', '"THE OTHER LEFT!"']);
      this.render();
      return;
    }
    best.hit = bd < 0.09 ? 'perfect' : 'good';
    this[best.hit]++;
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    if (this.combo > 0 && this.combo % 8 === 0) {
      const lady = pick(this.cls.members.filter((m) => m.female));
      if (lady) lady.say(pick(['Ooh, look at HIM go!', 'Chad who?', 'Is it hot in this pool or is it just him?', 'Wait for me after class!']), 2);
      audio.play('heart', { vol: 0.5 });
    }
    this.render();
  }

  accuracy() {
    const judged = this.perfect + this.good + this.miss + (this.stray || 0) * 0.5;
    return judged ? (this.perfect + this.good * 0.6) / judged : 0;
  }

  render() {
    const pct = Math.round(this.accuracy() * 100);
    document.getElementById('aq-score').textContent = `${pct}%`;
    document.getElementById('aq-combo').textContent = this.combo >= 4 ? `${this.combo} COMBO!` : '';
    document.getElementById('aq-msg').textContent = this.msg;
  }

  update(dt, input) {
    const g = this.g;
    const p = g.player;
    // keep Lee chest-deep in the water, facing Chad
    p.char.root.position.set(this.spot.x, POOL.y - 1.15, this.spot.z);
    p.char.root.rotation.y = Math.PI;
    p.char.mode = 'idle';
    // camera: from the deep end behind Chad's line of sight, looking at the class
    const V = p.char.root.position.constructor;
    const cx = (POOL.x0 + POOL.x1) / 2;
    g.camRig.cinematic ||= { pos: new V(cx, 4, POOL.z1 + 7), look: new V(this.spot.x, -0.2, this.spot.z) };
    g.camRig.cinematic.pos.set(this.spot.x + 0.8, 3.9, POOL.z0 - 4.4);
    g.camRig.cinematic.look.set(this.spot.x, -0.4, this.spot.z + 2.2);
    if (this.done) {
      this.endT -= dt;
      if (this.endT <= 0) this.cleanup();
      return;
    }
    this.t += dt;
    const beat = Math.floor(this.t / BEAT);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      beatSound(beat, 1);
      if (beat < 0) this.msg = `Chad: "${['ONE', 'TWO', 'THREE', 'FOUR'][beat + 4]}!"`;
      // the class follows the chart's calls
      const cur = this.notes.find((n) => n.t >= beat * BEAT - 0.01);
      if (cur && beat >= 0) {
        for (const m of this.cls.members) if (Math.random() > 0.12) aquaMove(m.char, cur.move);
        if (beat % 4 === 0 && this.cls.chad) this.cls.chad.say(pick(CALLS[cur.move]), 1.6);
      }
      if (this.cls.chad) this.cls.chad.char.play(beat % 2 ? 'cheer' : 'point', BEAT * 0.9);
      this.render();
    }
    for (const m of MOVES) if (KEYS[m].some((k) => input.rawHit(k))) this.press(m);
    // misses scroll past
    for (const n of this.notes) {
      if (!n.hit && this.t - n.t > 0.2) {
        n.hit = 'miss';
        this.miss++;
        this.combo = 0;
        this.render();
      }
    }
    // notes scroll right -> left toward the hit line at 12%
    const W = 2.2; // seconds visible
    this.notes.forEach((n, i) => {
      const el = this.noteEls[i];
      const u = (n.t - this.t) / W;
      const show = u >= -0.08 && u <= 1;
      if (show !== el._show) { el._show = show; el.style.display = show ? '' : 'none'; }
      if (!show) return;
      el.style.left = `${12 + u * 88}%`;
      const cls = n.hit || '';
      if (cls !== el._cls) { el._cls = cls; el.className = `aq-note m-${n.move} ${cls}`; }
    });
    if (input.rawHit('Escape') || input.rawHit('PadB')) return this.finish(true);
    if (this.t > this.end) this.finish(false);
  }

  finish(quit) {
    if (this.done) return;
    this.done = true;
    this.endT = 3;
    const g = this.g;
    const acc = this.accuracy();
    const s = g.state;
    s.flags.aquaDay = s.day;
    if (quit) {
      this.msg = 'You climb out halfway through. Chad: "QUITTERS DON\'T GET ABS, BUDDY."';
    } else {
      const grade = acc >= 0.9 ? 'S' : acc >= 0.75 ? 'A' : acc >= 0.55 ? 'B' : acc >= 0.35 ? 'C' : 'D';
      g.xp('str', 1 + (acc >= 0.55 ? 1 : 0) + (acc >= 0.85 ? 1 : 0));
      s.buzz = Math.max(0, s.buzz - 25);
      g.player.hp = g.maxHp();
      if (acc >= 0.6) {
        g.xp('cha', 1);
        for (const id of ['doris', 'gloria', 'millie']) if (s.romance[id]) g.romance(id, acc >= 0.85 ? 8 : 4); // word travels fast
      }
      if (acc >= 0.9) g.achievement('aquaking');
      audio.play(acc >= 0.55 ? 'levelup' : 'fail');
      this.msg = `GRADE ${grade} — ${Math.round(acc * 100)}% • best combo ${this.best}. ${acc >= 0.85 ? 'The ladies are staring. Chad is sulking.' : acc >= 0.55 ? 'Solid work. Your hip only clicked twice.' : 'You mostly splashed. Enthusiastically.'} (+STR, sobered up, fully healed)`;
    }
    this.render();
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    const g = this.g;
    const p = g.player;
    p.x = (POOL.x0 + POOL.x1) / 2; p.z = POOL.z0 - 2.2; // climb out onto the deck
    g.camRig.cinematic = null;
    document.getElementById('minigame').classList.remove('mg-3d');
    g.endMinigame();
    if (this.onDone) this.onDone(this.accuracy());
    void rand; void clamp;
  }
}

// Chad's dialogue: join the class
export function talkChad(g, n) {
  const s = g.state;
  const done = s.flags.aquaDay === s.day;
  return {
    name: 'Chad Brickman', title: 'Aqua Jazz Instructor • Former Chippendale (1983–1984)',
    text: done ? '"You already did today\'s class, champ. Come back tomorrow. These abs don\'t sculpt themselves. Well, yours don\'t. Mine did."' : `*He's wearing a headset mic, a speedo, and nothing else. He is 71. He is ripped. It's upsetting.*\n\n"Hey, new guy! Aqua Jazz, every morning at ten. Low impact, high attitude. The ladies love a man who can hold a squat. Get in the water!"`,
    choices: done ? [{ text: 'Leave', action: () => null }] : [
      { text: 'Get in the pool', tag: 'rhythm game • +STR', action: () => { g.startMinigame('aqua'); g.ui.closeDialogue(); return 'keep'; } },
      { text: '"Is that speedo regulation?"', action: () => ({ name: 'Chad Brickman', title: 'Aqua Jazz', text: '"Nothing about me is regulation, buddy." *He flexes. A nearby grandmother drops her noodle.*', choices: [{ text: 'Get in the pool', action: () => { g.startMinigame('aqua'); g.ui.closeDialogue(); return 'keep'; } }, { text: 'Leave', action: () => null }] }) },
      { text: 'Leave', action: () => null },
    ],
  };
}
