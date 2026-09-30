// Every sound in the game is synthesized with WebAudio: SFX, cart motor, ambience and
// three procedurally-composed radio stations (plus a text-to-speech talk station).
import { pick, rand, clamp } from './utils.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> Hz

const TALK_LINES = [
  "You're listening to The Retirement Hour on AM 1330. I'm your host, Chuck Barnwell, and I'm eighty-one years young.",
  "Are you over fifty five and still technically alive? Call Dewey, Cheatham and Howe for a free reverse mortgage consultation. Your kids will never know.",
  "Caller from Sunset Palms says the HOA fined him forty dollars for a flamingo that was, quote, too pink. Folks, that is tyranny.",
  "This hour of radio is brought to you by Metamucil. Metamucil: because some things should be regular.",
  "Weather update. Hot. Humid. Ninety four degrees. Old people, stay hydrated, and by hydrated I mean light beer.",
  "Reminder that the Golden Coral early bird special ends at four PM sharp. After that it's full price, and nobody wants that.",
  "Our next caller says his wife caught him with a fella named Doc behind the maintenance shed. Sir, what you do in the shed is your business.",
  "Is your golf cart governed to fifteen miles per hour? That's the government telling you how to live. Sal's Cart Customs. Ask for Sal.",
  "Bingo Wednesday has been cancelled after last week's incident. Mildred, we know it was you.",
  "Traffic report. A golf cart is on fire near the seventh hole. Another is in the pond. Nobody's hurt, just embarrassed.",
  "Ladies, if a man in a Hawaiian shirt offers you rhino horn tea, you say yes. That's not medical advice. That's life advice.",
  "HOA President Karen Whitmore has announced a new rule. Laughter above sixty decibels is now prohibited after eight PM.",
];

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.station = 1;
    this.stations = [
      { name: 'OFF', freq: '' },
      { name: 'WGZR — Golden Oldies Lounge', freq: '88.1 FM', kind: 'bossa' },
      { name: 'KMLF — Smooth Sax After Dark', freq: '101.5 FM', kind: 'sax' },
      { name: 'Polka Power', freq: '1420 AM', kind: 'polka' },
      { name: 'The Retirement Hour (Talk)', freq: '1330 AM', kind: 'talk' },
    ];
    this.radioOn = false;
    this.step = 0;
    this.nextTime = 0;
    this.speechEnabled = true;
    this.talkIdx = Math.floor(Math.random() * TALK_LINES.length);
    this.talkTimer = null;
    this.volumes = { master: 0.8, music: 0.55, sfx: 0.9 };
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.volumes.sfx;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    // Radio gets a slightly lo-fi "golf cart speaker" band-pass.
    const radioHP = ctx.createBiquadFilter();
    radioHP.type = 'highpass';
    radioHP.frequency.value = 140;
    this.radioLP = ctx.createBiquadFilter();
    this.radioLP.type = 'lowpass';
    this.radioLP.frequency.value = 5200;
    this.music.connect(radioHP).connect(this.radioLP).connect(this.master);
    this.ambient = ctx.createGain();
    this.ambient.gain.value = 0.25;
    this.ambient.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._setupEngine();
    this.ready = true;
    this._scheduler = setInterval(() => this._tick(), 25);
  }

  setVolume(kind, v) {
    this.volumes[kind] = v;
    if (!this.ready) return;
    if (kind === 'master') this.master.gain.value = v;
    if (kind === 'sfx') this.sfx.gain.value = v;
  }

  // ---------- primitives ----------
  _env(g, t, a, peak, dec, sustain = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + dec);
  }

  tone({ freq = 440, to = null, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, at = 0, bus = null, detune = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, attack, vol, dur);
    o.connect(g).connect(bus || this.sfx);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  noiseBurst({ dur = 0.2, vol = 0.3, type = 'lowpass', freq = 1000, to = null, q = 1, at = 0, attack = 0.003, bus = null }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g, t, attack, vol, dur);
    s.connect(f).connect(g).connect(bus || this.sfx);
    s.start(t, Math.random());
    s.stop(t + attack + dur + 0.05);
  }

  // ---------- game SFX ----------
  play(name, opt = {}) {
    if (!this.ready) return;
    const v = opt.vol ?? 1;
    switch (name) {
      case 'canOpen':
        this.noiseBurst({ dur: 0.04, vol: 0.5 * v, type: 'highpass', freq: 2500 });
        this.noiseBurst({ dur: 0.35, vol: 0.25 * v, type: 'highpass', freq: 4000, to: 6000, at: 0.03 });
        break;
      case 'glug':
        for (let i = 0; i < 4; i++) {
          this.noiseBurst({ dur: 0.1, vol: 0.35 * v, type: 'bandpass', freq: 380 + i * 30, to: 220, q: 6, at: 0.15 + i * 0.16 });
          this.tone({ freq: 180 + rand(0, 40), to: 120, type: 'sine', dur: 0.09, vol: 0.2 * v, at: 0.15 + i * 0.16 });
        }
        break;
      case 'burp': {
        const t = this.ctx.currentTime + (opt.at || 0);
        const dur = rand(0.35, 0.8);
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(rand(85, 110), t);
        o.frequency.linearRampToValueAtTime(rand(60, 75), t + dur);
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = rand(18, 30);
        const lg = this.ctx.createGain();
        lg.gain.value = 12;
        lfo.connect(lg).connect(o.frequency);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 3;
        f.frequency.setValueAtTime(350, t);
        f.frequency.linearRampToValueAtTime(900, t + dur * 0.4);
        f.frequency.linearRampToValueAtTime(400, t + dur);
        const g = this.ctx.createGain();
        this._env(g, t, 0.03, 0.9 * v, dur);
        o.connect(f).connect(g).connect(this.sfx);
        o.start(t); lfo.start(t);
        o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
        break;
      }
      case 'swing':
        this.noiseBurst({ dur: 0.18, vol: 0.28 * v, type: 'bandpass', freq: 500, to: 2500, q: 2 });
        break;
      case 'hit':
        this.tone({ freq: 140, to: 50, type: 'sine', dur: 0.16, vol: 0.7 * v });
        this.noiseBurst({ dur: 0.08, vol: 0.4 * v, type: 'lowpass', freq: 1800 });
        break;
      case 'bonk':
        this.tone({ freq: 620, to: 300, type: 'square', dur: 0.12, vol: 0.18 * v });
        this.tone({ freq: 120, to: 45, type: 'sine', dur: 0.25, vol: 0.8 * v });
        this.noiseBurst({ dur: 0.1, vol: 0.4 * v, type: 'lowpass', freq: 2500 });
        break;
      case 'crash':
        this.noiseBurst({ dur: 0.45, vol: 0.6 * v, type: 'lowpass', freq: 1400, to: 300 });
        for (let i = 0; i < 3; i++) this.tone({ freq: rand(300, 900), type: 'square', dur: 0.25, vol: 0.05 * v, at: rand(0, 0.05) });
        this.tone({ freq: 90, to: 40, type: 'sine', dur: 0.3, vol: 0.6 * v });
        break;
      case 'thud':
        this.tone({ freq: 90, to: 40, type: 'sine', dur: 0.2, vol: 0.5 * v });
        this.noiseBurst({ dur: 0.1, vol: 0.2 * v, type: 'lowpass', freq: 600 });
        break;
      case 'plastic':
        this.tone({ freq: rand(500, 800), to: 250, type: 'triangle', dur: 0.12, vol: 0.25 * v });
        this.noiseBurst({ dur: 0.08, vol: 0.2 * v, type: 'bandpass', freq: 1500, q: 3 });
        break;
      case 'cash':
        this.tone({ freq: 1318, type: 'square', dur: 0.08, vol: 0.12 * v });
        this.tone({ freq: 1760, type: 'square', dur: 0.3, vol: 0.12 * v, at: 0.08 });
        this.noiseBurst({ dur: 0.05, vol: 0.2 * v, type: 'highpass', freq: 5000 });
        break;
      case 'pickup':
        this.tone({ freq: 880, to: 1500, type: 'sine', dur: 0.09, vol: 0.2 * v });
        break;
      case 'ball':
        this.tone({ freq: rand(1300, 1600), type: 'sine', dur: 0.06, vol: 0.12 * v });
        break;
      case 'horn':
        this.tone({ freq: 392, type: 'square', dur: 0.35, vol: 0.12 * v });
        this.tone({ freq: 494, type: 'square', dur: 0.35, vol: 0.1 * v });
        break;
      case 'cucaracha': {
        // La Cu-ca-ra-cha, la cu-ca-ra-chaaa
        const seq = [[60, 0.12], [60, 0.12], [60, 0.12], [65, 0.3], [69, 0.3], [60, 0.12], [60, 0.12], [60, 0.12], [65, 0.3], [69, 0.5]];
        let t = 0;
        for (const [n, d] of seq) {
          this.tone({ freq: NOTE(n + 7), type: 'square', dur: d * 0.9, vol: 0.1 * v, at: t });
          this.tone({ freq: NOTE(n + 11), type: 'square', dur: d * 0.9, vol: 0.06 * v, at: t });
          t += d;
        }
        break;
      }
      case 'splash':
        this.noiseBurst({ dur: 0.8, vol: 0.6 * v, type: 'lowpass', freq: 3000, to: 200 });
        this.noiseBurst({ dur: 0.4, vol: 0.3 * v, type: 'highpass', freq: 2000, at: 0.05 });
        break;
      case 'success':
        [72, 76, 79, 84].forEach((n, i) => this.tone({ freq: NOTE(n), type: 'triangle', dur: 0.25, vol: 0.18 * v, at: i * 0.08 }));
        break;
      case 'levelup':
        [67, 72, 76, 79, 84, 88].forEach((n, i) => this.tone({ freq: NOTE(n), type: 'square', dur: 0.2, vol: 0.08 * v, at: i * 0.07 }));
        break;
      case 'fail':
        this.tone({ freq: 1200, to: 280, type: 'sine', dur: 0.7, vol: 0.2 * v });
        break;
      case 'heart':
        this.tone({ freq: NOTE(84), type: 'sine', dur: 0.3, vol: 0.15 * v });
        this.tone({ freq: NOTE(88), type: 'sine', dur: 0.4, vol: 0.12 * v, at: 0.1 });
        break;
      case 'sadTrombone':
        [[67, 0.4], [66, 0.4], [65, 0.4], [64, 1.1]].reduce((t, [n, d]) => {
          this.tone({ freq: NOTE(n - 12), type: 'sawtooth', dur: d, vol: 0.12 * v, at: t, attack: 0.03 });
          return t + d;
        }, 0);
        break;
      case 'oof':
      case 'ow': {
        const t = this.ctx.currentTime;
        const base = name === 'oof' ? rand(110, 150) * (opt.pitch || 1) : rand(220, 300) * (opt.pitch || 1);
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(base * 1.3, t);
        o.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.3);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = name === 'oof' ? 600 : 1100;
        f.Q.value = 4;
        const g = this.ctx.createGain();
        this._env(g, t, 0.02, 0.6 * v, 0.3);
        o.connect(f).connect(g).connect(this.sfx);
        o.start(t);
        o.stop(t + 0.4);
        break;
      }
      case 'bedsprings':
        for (let i = 0; i < 10; i++) {
          this.tone({ freq: 1050 + (i % 2) * 180, to: 800, type: 'sine', dur: 0.12, vol: 0.12 * v, at: i * 0.32 });
        }
        this.tone({ freq: NOTE(76), type: 'triangle', dur: 0.5, vol: 0.1 * v, at: 3.4 });
        break;
      case 'siren':
        for (let i = 0; i < 2; i++) this.tone({ freq: 700, to: 1100, type: 'triangle', dur: 0.4, vol: 0.12 * v, at: i * 0.45 });
        break;
      case 'click':
        this.tone({ freq: 1200, type: 'square', dur: 0.02, vol: 0.05 * v });
        break;
      case 'buy':
        this.tone({ freq: 988, type: 'square', dur: 0.06, vol: 0.08 * v });
        this.tone({ freq: 1319, type: 'square', dur: 0.12, vol: 0.08 * v, at: 0.06 });
        break;
      case 'pocketSand':
        this.noiseBurst({ dur: 0.4, vol: 0.4 * v, type: 'highpass', freq: 1500, to: 4000 });
        break;
      case 'land':
        this.tone({ freq: 80, to: 40, type: 'sine', dur: 0.25, vol: 0.8 * v });
        this.noiseBurst({ dur: 0.2, vol: 0.3 * v, type: 'lowpass', freq: 900 });
        break;
      case 'whistle':
        this.tone({ freq: 2200, type: 'sine', dur: 0.15, vol: 0.12 * v });
        this.tone({ freq: 2200, to: 1500, type: 'sine', dur: 0.3, vol: 0.12 * v, at: 0.18 });
        break;
      case 'fore':
        this.tone({ freq: 240, to: 180, type: 'sawtooth', dur: 0.5, vol: 0.06 * v });
        break;
      case 'drone':
        this.noiseBurst({ dur: 0.5, vol: 0.05 * v, type: 'bandpass', freq: 300, q: 10 });
        break;
      case 'drink':
        this.play('canOpen', opt);
        this.play('glug', opt);
        break;
    }
  }

  // ---------- golf cart motor (electric whine + gear hum) ----------
  _setupEngine() {
    const ctx = this.ctx;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    this.engA = ctx.createOscillator();
    this.engA.type = 'sawtooth';
    this.engB = ctx.createOscillator();
    this.engB.type = 'triangle';
    const gA = ctx.createGain(); gA.gain.value = 0.25;
    const gB = ctx.createGain(); gB.gain.value = 0.6;
    this.engA.connect(gA).connect(f);
    this.engB.connect(gB).connect(f);
    f.connect(this.engGain).connect(this.sfx);
    this.engA.start();
    this.engB.start();
  }

  setEngine(on, speed01, throttle) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.03 + Math.abs(throttle) * 0.06 + speed01 * 0.04 : 0;
    this.engGain.gain.setTargetAtTime(target, t, 0.08);
    this.engA.frequency.setTargetAtTime(55 + speed01 * 110, t, 0.1);
    this.engB.frequency.setTargetAtTime(240 + speed01 * 520, t, 0.1);
  }

  // ---------- radio ----------
  setStation(i) {
    this.station = ((i % this.stations.length) + this.stations.length) % this.stations.length;
    this._stopTalk();
    if (this.stations[this.station].kind === 'talk' && this.radioOn) this._talk();
    return this.stations[this.station];
  }

  setRadio(on) {
    if (!this.ready) return;
    if (on === this.radioOn) return;
    this.radioOn = on;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(on ? this.volumes.music * 0.5 : 0, t, 0.3);
    if (on) {
      this.nextTime = t + 0.05;
      if (this.stations[this.station].kind === 'talk') this._talk();
    } else this._stopTalk();
  }

  setMusicVolume(v) {
    this.volumes.music = v;
    if (this.ready && this.radioOn) this.music.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.1);
  }

  _stopTalk() {
    clearTimeout(this.talkTimer);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  _talk() {
    if (!window.speechSynthesis || !this.speechEnabled) return;
    const line = TALK_LINES[this.talkIdx++ % TALK_LINES.length];
    this.say(line, { rate: 1.0, pitch: 0.7, onend: () => {
      if (this.radioOn && this.stations[this.station].kind === 'talk') this.talkTimer = setTimeout(() => this._talk(), 1200);
    } });
  }

  say(text, { rate = 0.95, pitch = 0.8, volume = 0.9, onend = null } = {}) {
    if (!window.speechSynthesis || !this.speechEnabled) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = pitch;
    u.volume = volume * this.volumes.master;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => /en[-_]US/i.test(x.lang) && /male|david|guy|mark/i.test(x.name)) || voices.find((x) => /en/i.test(x.lang));
    if (v) u.voice = v;
    if (onend) u.onend = onend;
    window.speechSynthesis.speak(u);
  }

  _tick() {
    if (!this.ready || !this.radioOn) return;
    const st = this.stations[this.station];
    if (!st.kind || st.kind === 'talk') return;
    const bpm = st.kind === 'polka' ? 150 : st.kind === 'sax' ? 84 : 118;
    const stepDur = 60 / bpm / 4; // 16th notes
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this._step(st.kind, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  _mnote(freq, t, dur, type, vol, opts = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.vibrato) {
      const l = ctx.createOscillator();
      l.frequency.value = 5.2;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.6);
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.1);
    }
    let node = o;
    if (opts.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lp;
      f.Q.value = opts.q || 0.7;
      o.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    const a = opts.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    if (opts.sustain) {
      g.gain.setValueAtTime(vol, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _perc(t, kind) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let dur = 0.04, vol = 0.05;
    if (kind === 'shaker') { f.type = 'highpass'; f.frequency.value = 7000; dur = 0.05; vol = 0.05; }
    if (kind === 'rim') { f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 6; dur = 0.05; vol = 0.25; }
    if (kind === 'snare') { f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.8; dur = 0.12; vol = 0.18; }
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.music);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      const kg = ctx.createGain();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      kg.gain.setValueAtTime(0.5, t);
      kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(kg).connect(this.music);
      o.start(t);
      o.stop(t + 0.2);
    }
  }

  _step(kind, step, t, sd) {
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    if (kind === 'bossa') {
      // ii-V-I-VI in C with jazzy voicings
      const prog = [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 61, 64, 67]];
      const roots = [38, 43, 36, 45];
      const ch = prog[bar % 4];
      const root = roots[bar % 4];
      if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 14) this._mnote(NOTE(s16 < 8 ? root : root + 7), t, sd * 3, 'triangle', 0.28);
      if ([0, 3, 6, 10, 13].includes(s16)) ch.forEach((n) => this._mnote(NOTE(n), t, sd * 2.2, 'sine', 0.045, { lp: 2400 }));
      if ([0, 3, 6, 10, 12].includes(s16)) this._perc(t, 'rim');
      if (s16 % 2 === 0) this._perc(t, 'shaker');
      if (s16 % 4 === 0 && Math.random() < 0.5) {
        const scale = [72, 74, 76, 79, 81, 84];
        this._mnote(NOTE(pick(scale)), t, sd * rand(2, 6), 'triangle', 0.07, { vibrato: true, attack: 0.02 });
      }
    } else if (kind === 'sax') {
      const prog = [[57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71]];
      const roots = [33, 38, 43, 36];
      const ch = prog[bar % 4];
      if (s16 === 0) ch.forEach((n) => this._mnote(NOTE(n), t, sd * 15, 'sine', 0.05, { attack: 0.08, sustain: true }));
      if (s16 === 0 || s16 === 10) this._mnote(NOTE(roots[bar % 4]), t, sd * 5, 'triangle', 0.3);
      if (s16 === 4 || s16 === 12) this._perc(t, 'snare');
      if (s16 === 0 || s16 === 7) this._perc(t, 'kick');
      if (s16 % 2 === 0) this._perc(t, 'shaker');
      if ((s16 === 0 || s16 === 6 || s16 === 10) && Math.random() < 0.7) {
        const scale = [69, 72, 74, 76, 79, 81];
        this._mnote(NOTE(pick(scale)), t, sd * rand(3, 8), 'sawtooth', 0.06, { vibrato: true, lp: 1600, q: 2, attack: 0.04, sustain: true });
      }
    } else if (kind === 'polka') {
      const prog = [[60, 64, 67], [55, 59, 62], [55, 59, 62], [60, 64, 67]];
      const roots = [36, 43, 31, 36];
      const ch = prog[bar % 4];
      if (s16 === 0 || s16 === 8) this._mnote(NOTE(s16 === 0 ? roots[bar % 4] : roots[bar % 4] + 7), t, sd * 2, 'triangle', 0.35);
      if (s16 === 4 || s16 === 12) {
        ch.forEach((n) => this._mnote(NOTE(n), t, sd * 1.5, 'square', 0.03, { lp: 2500 }));
        this._perc(t, 'snare');
      }
      if (s16 === 0 || s16 === 8) this._perc(t, 'kick');
      if (s16 % 2 === 0) {
        const scale = ch.map((n) => n + 12).concat(ch.map((n) => n + 24));
        if (Math.random() < 0.85) this._mnote(NOTE(pick(scale)), t, sd * 1.8, 'square', 0.035, { lp: 3000, vibrato: true });
      }
    }
  }

  // ---------- ambience ----------
  ambientTick(dt, night) {
    if (!this.ready) return;
    this._ambT = (this._ambT || 0) - dt;
    if (this._ambT > 0) return;
    this._ambT = rand(0.4, 2.2);
    if (night) {
      // crickets
      for (let i = 0; i < 3; i++) this.tone({ freq: 4200 + rand(-200, 200), type: 'sine', dur: 0.04, vol: 0.02, at: i * 0.07, bus: this.ambient });
    } else if (Math.random() < 0.6) {
      // songbird chirps
      const f = rand(2500, 4200);
      const n = Math.floor(rand(2, 5));
      for (let i = 0; i < n; i++) this.tone({ freq: f, to: f * rand(0.7, 1.4), type: 'sine', dur: 0.07, vol: 0.03, at: i * 0.11, bus: this.ambient });
    }
  }

  // ---------- weather ----------
  setRain(level) {
    if (!this.ready) return;
    if (!this.rainGain) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2600;
      const f2 = this.ctx.createBiquadFilter();
      f2.type = 'highpass';
      f2.frequency.value = 400;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;
      s.connect(f).connect(f2).connect(this.rainGain).connect(this.master);
      s.start();
    }
    this.rainGain.gain.setTargetAtTime(level * 0.16, this.ctx.currentTime, 0.4);
  }

  thunder(delay = 0.6) {
    if (!this.ready) return;
    this.noiseBurst({ dur: 2.6, vol: 0.7, type: 'lowpass', freq: 300, to: 60, at: delay, attack: 0.05 });
    this.noiseBurst({ dur: 0.5, vol: 0.4, type: 'lowpass', freq: 1200, to: 200, at: delay });
    this.tone({ freq: 55, to: 30, type: 'sine', dur: 2, vol: 0.4, at: delay });
  }

  // ---------- gibberish voices (one blip per syllable, Animal Crossing style) ----------
  mumble(text, { female = false, pitch = 1, vol = 1 } = {}) {
    if (!this.ready) return;
    const syl = Math.min(11, Math.max(2, Math.round(text.replace(/[^a-z]/gi, '').length / 3.2)));
    const base = (female ? 250 : 130) * pitch;
    const loud = /!|[A-Z]{3,}/.test(text);
    let t = this.ctx.currentTime + 0.02;
    for (let i = 0; i < syl; i++) {
      const d = 0.07 + Math.random() * 0.05;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = base * (0.85 + Math.random() * 0.4) * (loud ? 1.25 : 1);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0 * (0.9 + Math.random() * 0.2), t + d);
      // old-person warble
      const l = this.ctx.createOscillator();
      l.frequency.value = 7 + Math.random() * 3;
      const lg = this.ctx.createGain();
      lg.gain.value = f0 * 0.04;
      l.connect(lg).connect(o.frequency);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = [500, 800, 1100, 700, 1500][Math.floor(Math.random() * 5)] * (female ? 1.3 : 1);
      f.Q.value = 3;
      const g = this.ctx.createGain();
      this._env(g, t, 0.01, (loud ? 0.5 : 0.32) * vol, d);
      o.connect(f).connect(g).connect(this.sfx);
      o.start(t); l.start(t);
      o.stop(t + d + 0.05); l.stop(t + d + 0.05);
      t += d + 0.02 + Math.random() * 0.03;
    }
  }

  setAmbientLevel(v) {
    if (this.ready) this.ambient.gain.setTargetAtTime(clamp(v, 0, 1) * 0.3, this.ctx.currentTime, 0.5);
  }
}

export const audio = new AudioSys();
