// Karaoke Night at the Tiki Hut (7–11PM): pick a song, and hit SPACE as the bouncing ball lands on
// each word. The backing band is procedural, the crowd cheers or boos, and (if talk-radio voice is on)
// text-to-speech "sings" each line, badly. All lyrics are originals.
import { audio } from '../core/audio.js';
import { pick, rand, clamp, chance, money } from '../core/utils.js';

export const SONGS = [
  {
    title: 'Golf Cart Baby', artist: 'The Mulligans', bpm: 116, root: 110, prog: [0, 5, 7, 5],
    lines: [
      'I got a golf cart baby and a brand new hip',
      'Nine miles an hour on a moonlight trip',
      "Your husband's at the podiatrist till three",
      'So slide on over sugar next to me',
      'Golf cart baby golf cart baby ride',
      'Pink flamingos cheering on the side',
      "The HOA can't catch us not tonight",
      'Golf cart baby hold your walker tight',
    ],
  },
  {
    title: 'Early Bird Special', artist: 'Dot & the Dentures', bpm: 100, root: 98, prog: [0, 3, 5, 7],
    lines: [
      "Four fifteen and the line's out the door",
      "Everybody's hungry nobody's bored",
      'Pocket full of coupons and a heart full of dreams',
      "Nothin' says romance like the soft serve machine",
      'Early bird early bird special for two',
      'Shrimp cocktail baby I saved some for you',
      'Home by six and in bed by eight',
      'Early bird special is the perfect date',
    ],
  },
  {
    title: 'Pension Check Blues', artist: 'Blind Lemon Goldberg', bpm: 88, root: 82.4, prog: [0, 0, 5, 7],
    lines: [
      'Woke up this morning and my back went pop',
      "Pension check's coming but the rent won't stop",
      'Spent it all at bingo on a lucky card',
      'Lost it to a lady at the Lucky Lady yard',
      'I got the pension check blues',
      'Wearing black socks with my sandal shoes',
      "Ain't got much but I got my pride",
      'And a mobility scooter I can ride',
    ],
  },
];
const STAGE = { x: 98, z: 6.8 };
const BOOS = ['BOOOO!', 'Get off the stage!', 'My hearing aid is BLEEDING!', 'Play Sinatra!', "Don't quit your day job! Oh wait."];
const CHEERS = ['WOOOO!', 'ENCORE!', "He's got SOUL!", 'I love you, Lee!', "That's my kind of crooner!"];
const box = () => document.getElementById('mg-box');

export function karaokeOpen(g) {
  const h = g.state.minutes / 60;
  return h >= 19 && h < 23;
}

