// SENIOR SHUTTLE — a Crazy Taxi shift in a golf cart. Dispatcher Doris puts you on the clock; residents
// wave you down under green/yellow/red light pillars (short/medium/long fares); get them to the Golden
// Coral before their patience (or their bladder) runs out. Air, drifts and near misses earn tips and
// wild commentary from the back seat. Every delivery buys a few more seconds on the shift clock.
import * as THREE from 'three';
import { seatCharacter } from '../entities/cart.js';
import { heightAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { pick, money } from '../core/utils.js';

const DOR = { x: -31, z: 47 };
const DESTS = {
  buffet: ['the Golden Coral', ['The Golden Coral! The shrimp tower waits for no man!', 'Early bird, and step on it. I can smell the prime rib from here.']],
  liquor: ['the Liquor Barrel', ['Liquor Barrel. Doctor says no. Doctor isn\'t here.', 'Liquor Barrel, and don\'t tell my daughter.']],
  hoa: ['the HOA Office', ['HOA Office. I\'m filing a complaint. About YOU, probably.', 'Take me to Karen. I have NOTES.']],
  clubhouse: ['the Clubhouse', ['Clubhouse. Bingo at two and I have my lucky dauber.', 'Clubhouse, please. Water aerobics gossip waits for no one.']],
  pool: ['the Pool', ['The pool. Chad\'s class. Don\'t tell my husband.', 'Pool deck. I left my teeth on a lounger.']],
  tiki: ['the Tiki Hut', ['Tiki Hut! It\'s five o\'clock somewhere. Specifically here.', 'Tiki Hut. I owe Manny a karaoke rematch.']],
  pickleball: ['the Pickleball Courts', ['Pickleball courts. I have a grudge match with Deb.', 'Pickleball. My knee says no. My pride says GO.']],
  shuffle: ['the Shuffleboard Courts', ['Shuffleboard courts. The shark owes me twelve dollars.', 'Shuffleboard, and hurry, I\'m on a hot streak.']],
  proshop: ['the Pro Shop', ['Pro shop. I need a new driver. My last one went in the lake. Twice.', 'Gus\'s pro shop. I\'m returning these balls. They\'re not mine.']],
  sal: ['Sal\'s Cart Customs', ['Sal\'s place. My scooter needs "performance upgrades."', 'Sal\'s. Don\'t ask why.']],
  doc: ['Doc\'s van', ['Doc\'s van. It\'s for my... glaucoma.', 'The van behind the shed. I need my "vitamins."']],
  gate: ['the Front Gate', ['Front gate. My grandson\'s picking me up. He\'s 51.', 'The gate! I\'m making a break for it!']],
  pelican: ['the Rusty Pelican', ['Beach bar! I want to see the ocean before I die. Or before four.', 'Rusty Pelican. They have a two-for-one on regret.']],
  pong: ['the Beer Pong table', ['Beer pong table. I\'m undefeated. I\'ve never played.', 'Take me to the pong table. Tyler owes me a rematch.']],
};
const RIDE_LINES = {
  air: ['WHEEEEE!', 'MY HIP!', 'I haven\'t felt this alive since Nixon!', 'My dentures! MY DENTURES!', 'DO IT AGAIN!'],
  crash: ['Watch it, you maniac!', 'I just had that hip replaced!', 'I\'m telling Karen!', 'OW. My everything.'],
  drift: ['Tokyo Drift! Tokyo Drift!', 'Now you\'re driving like my late husband!', 'Weeeee—oh no, my purse!'],
  near: ['That was close!', 'I saw my life flash before my eyes. It was mostly bingo.', 'He waved! I think that was a wave.'],
  slow: ['I could walk faster. With my walker.', 'Is this thing even on?', 'My grandson drives faster and he\'s NINE.'],
};

export class Shuttle {
  constructor(g) {
    this.g = g;
    this.on = false;
    this.hailers = [];
    this.fare = null;
    this.doris = g.spawnNPC({ name: 'Dispatcher Doris', female: true, role: 'dispatcher', x: DOR.x, z: DOR.z, state: 'static', look: { hat: 'visor', hatColor: '#f2c94c', glasses: 'big', shirt: 3, hair: '#c9b8a0' }, homePt: { x: DOR.x, z: DOR.z } });
    this.doris.data.face = Math.PI / 2;
    this.doris.data.quiet = true;
    this.pillarGeo = new THREE.CylinderGeometry(0.9, 0.9, 26, 16, 1, true).translate(0, 13, 0);
    this.ringGeo = new THREE.RingGeometry(1.6, 2.1, 32).rotateX(-Math.PI / 2);
    this.mats = {};
    for (const [k, c] of Object.entries({ green: 0x5dff7a, yellow: 0xffd23f, red: 0xff4d4d, dest: 0x4cc9f0 })) {
      this.mats[k] = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, fog: false });
    }
    this.destMark = this.beacon('dest', 1.6);
    this.destMark.visible = false;
    let el = document.getElementById('shuttle-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'shuttle-hud';
      el.className = 'hidden';
      document.getElementById('hud').appendChild(el);
    }
    this.hud = el;
  }

  beacon(kind, scale = 1) {
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(this.pillarGeo, this.mats[kind]);
    const ring = new THREE.Mesh(this.ringGeo, this.mats[kind]);
    ring.position.y = 0.06;
    g.add(pillar, ring);
    g.scale.set(scale, 1, scale);
    this.g.scene.add(g);
    return g;
  }

  // ---------------------------------------------------------------- shift
  start() {
    const g = this.g;
    this.on = true;
    this.clock = 75;
    this.started = false; // the clock waits until you're in a cart
    this.stats = { fares: 0, cash: 0, tips: 0 };
    this.fare = null;
    this.refill();
    g.ui.toast('🚐 SENIOR SHUTTLE: you\'re on the clock! Pick up residents under the light pillars (green = short, red = long). Hop in any cart.', 'quest', 7);
    audio.play('whistle');
  }

  end(why = 'SHIFT OVER') {
    const g = this.g;
    if (this.fare) this.dropOff(false);
    for (const h of this.hailers) this.unhail(h);
    this.hailers = [];
    this.on = false;
    this.destMark.visible = false;
    g.waypoint = null;
    this.hud.classList.add('hidden');
    const s = this.stats;
    const c = g.state.counters;
    c.fares = (c.fares || 0) + s.fares;
    c.bestShift = Math.max(c.bestShift || 0, s.cash);
    if (s.fares >= 4) c.bigShifts = (c.bigShifts || 0) + 1;
    if (s.fares >= 5) g.achievement('daisy');
    if (s.cash >= 400) g.achievement('crazyshuttle');
    const grade = s.cash >= 500 ? 'S' : s.cash >= 300 ? 'A' : s.cash >= 150 ? 'B' : s.cash >= 50 ? 'C' : 'D';
    g.ui.splash(`${why} • RANK ${grade}`, `${s.fares} fare${s.fares === 1 ? '' : 's'} • ${money(s.cash)} earned (${money(s.tips)} in tips)`, 4, grade === 'S' || grade === 'A' ? '#ffd23f' : '#4cc9f0');
    audio.play(s.fares ? 'levelup' : 'sadTrombone');
  }

  // keep four residents waving around the map
  refill() {
    const g = this.g, p = g.player;
    const px = p.cart ? p.cart.x : p.x, pz = p.cart ? p.cart.z : p.z;
    const pool = g.npcs.filter((n) => n.role === 'resident' && !n.cart && n.state === 'wander' && !n.hostile && !n.data.hasDog && !n.data.aqua && !n.data.hail && !n.data.riding && !n.talking && n.x < 300);
    let guard = 0;
    while (this.hailers.length < 4 && pool.length && guard++ < 60) {
      const n = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d < 30 || d > 260) continue;
      const opts = Object.keys(DESTS).filter((k) => g.world.pois[k] && Math.hypot(g.world.pois[k].x - n.x, g.world.pois[k].z - n.z) > 110);
      if (!opts.length) continue;
      const dest = pick(opts), poi = g.world.pois[dest];
      const dist = Math.hypot(poi.x - n.x, poi.z - n.z);
      const kind = dist < 250 ? 'green' : dist < 420 ? 'yellow' : 'red';
      const h = { n, dest, dist, kind, fare: Math.round(8 + dist * 0.12), mark: this.beacon(kind) };
      n.data.hail = h;
      this.hailers.push(h);
    }
  }

  unhail(h) {
    this.g.scene.remove(h.mark);
    if (h.n.data.hail === h) delete h.n.data.hail;
  }

  update(dt) {
    const g = this.g;
    if (!this.on) return;
    const p = g.player, pc = p.cart;
    if (pc && !this.started) { this.started = true; g.ui.hint('Shift started! Pick up someone under a light pillar.', 3); }
    if (this.started) this.clock -= dt;
    if (this.clock <= 0) return this.end();
    // hailers: drop anyone who got hurt, wandered off, or got spooked
    for (const h of [...this.hailers]) {
      const n = h.n;
      if (!g.npcs.includes(n) || n.data.hail !== h || n.state === 'ko' || n.hostile || n.cart) { this.unhail(h); this.hailers.splice(this.hailers.indexOf(h), 1); continue; }
      h.mark.position.set(n.x, heightAt(n.x, n.z), n.z);
      h.mark.children[1].scale.setScalar(1 + (performance.now() % 1000) / 1000 * 0.4); // pulsing ground ring
      // pull up next to them, slow, with a seat free
      if (pc && !this.fare && pc.kind !== 'scooter' && !pc.sunk && Math.hypot(pc.x - n.x, pc.z - n.z) < 5 && pc.speed < 3.2) this.pickUp(h, pc);
    }
    if (this.hailers.length < 4 && Math.random() < dt) this.refill();
    // the ride
    const f = this.fare;
    if (f) {
      if (!pc || pc !== f.cart || pc.sunk) { this.dropOff(false, pc && pc.sunk ? 'SPLASH. Your passenger swims for it.' : '"Fine, I\'ll WALK."'); }
      else {
        f.t -= dt;
        this.crazy(dt, pc, f);
        const poi = g.world.pois[f.dest];
        g.waypoint = { x: poi.x, z: poi.z, label: `🚐 ${DESTS[f.dest][0]}` };
        this.destMark.position.set(poi.x, heightAt(poi.x, poi.z), poi.z);
        if (Math.hypot(pc.x - poi.x, pc.z - poi.z) < 9 && pc.speed < 3.5) this.dropOff(true);
        else if (f.t <= 0) this.dropOff(false, pick(['"I\'ll walk! It\'s faster!"', '"I\'m calling an Uber. What\'s an Uber?"', '"That\'s it. I\'m walking. My hip can\'t take the suspense."']));
        else if (f.slowT > 6) { f.slowT = 0; this.say(f, pick(RIDE_LINES.slow)); }
      }
    }
    this.renderHud();
  }

  pickUp(h, cart) {
    const g = this.g, n = h.n;
    this.hailers.splice(this.hailers.indexOf(h), 1);
    this.unhail(h);
    n.data.riding = cart;
    n.state = 'static';
    seatCharacter(n.char, cart, -1);
    cart.passenger = n;
    const t = Math.round(12 + h.dist / 8.5);
    this.fare = { n, cart, dest: h.dest, fare: h.fare, tips: 0, t, t0: t, airT: 0, driftT: 0, slowT: 0, near: new Map(), lastSay: 0 };
    this.clock += 6;
    this.destMark.visible = true;
    audio.play('pickup');
    this.say(this.fare, pick(DESTS[h.dest][1]));
    g.ui.float(cart.x, cart.y + 2.4, cart.z, `+6s • ${DESTS[h.dest][0].toUpperCase()}`, '#5dff7a', 1.4);
    this.refill();
  }

  dropOff(delivered, why) {
    const g = this.g, f = this.fare;
    if (!f) return;
    this.fare = null;
    this.destMark.visible = false;
    g.waypoint = null;
    const n = f.n, c = f.cart;
    delete n.data.riding;
    if (c.passenger === n) c.passenger = null;
    // out of the cart and onto the curb
    g.scene.add(n.char.root);
    const ex = c.exitPoint ? c.exitPoint(-1) : { x: c.x + 1.5, z: c.z };
    n.x = ex.x; n.z = ex.z;
    n.char.root.position.set(n.x, heightAt(n.x, n.z), n.z);
    n.char.root.rotation.set(0, c.heading, 0);
    n.char.mode = 'idle';
    n.resumeBase();
    if (!delivered) {
      if (why) n.say(why, 2.5);
      g.ui.hint(`Fare lost! ${why || ''}`, 2.5);
      audio.play('fail', { vol: 0.5 });
      return;
    }
    if (c.model === 'stretch') f.tips = Math.round(f.tips * 1.5 + 5); // the limo experience
    const speedy = f.t > f.t0 * 0.5;
    const pay = f.fare + f.tips + (speedy ? Math.round(f.fare * 0.3) : 0);
    g.addMoney(pay, 'Senior Shuttle fare');
    this.stats.fares++;
    this.stats.cash += pay;
    this.stats.tips += f.tips + (speedy ? Math.round(f.fare * 0.3) : 0);
    this.clock += speedy ? 10 : 5;
    n.say(speedy ? pick(['Keep the change, hot rod!', 'Now THAT is service!', 'I\'m telling all the girls about you!']) : pick(['Took you long enough.', 'Here. Don\'t spend it all on beer. Spend some on beer.', 'I\'ve had faster colonoscopies.']), 2.5);
    g.ui.splash(speedy ? 'SPEEDY DELIVERY!' : 'FARE COMPLETE', `+${money(pay)}${f.tips ? ` (tips ${money(f.tips)})` : ''} • +${speedy ? 10 : 5}s`, 1.8, speedy ? '#5dff7a' : '#4cc9f0');
    audio.play('cash');
    g.xp('cha', 0.3);
  }

  // tips for driving like a maniac, with reviews from the back seat
  crazy(dt, pc, f) {
    const g = this.g;
    const tip = (amt, label) => {
      f.tips += amt;
      g.ui.float(pc.x, pc.y + 2.2, pc.z, `+${money(amt)} ${label}`, '#ffd23f', 1);
      audio.tone({ freq: 1320, type: 'square', dur: 0.05, vol: 0.06 });
    };
    if (pc.landed && pc.lastAir > 0.5) { tip(Math.round(pc.lastAir * 8), 'AIR!'); this.say(f, pick(RIDE_LINES.air), 0); }
    if (pc.lastImpact > 4) { f.tips = Math.max(0, f.tips - 3); this.say(f, pick(RIDE_LINES.crash), 0); }
    if (pc.skid > 0.5 && pc.speed > 6) {
      f.driftT += dt;
      if (f.driftT >= 1) { f.driftT = 0; tip(3, 'DRIFT!'); this.say(f, pick(RIDE_LINES.drift), 4); }
    }
    if (pc.speed > 8) {
      for (const o of g.carts) {
        if (o === pc || o.sunk) continue;
        const d = Math.hypot(o.x - pc.x, o.z - pc.z);
        const last = f.near.get(o) || 0;
        if (d < 3 && d > 2.2 && performance.now() - last > 4000) { f.near.set(o, performance.now()); tip(4, 'NEAR MISS!'); this.say(f, pick(RIDE_LINES.near), 3); }
      }
    }
    f.slowT = pc.speed < 2 ? f.slowT + dt : 0;
  }

  say(f, line, gap = 2.5) {
    const now = performance.now() / 1000;
    if (now - f.lastSay < gap) return;
    f.lastSay = now;
    f.n.say(line, 2.2);
  }

  renderHud() {
    const f = this.fare;
    const clock = Math.max(0, this.clock);
    const mm = Math.floor(clock / 60), ss = String(Math.floor(clock % 60)).padStart(2, '0');
    this.hud.classList.remove('hidden');
    this.hud.classList.toggle('low', clock < 15);
    this.hud.innerHTML = `<span class="sh-clock">🚐 ${mm}:${ss}</span><span>${this.stats.fares} fares • ${money(this.stats.cash)}</span>${f ? `<span class="sh-fare ${f.t < 10 ? 'low' : ''}">→ ${DESTS[f.dest][0]} <b>${Math.max(0, Math.ceil(f.t))}s</b> • ${money(f.fare)}${f.tips ? ` +${money(f.tips)}` : ''}</span>` : this.started ? '<span class="sh-fare">Find a fare under a light pillar</span>' : '<span class="sh-fare">Get in a cart to start the clock</span>'}`;
  }

  clear() {
    if (this.on) { this.on = false; if (this.fare) this.dropOff(false); for (const h of this.hailers) this.unhail(h); }
    this.hailers = [];
    this.g.scene.remove(this.destMark);
    if (this.doris && this.g.npcs.includes(this.doris)) this.g.removeNPC(this.doris);
    this.hud.classList.add('hidden');
  }
}

export function dorisNode(g) {
  const sh = g.shuttle;
  const best = g.state.counters.bestShift || 0;
  return {
    name: 'Dispatcher Doris', title: 'Sunset Palms Senior Shuttle • est. whenever the bus broke',
    text: sh.on ? '"You\'re on the clock, sugar! Go get \'em. The light pillars are the customers. Don\'t hit the customers."' : `"The shuttle bus broke in 1998 and the HOA never fixed it. So now it's you. Pick up residents, get 'em where they're going, fast. Tips for style. Clock goes up every time you deliver."${best ? `\n\nYour best shift: ${money(best)}.` : ''}`,
    choices: sh.on
      ? [{ text: 'End my shift', action: () => { sh.end('SHIFT ENDED'); return null; } }, { text: 'Back to work', action: () => null }]
      : [{ text: '🚐 Start a shift', action: () => { sh.start(); return null; } }, { text: 'Not now', action: () => null }],
  };
}
