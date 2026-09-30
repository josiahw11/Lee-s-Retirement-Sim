// Golf cart races: checkpoint circuit around the course paths, AI rivals, bets.
import * as THREE from 'three';
import { Driver } from './traffic.js';
import { audio } from '../core/audio.js';
import { heightAt } from '../world/terrain.js';
import { clamp, money, pick } from '../core/utils.js';

// One lap of the "Back Nine Grand Prix": west on Fairway Dr, down the west path,
// across the middle of the course, up the east side and home.
export const TRACK = [
  [-120, -45], [-200, -45], [-262, -46], [-265, -100], [-263, -158], [-180, -160], [-90, -160],
  [0, -160], [90, -160], [180, -160], [262, -159], [265, -100], [263, -47], [180, -45], [120, -45], [40, -45], [-50, -45],
];
export const START = { x: -50, z: -45, heading: -Math.PI / 2 };

export const RACE_TIERS = [
  { bet: 50, label: 'Friendly ($50)', speed: 9.3, rivals: ['Rocket Ron', 'Mabel "Lead Foot" Pruitt'] },
  { bet: 200, label: 'Serious ($200)', speed: 12.4, rivals: ['Rocket Ron', 'Chip Wainwright III'] },
  { bet: 500, label: 'Pink Slips-ish ($500)', speed: 15.0, rivals: ['Rocket Ron', 'The Widow Maker'] },
];

const RING = new THREE.TorusGeometry(4.4, 0.28, 8, 28);
const RING_FINISH = new THREE.TorusGeometry(5.5, 0.28, 8, 28);
const ringMatOn = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 });
const ringMatNext = new THREE.MeshBasicMaterial({ color: 0xff6fa8, transparent: true, opacity: 0.45 });

export class Race {
  constructor(game, tier) {
    this.g = game;
    this.tier = tier;
    this.t = -3.5; // countdown
    this.state = 'countdown';
    this.finishOrder = [];
    this.racers = [];
    const p = game.player;
    const cart = p.cart;
    this.cart = cart;
    // grid
    const lanes = [-2.6, 0, 2.6];
    const place = (c, lane) => {
      c.x = START.x;
      c.z = START.z + lane;
      c.heading = START.heading;
      c.vx = c.vz = c.vy = 0;
      c.sunk = false;
      c.y = heightAt(c.x, c.z);
      c.syncMesh(0);
    };
    place(cart, lanes[1]);
    p.x = cart.x; p.z = cart.z;
    game.camRig.yaw = START.heading + Math.PI;
    // rivals
    tier.rivals.forEach((name, i) => {
      const c = game.addCart({ x: START.x, z: START.z, kind: 'rival', color: ['#ff6b1a', '#7d3cff', '#111111'][i % 3], upgrades: { governor: true, turbo: true, rims: true, neon: i === 0 } });
      place(c, lanes[i === 0 ? 0 : 2]);
      const npc = game.spawnNPC({ name, female: name.includes('Mabel') || name.includes('Widow'), role: 'racer', x: c.x, z: c.z, look: { hat: 'cap', hatColor: i ? '#111' : '#ff6b1a', glasses: 'aviator' } });
      const d = new Driver(c, 'race', { speed: tier.speed });
      npc.seatIn(c, d);
      npc.data.quiet = true;
      this.racers.push({ npc, cart: c, driver: d, cp: 0, done: false, name });
    });
    this.player = { cp: 0, done: false, name: game.state.name };
    // checkpoint rings
    this.rings = TRACK.map(([x, z], i) => {
      const next = TRACK[(i + 1) % TRACK.length];
      const prev = i === 0 ? [START.x, START.z] : TRACK[i - 1];
      const m = new THREE.Mesh(i === TRACK.length - 1 ? RING_FINISH : RING, ringMatNext);
      m.position.set(x, heightAt(x, z) + 3, z);
      m.rotation.y = Math.atan2(next[0] - prev[0], next[1] - prev[1]) + Math.PI / 2;
      m.visible = false;
      game.scene.add(m);
      return m;
    });
    this.lastBeep = 4;
    game.ui.toast(`🏁 ${tier.label} race. Hit every checkpoint. First to the finish takes the pot.`, 'quest', 5);
  }

  get running() {
    return this.state !== 'over';
  }

  progress(r, x, z) {
    if (r.done) return 1000 + (10 - this.finishOrder.indexOf(r));
    const cp = TRACK[r.cp];
    const prev = r.cp === 0 ? [START.x, START.z] : TRACK[r.cp - 1];
    const seg = Math.hypot(cp[0] - prev[0], cp[1] - prev[1]) || 1;
    return r.cp + clamp(1 - Math.hypot(cp[0] - x, cp[1] - z) / seg, 0, 1);
  }

  position() {
    const p = this.g.player;
    const mine = this.progress(this.player, p.x, p.z);
    return 1 + this.racers.filter((r) => this.progress(r, r.cart.x, r.cart.z) > mine).length;
  }