export class Karaoke {
  constructor(g, { song = 0 } = {}) {
    this.g = g;
    this.song = SONGS[song];
    this.beat = 60 / this.song.bpm;
    // timeline: 2-bar intro, each line gets 8 beats; words spread over the first 6
    this.words = [];
    this.lines = this.song.lines.map((text, li) => {
      const ws = text.split(' ');
      const start = (8 + li * 8) * this.beat;
      const step = Math.max(0.5, Math.round((6 / ws.length) * 2) / 2);
      const words = ws.map((w, i) => {
        const o = { w, t: start + i * step * this.beat, line: li, hit: null };
        this.words.push(o);
        return o;
      });
      return { text, start, words };
    });
    this.end = (8 + this.lines.length * 8 + 2) * this.beat;
    this.t = 0;
    this.lastBeat = -1;
    this.crowd = 50 + (g.state.buzz > 25 && g.state.buzz < 75 ? 10 : 0); // a little liquid courage
    this.perfect = this.good = this.miss = 0;
    this.lineSung = -1;
    this.msg = `DJ Manny: "Put your hands together for ${g.state.name}!"`;
    // Lee takes the stage with a mic
    const p = g.player;
    this.prevHeld = p.char.heldType;
    p.x = STAGE.x; p.z = STAGE.z; p.heading = 0;
    p.char.root.position.set(p.x, p.y, p.z);
    p.char.root.rotation.y = 0;
    p.char.setHeld('mic');
    // gather a crowd
    const pool = g.npcs.filter((n) => (n.role === 'resident' || n.role === 'lady') && !n.cart && n.state !== 'ko' && !n.hostile && !n.data.aqua && !n.data.hasDog);
    pool.sort((a, b) => Math.hypot(a.x - STAGE.x, a.z - STAGE.z) - Math.hypot(b.x - STAGE.x, b.z - STAGE.z));
    this.crowdNPCs = pool.slice(0, 9);
    this.crowdNPCs.forEach((n, i) => {
      n.data.prevState = n.state;
      n.x = STAGE.x - 4 + (i % 5) * 2 + rand(-0.3, 0.3);
      n.z = STAGE.z + 4.5 + Math.floor(i / 5) * 1.8 + rand(-0.3, 0.3);
      n.state = 'party';
      n.char.root.position.set(n.x, n.y, n.z);
      n.char.root.rotation.y = Math.PI; // facing the stage
    });
    box().onclick = null;
    box().innerHTML = `
      <div class="sb-head"><span class="mg-title">🎤 KARAOKE NIGHT</span><span class="gf-info">"${this.song.title}" — ${this.song.artist}</span><span class="kk-crowd">CROWD <b id="kk-crowd"></b></span></div>
      <div class="kk-screen"><div class="kk-line" id="kk-line"></div><div class="kk-next" id="kk-next"></div></div>
      <div class="mg-msg" id="kk-msg"></div>
      <div class="sb-btns"><button class="btn big" id="kk-sing">🎤 SING</button></div>
      <div class="mg-hint">SPACE (or the button) as the ball lands on each word • ESC to run off stage</div>`;
    document.getElementById('minigame').classList.add('mg-3d');
    document.getElementById('kk-sing').addEventListener('pointerdown', (e) => { e.preventDefault(); this.press(); });
    this.renderLine(0);
    this.render();
  }

  renderLine(li) {
    const L = this.lines[li];
    const el = document.getElementById('kk-line');
    if (!el) return;
    el.innerHTML = L ? L.words.map((w, i) => `<span data-i="${i}">${w.w}</span>`).join(' ') + '<i class="kk-ball" id="kk-ball">●</i>' : '';
    const nx = this.lines[li + 1];
    document.getElementById('kk-next').textContent = nx ? nx.text : '';
    this.curLine = li;
  }

  press() {
    if (this.done) return;
    let best = null, bd = 1;
    for (const w of this.words) {
      if (w.hit) continue;
      const d = Math.abs(w.t - this.t);
      if (d < bd) { bd = d; best = w; }
    }
    const drunk = this.g.state.buzz / 100;
    const win = drunk > 0.8 ? 0.12 : 0.19; // too drunk: sloppy timing
    if (!best || bd > win) {
      this.crowd = clamp(this.crowd - 2, 0, 100);
      this.msg = pick(['*mic feedback* SKREEEE', 'You sang a word that isn\'t in the song.', 'Off beat! Manny winces.']);
      audio.tone({ freq: 2600, type: 'square', dur: 0.12, vol: 0.05 });
      this.render();
      return;
    }
    best.hit = bd < 0.09 ? 'perfect' : 'good';
    this[best.hit]++;
    this.crowd = clamp(this.crowd + (best.hit === 'perfect' ? 3 : 1.5), 0, 100);
    // Lee sings the note
    const s = this.song;
    const f = s.root * 2 * Math.pow(2, (s.prog[Math.floor(best.t / (this.beat * 4)) % 4] + [0, 4, 7, 12][Math.floor(Math.random() * 4)]) / 12);
    audio.tone({ freq: f, type: 'triangle', dur: this.beat * 0.45, vol: 0.09 });
    this.g.player.char.play(chance(0.3) ? 'cheer' : 'point', 0.4);
    this.render();
  }

