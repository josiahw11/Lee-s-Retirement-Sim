// Places that sound like places: lounge piano and slot dings drifting off the Lucky Lady at night,
// steel drums at the Tiki Hut in the evening, frogs croaking around the ponds after dark, and
// distant "FORE!"s and club thwacks on the course by day. Volume falls off with distance.
import { audio } from '../core/audio.js';
import { BOAT } from '../world/casinoboat.js';
import { PONDS } from '../world/layout.js';
import { rand, pick, chance } from '../core/utils.js';
import { casinoOpen } from './chapter3.js';

const TIKI = { x: 98, z: 2 };
const LOUNGE = [[261.6, 329.6, 392, 493.9], [293.7, 349.2, 440, 523.3], [220, 261.6, 329.6, 392], [246.9, 293.7, 349.2, 440]];
const STEEL = [523.3, 587.3, 659.3, 784, 880, 784, 659.3, 587.3];

export class Soundscape {
  constructor(g) {
    this.g = g;
    this.t = { boat: 0, tiki: 0, frog: 0, golf: 0 };
    this.step = 0;
  }

  update(dt) {
    const g = this.g;
    if (!audio.ready || g.ui.modal) return;
    const p = g.player;
    const px = p.cart ? p.cart.x : p.x, pz = p.cart ? p.cart.z : p.z;
    const h = g.state.minutes / 60;
    const night = h >= 19.5 || h < 6;
    for (const k in this.t) this.t[k] -= dt;
    const fall = (x, z, r) => Math.max(0, 1 - Math.hypot(px - x, pz - z) / r);

    // the Lucky Lady: lounge piano chords + slot machines
    const vb = fall((BOAT.x0 + BOAT.x1) / 2, (BOAT.z0 + BOAT.z1) / 2, 90);
    if (vb > 0 && casinoOpen(g) && this.t.boat <= 0) {
      this.t.boat = rand(0.5, 1.1);
      const ch = LOUNGE[this.step++ % LOUNGE.length];
      ch.forEach((f, i) => audio.tone({ freq: f * (chance(0.2) ? 2 : 1), type: 'triangle', dur: 0.6, vol: 0.03 * vb, at: i * 0.07 }));
      if (chance(0.5)) for (let i = 0; i < 3; i++) audio.tone({ freq: 1760 + i * 220, type: 'square', dur: 0.05, vol: 0.02 * vb, at: 0.3 + i * 0.08 });
    }
    // Tiki Hut steel drums in the evening
    const vt = fall(TIKI.x, TIKI.z, 55);
    if (vt > 0 && h >= 17 && h < 23.5 && !(g.minigame && g.minigame.lines) && this.t.tiki <= 0) {
      this.t.tiki = 0.28;
      const f = STEEL[this.step % STEEL.length] * (Math.floor(this.step / 8) % 2 ? 0.75 : 1);
      audio.tone({ freq: f, to: f * 0.995, type: 'sine', dur: 0.22, vol: 0.05 * vt });
      audio.tone({ freq: f * 2.76, type: 'sine', dur: 0.08, vol: 0.012 * vt });
      this.step++;
    }
    // frogs croaking around the ponds after dark
    if (night && this.t.frog <= 0) {
      this.t.frog = rand(0.3, 1.2);
      let best = 0;
      for (const pd of PONDS) best = Math.max(best, fall(pd.x, pd.z, pd.r + 40));
      if (best > 0) {
        const f = rand(110, 180);
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) audio.tone({ freq: f, to: f * 0.8, type: 'sawtooth', dur: 0.09, vol: 0.05 * best, at: i * 0.13 });
      }
    }
    // the golf course by day: thwacks and the occasional FORE!
    if (!night && pz < -45 && Math.abs(px) < 290 && this.t.golf <= 0) {
      this.t.golf = rand(4, 11);
      audio.noiseBurst({ dur: 0.05, vol: 0.06, type: 'bandpass', freq: 2400, q: 3 });
      if (chance(0.3)) audio.play('fore', { vol: 0.35 });
    }
    void pick;
  }
}