  hit(r, x, z) {
    const cp = TRACK[r.cp];
    const rad = r.cp === TRACK.length - 1 ? 6.5 : 5.5;
    if (Math.hypot(cp[0] - x, cp[1] - z) < rad) {
      r.cp++;
      if (r.cp >= TRACK.length) {
        r.done = true;
        this.finishOrder.push(r);
      }
      return true;
    }
    return false;
  }

  update(dt) {
    const g = this.g;
    const p = g.player;
    this.t += dt;
    if (this.state === 'countdown') {
      const s = Math.ceil(-this.t);
      if (s < this.lastBeep && s > 0) {
        this.lastBeep = s;
        audio.tone({ freq: 660, type: 'square', dur: 0.18, vol: 0.12 });
        g.ui.splash(String(s), '', 0.8);
      }
      // hold everyone on the line
      for (const c of [this.cart, ...this.racers.map((r) => r.cart)]) { c.vx = c.vz = 0; }
      if (this.t >= 0) {
        this.state = 'racing';
        audio.tone({ freq: 1320, type: 'square', dur: 0.5, vol: 0.14 });
        g.ui.splash('GO!', 'Floor it, grandpa!', 1.2, '#7CFC9A');
        for (const r of this.racers) r.npc.say(pick(['Eat my exhaust!', "See ya at the finish, sonny!", 'I did this in Daytona in \'58!']), 2);
      }
      return;
    }
    if (this.state !== 'racing') return;
    // player checkpoints (must be in the race cart)
    if (p.cart !== this.cart) {
      this.finish('forfeit');
      return;
    }
    if (!this.player.done && this.hit(this.player, p.x, p.z)) {
      audio.play('pickup');
      if (this.player.done) {
        this.finish(this.finishOrder[0] === this.player ? 'win' : 'lose');
        return;
      }
    }
    // rivals: chase the next checkpoint, rubber-band against the player
    const mine = this.progress(this.player, p.x, p.z);
    for (const r of this.racers) {
      if (r.done) { r.driver.stopT = 1; continue; }
      const theirs = this.progress(r, r.cart.x, r.cart.z);
      const gap = theirs - mine;
      r.driver.speed = this.tier.speed * clamp(1 - gap * 0.05, 0.88, 1.1);
      this.hit(r, r.cart.x, r.cart.z);
      if (r.done && this.finishOrder[0] === r) r.npc.say('WINNER! Where\'s my prune juice?', 3);
    }
    // ring visibility: current + next
    this.rings.forEach((m, i) => {
      m.visible = i === this.player.cp || i === this.player.cp + 1;
      m.material = i === this.player.cp ? ringMatOn : ringMatNext;
      if (m.visible) m.rotation.z += dt * 0.6;
    });
    if (this.t > 240) this.finish('timeout');
  }

  // world target for the minimap/objective marker
  target() {
    const cp = TRACK[Math.min(this.player.cp, TRACK.length - 1)];
    return { x: cp[0], z: cp[1] };
  }

  hud() {
    if (this.state === 'countdown') return { title: '🏁 GET READY...', sub: `${this.tier.label}` };
    const t = Math.max(0, this.t);
    const pos = this.position();
    const suffix = ['st', 'nd', 'rd'][pos - 1] || 'th';
    return { title: `🏁 ${pos}${suffix} of ${this.racers.length + 1} • Checkpoint ${Math.min(this.player.cp + 1, TRACK.length)}/${TRACK.length}`, sub: `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}` };
  }

  finish(result) {
    const g = this.g;
    this.state = 'over';
    const bet = this.tier.bet;
    const time = Math.max(0, this.t);
    if (result === 'win') {
      g.addMoney(bet * 3, 'race winnings');
      g.xp('stat', 3);
      g.xp('cha', 1);
      g.state.counters.racesWon = (g.state.counters.racesWon || 0) + 1;
      g.achievement('raceWin');
      g.celebrate(8);
      if (bet >= 500) g.achievement('raceLegend');
      g.ui.splash('YOU WIN!', `${time.toFixed(1)}s. The retirement community will speak of this for days (they'll forget by Thursday).`, 4, '#7CFC9A');
      audio.play('levelup');
    } else if (result === 'lose') {
      g.ui.splash(`FINISHED ${this.position()}${['st', 'nd', 'rd'][this.position() - 1] || 'th'}`, `${this.finishOrder[0].name} took the pot. Better luck next time.`, 3.5, '#ff9f1c');
      audio.play('sadTrombone');
    } else {
      g.ui.splash('RACE OVER', result === 'forfeit' ? 'You bailed on the race. Your bet is gone.' : 'Too slow. The pot went to the house.', 3, '#ff6b6b');
      audio.play('sadTrombone');
    }
    // clean up after a moment
    this.cleanupT = 4;
  }

  dispose() {
    const g = this.g;
    for (const m of this.rings) g.scene.remove(m);
    for (const r of this.racers) {
      g.removeNPC(r.npc);
      g.scene.remove(r.cart.group);
      r.cart.group.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
      g.carts = g.carts.filter((c) => c !== r.cart);
    }
  }
}