  band(b) {
    const s = this.song;
    const bar = Math.floor(b / 4);
    const root = s.root * Math.pow(2, s.prog[bar % 4] / 12);
    audio.tone({ freq: 70, to: 40, type: 'sine', dur: 0.16, vol: b % 2 === 0 ? 0.45 : 0.2 }); // kick
    if (b % 2 === 1) audio.noiseBurst({ dur: 0.08, vol: 0.12, type: 'bandpass', freq: 1800 }); // snare
    audio.noiseBurst({ dur: 0.03, vol: 0.06, type: 'highpass', freq: 7000, at: this.beat / 2 });
    audio.tone({ freq: root, type: 'sawtooth', dur: this.beat * 0.9, vol: 0.1 }); // bass
    if (b % 4 === 0) for (const k of [0, 4, 7]) audio.tone({ freq: root * 2 * Math.pow(2, k / 12), type: 'square', dur: this.beat * 3.5, vol: 0.022 }); // organ chord
  }

  render() {
    const el = (id) => document.getElementById(id);
    if (!el('kk-crowd')) return;
    el('kk-crowd').textContent = `${Math.round(this.crowd)}%`;
    el('kk-crowd').style.color = this.crowd > 70 ? '#2e9a5a' : this.crowd < 30 ? '#b8323a' : '#c99a16';
    el('kk-msg').textContent = this.msg;
    const L = this.lines[this.curLine];
    if (L) L.words.forEach((w, i) => {
      const sp = el('kk-line').querySelector(`span[data-i="${i}"]`);
      if (sp) sp.className = w.hit || (w.t < this.t ? 'past' : '');
    });
  }

  update(dt, input) {
    const g = this.g;
    // camera from the crowd, looking up at the stage
    const V = g.player.char.root.position.constructor;
    g.camRig.cinematic ||= { pos: new V(STAGE.x + 2.5, 2.2, STAGE.z + 8.5), look: new V(STAGE.x, 1.4, STAGE.z) };
    g.camRig.cinematic.pos.set(STAGE.x + 2.2, 2.3, STAGE.z + 8.8);
    g.camRig.cinematic.look.set(STAGE.x - 0.3, 1.3, STAGE.z);
    if (this.done) {
      this.endT -= dt;
      if (this.endT <= 0) this.cleanup();
      return;
    }
    if (input.rawHit('Escape') || input.rawHit('PadB')) return this.finish(true);
    this.t += dt;
    const b = Math.floor(this.t / this.beat);
    if (b !== this.lastBeat) {
      this.lastBeat = b;
      this.band(b);
      // the crowd reacts
      for (const n of this.crowdNPCs) {
        if (this.crowd > 65 && chance(0.25)) n.char.play(pick(['cheer', 'dance', 'wave']), this.beat * 2);
        else if (this.crowd < 30 && chance(0.12)) n.char.play('shake', this.beat * 2);
      }
      if (b % 8 === 4 && chance(0.5)) {
        const n = pick(this.crowdNPCs);
        if (n) n.say(this.crowd > 65 ? pick(CHEERS) : this.crowd < 30 ? pick(BOOS) : pick(['Not bad!', 'Is this the Beatles?', 'Who is this guy?']), 2);
      }
    }
    // advance lyric lines; TTS croons each line as it starts
    const li = this.lines.findIndex((L, i) => this.t >= L.start - this.beat && (i === this.lines.length - 1 || this.t < this.lines[i + 1].start - this.beat));
    if (li >= 0 && li !== this.curLine) this.renderLine(li);
    if (li >= 0 && li !== this.lineSung && this.t >= this.lines[li].start) {
      this.lineSung = li;
      audio.say(this.lines[li].text, { rate: 1.15, pitch: 0.4 + Math.random() * 0.8, volume: 0.7 });
    }
    // misses
    for (const w of this.words) if (!w.hit && this.t - w.t > 0.22) { w.hit = 'miss'; this.miss++; this.crowd = clamp(this.crowd - 3.5, 0, 100); }
    // bouncing ball hops word to word
    const L = this.lines[this.curLine];
    const ball = document.getElementById('kk-ball');
    if (L && ball) {
      let i = L.words.findIndex((w) => w.t > this.t) - 1;
      if (i < -1) i = L.words.length - 1;
      const a = L.words[Math.max(0, i)], c = L.words[Math.min(L.words.length - 1, i + 1)];
      const sa = document.querySelector(`#kk-line span[data-i="${Math.max(0, i)}"]`), sc = document.querySelector(`#kk-line span[data-i="${Math.min(L.words.length - 1, i + 1)}"]`);
      if (sa && sc) {
        const u = c.t > a.t ? clamp((this.t - a.t) / (c.t - a.t), 0, 1) : 1;
        const xa = sa.offsetLeft + sa.offsetWidth / 2, xc = sc.offsetLeft + sc.offsetWidth / 2;
        ball.style.left = `${xa + (xc - xa) * u}px`;
        ball.style.top = `${-4 - Math.sin(u * Math.PI) * 16}px`;
        ball.style.opacity = i < 0 && this.t < a.t - this.beat ? 0 : 1;
      }
    }
    if (input.rawHit('Space') || input.rawHit('PadA') || input.rawHit('Enter')) this.press();
    this.render();
    if (this.t > this.end) this.finish(false);
  }

  finish(fled) {
    if (this.done) return;
    this.done = true;
    this.endT = 3.2;
    const g = this.g;
    const s = g.state;
    s.flags.karaokeDay = s.day;
    if (fled) {
      this.msg = 'You drop the mic and run. Somebody films it. It will be in the Gazette.';
      this.crowd = 0;
      audio.play('sadTrombone');
    } else {
      const c = this.crowd;
      const tips = Math.round(c * 1.5);
      if (c >= 50) { g.addMoney(tips, 'karaoke tips'); g.xp('cha', c >= 80 ? 3 : 2); g.xp('stat', 1); }
      else g.xp('cha', 1);
      if (c >= 90) g.achievement('karaoke');
      if (c >= 70) for (const n of this.crowdNPCs) if (n.role === 'lady' && n.data.lady) g.romance(n.data.lady.id, 6);
      audio.play(c >= 50 ? 'levelup' : 'sadTrombone');
      this.msg = c >= 80 ? `STANDING OVATION! The crowd throws ${money(tips)} in tips and one pair of reading glasses.` : c >= 50 ? `Polite applause and ${money(tips)} in tips. Manny says "not bad for a guy with one lung."` : 'Crickets. Then booing. Then more crickets. Earl asks for his money back and he didn\'t pay anything.';
    }
    s.counters.karaoke = (s.counters.karaoke || 0) + 1;
    this.render();
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    const g = this.g;
    for (const n of this.crowdNPCs) if (n.state === 'party') n.resumeBase();
    g.player.char.setHeld(this.prevHeld && this.prevHeld !== 'fists' ? this.prevHeld : (g.state.weapon === 'fists' ? null : g.state.weapon));
    g.camRig.cinematic = null;
    document.getElementById('minigame').classList.remove('mg-3d');
    g.endMinigame();
  }
}

// Tiki Hut add-on: sign up for karaoke
export function karaokeChoice(g) {
  if (!karaokeOpen(g)) return { text: 'Karaoke Night (7PM–11PM)', tag: 'not yet', disabled: true, action: () => null };
  if (g.state.flags.karaokeDay === g.state.day) return { text: 'Karaoke Night — you already sang tonight', disabled: true, action: () => null };
  return {
    text: '🎤 Sign up for Karaoke Night', tag: 'rhythm • tips • CHA',
    action: () => ({
      name: 'DJ Manny', title: 'Karaoke Night',
      text: '"Alright amigo, what are we murdering tonight?"',
      choices: [
        ...SONGS.map((s, i) => ({ text: `"${s.title}" — ${s.artist}`, tag: `${s.bpm} bpm`, action: () => { g.startMinigame('karaoke', { song: i }); g.ui.closeDialogue(); return 'keep'; } })),
        { text: 'Chicken out', action: () => null },
      ],
    }),
  };
}
