// Living-world events + the morning newspaper.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { BUILDINGS } from '../world/layout.js';
import { heightAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { pick, rand, chance, money } from '../core/utils.js';

// ---------------------------------------------------------------- the Gazette
const FILLER = [
  ['BINGO NIGHT RIGGED? KAREN SAYS "NO COMMENT," SHREDS DOCUMENTS', 'Sources say the ball cage was "suspiciously light."'],
  ['GOLDEN CORAL RAISES EARLY BIRD CUTOFF TO 4:15; RESIDENTS RIOT', 'Three hips were broken in the resulting stampede. Two were Irv\'s.'],
  ['LOCAL WOMAN, 84, STILL WAITING FOR GRANDSON TO CALL', '"He\'s very busy," she told reporters, for the ninth time this week.'],
  ['PICKLEBALL LEAGUE DISBANDS OVER "DINKING" DISPUTE', 'Commissioner calls it "the darkest day since the shuffleboard wars."'],
  ['MR. CHOMPERS SPOTTED SUNBATHING ON HOLE 6', 'Golfers advised to play through. Quickly.'],
  ['HOA PROPOSES BAN ON "EXCESSIVE WHISTLING"', 'Public comment period is 11:00–11:02 AM Tuesday.'],
  ['MAN FINDS GLASSES ON OWN HEAD AFTER 3-HOUR SEARCH', 'Search party of 14 residents dismissed with thanks.'],
];

export function gazette(g) {
  const c = g.state.counters;
  const y = g.yesterday || {};
  const d = (k) => (c[k] || 0) - (y[k] || 0);
  const name = g.state.name.toUpperCase();
  const stories = [];
  const add = (h, sub) => stories.push([h, sub]);
  if ((g.state.achievements || []).includes('pierJump') && !g.state.flags.gazPier) {
    g.state.flags.gazPier = true;
    add(`LOCAL MAN DRIVES GOLF CART OFF PIER`, `"I thought it kept going," ${g.state.name} told the Coast Guard.`);
  }
  if (d('flamingos') >= 3) add(`FLAMINGO MASSACRE ON ${pick(['FLAMINGO DR', 'MANATEE BLVD', 'EGRET LN'])}: ${d('flamingos')} DOWN`, 'HOA offers reward. Suspect described as "wearing a loud shirt."');
  if (d('mailboxes') >= 1) add(`MAILBOX BASEBALL RETURNS TO SUNSET PALMS`, `${d('mailboxes')} mailbox${d('mailboxes') > 1 ? 'es' : ''} "went yard" overnight. USPS "deeply disappointed."`);
  if (d('knockouts') >= 3) add(`${d('knockouts')} RESIDENTS "TAKING UNSCHEDULED NAPS" AFTER BRAWLS`, 'Witnesses describe a man swinging a golf club "like it owed him money."');
  if (d('pillsSold') + d('teaSold') >= 5) add(`MYSTERIOUS "VITAMIN" SURGE BAFFLES LOCAL PHARMACIST`, 'Noise complaints up 400%. Clubhouse bingo attendance down. Nobody will say why.');
  if (d('busted') >= 1) add(`OFFICER DALE MAKES "HISTORIC ARREST"`, `${name} fined, released, described as "unrepentant." Dale has requested a medal.`);
  if (d('racesWon') >= 1) add(`${name} WINS BACK NINE GRAND PRIX`, `Rocket Ron: "Kid's got a lead foot. The kid is 72."`);
  if (d('parties') >= 1) add(`LAWN PARTY ROCKS FLAMINGO DR`, 'Karen calls it "the Woodstock of noise violations."');
  if (d('conquests') >= 1) add(`RESIDENT SPOTTED LEAVING NEIGHBOR'S HOUSE AT 6 AM`, 'Bridge club "absolutely buzzing." Names withheld. (It was you.)');
  if (d('beers') >= 8) add(`LIQUOR BARREL REPORTS "BEST TUESDAY EVER"`, `Barb credits "one very thirsty customer." ${d('beers')} beers and counting.`);
  if (d('treasures') >= 2) add(`BEACH "TREASURE HUNTER" STRIKES AGAIN`, 'Lifeguard Vic: "He dug up my car keys. I lost those in 1987."');
  if (d('cartsTaken') >= 1) add(`BEVERAGE CART "HOSTILE TAKEOVER" ROCKS COUNTRY CLUB SET`, 'Chip Wainwright III: "This is a travesty. Father will hear about this."');
  // Chapter 3: the Lucky Lady
  const qf = g.state.quest.flags;
  const once = (flag, h, sub) => { if (!g.state.flags[flag]) { g.state.flags[flag] = true; add(h, sub); } };
  if (qf.vaultChoice === 'return') once('gazVault', `PENSIONS MYSTERIOUSLY RETURNED TO FLAMINGO DRIVE MAILBOXES`, `Earl Finkbeiner reunited with dentures. "Whoever you are, I owe you a Werther's." Casino captain "unavailable for comment, crying."`);
  else if (qf.vaultChoice === 'keep') once('gazVault', `$48,211 PENSION HEIST ROCKS BOCA WATERFRONT`, `Police baffled. Residents furious. A local man was seen buying a gold-plated recliner "in cash, from a duffel bag."`);
  else if (qf.vaultChoice === 'split') once('gazVault', `HALF OF STOLEN PENSIONS "JUST SHOW UP" IN MAILBOXES`, `Residents grateful, confused, and doing math. "Where's the other half?" asks everyone.`);
  if (qf.c3Jackpot) once('gazJackpot', `GOLDEN GAM-GAM PAYS OUT FOR FIRST TIME SINCE 1979`, `Machine #3 played "Wind Beneath My Wings." Three nearby grandmothers fainted. Mechanic "Fingers" Fanucci: "Beats me."`);
  if (d('overboard') >= 1) add(`MAN THROWN OFF CASINO BOAT, WASHES UP ON BOCA BEACH`, `"The Captain cheats," the man told a seagull. The seagull took his shoe.`);
  if (g.state.hoa.president && !g.state.flags.gazPres) { g.state.flags.gazPres = true; add(`${name} ELECTED HOA PRESIDENT IN SHOCK UPSET`, 'Karen demands recount, is escorted from clubhouse clutching a clipboard.'); }
  while (stories.length < 3) {
    const f = pick(FILLER);
    if (!stories.some((s) => s[0] === f[0])) stories.push(f);
  }
  g.yesterday = { ...c };
  return stories.slice(0, 4);
}

export function showGazette(g) {
  const s = gazette(g);
  const el = document.getElementById('gazette');
  if (!el) return;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  el.innerHTML = `
    <div class="gz-paper">
      <div class="gz-mast">The Sunset Palms Gazette</div>
      <div class="gz-date">${days[g.state.dow]} • Day ${g.state.day + 1} • 25¢ (Seniors Free) • "All The News That Fits Your Reading Glasses"</div>
      <div class="gz-lead"><h1>${s[0][0]}</h1><p>${s[0][1]}</p></div>
      <div class="gz-cols">${s.slice(1).map(([h, p]) => `<div><h2>${h}</h2><p>${p}</p></div>`).join('')}</div>
      <div class="gz-foot">Click or press any key to put the paper down</div>
    </div>`;
  el.classList.remove('hidden');
  g.ui.modal = 'gazette';
  if (g.ui.onModalOpen) g.ui.onModalOpen();
  const close = () => {
    el.classList.add('hidden');
    if (g.ui.modal === 'gazette') g.ui.modal = null;
    window.removeEventListener('keydown', close);
    el.onclick = null;
    if (g.ui.onModalClose) g.ui.onModalClose();
  };
  setTimeout(() => {
    el.onclick = close;
    window.addEventListener('keydown', close);
  }, 400);
}

// ---------------------------------------------------------------- world events
export class Events {
  constructor(g) {
    this.g = g;
    this.cooldown = 45; // real seconds until the first event
    this.active = null;
  }

  update(dt) {
    const g = this.g;
    const h = g.state.minutes / 60;
    // Early Bird Rush: every day at 3PM the buffet gets mobbed
    if (h >= 15 && h < 15.1 && g.state.flags.rushDay !== g.state.day) {
      g.state.flags.rushDay = g.state.day;
      this.earlyBird();
    }
    if (this.active) {
      this.active.update(dt);
      if (this.active.done) {
        this.active = null;
        this.cooldown = rand(70, 140);
      }
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown > 0 || g.race?.running || g.party) return;
    const r = Math.random();
    this.active = r < 0.55 ? new CatInTree(g) : new Streaker(g);
    if (this.active.failed) { this.active = null; this.cooldown = 20; }
  }

  earlyBird() {
    const g = this.g;
    const b = BUILDINGS.buffet;
    const pool = g.npcs.filter((n) => n.role === 'resident' && n.state === 'wander' && !n.cart && Math.hypot(n.x - b.x, n.z - b.z) < 260);
    for (const n of pool.slice(0, 12)) {
      n.state = 'walkTo';
      n.target = { x: b.door[0] + rand(-7, 7), z: b.door[1] + rand(0, 5) };
      n.data.walkSpeed = n.walkSpeed * 2.2;
      n.data.after = 'wander';
      if (chance(0.3)) n.say(pick(['EARLY BIRD! OUT OF MY WAY!', 'The shrimp goes FAST!', 'I did not survive the Depression to miss the prime rib!']), 2.5);
    }
    g.ui.toast('🍗 3:00 PM: THE EARLY BIRD RUSH is on at the Golden Coral. Do not get between a senior and the prime rib.', 'quest', 6);
  }
}

// A cat is stuck in a palm; ram the palm with a cart (or whack it with a club) to shake it loose.
class CatInTree {
  constructor(g) {
    this.g = g;
    const p = g.player;
    const palms = (g.world.palmSpots || []).filter((s) => s.x < 290 && Math.hypot(s.x - p.x, s.z - p.z) > 40 && Math.hypot(s.x - p.x, s.z - p.z) < 160);
    if (!palms.length) { this.failed = true; return; }
    this.palm = pick(palms);
    const owner = g.npcs.filter((n) => n.role === 'resident' && n.female && n.state === 'wander').sort((a, b) => Math.hypot(a.x - this.palm.x, a.z - this.palm.z) - Math.hypot(b.x - this.palm.x, b.z - this.palm.z))[0];
    if (!owner) { this.failed = true; return; }
    this.owner = owner;
    owner.state = 'static';
    owner.x = this.palm.x + 3;
    owner.z = this.palm.z + 2;
    owner.data.face = Math.atan2(this.palm.x - owner.x, this.palm.z - owner.z);
    this.catName = pick(['Mr. Whiskers', 'Sir Fluffington', 'Princess Meatloaf', 'Liberace', 'Tuna Turner']);
    const cat = new THREE.Mesh(mergeParts([
      [GEO.sph, '#f2a33a', mat4(0, 0.2, 0, 0, 0.2, 0.18, 0.3)],
      [GEO.sph, '#f2a33a', mat4(0, 0.38, 0.25, 0, 0.14, 0.13, 0.13)],
      [GEO.cone, '#f2a33a', mat4(0.08, 0.52, 0.25, 0, 0.04, 0.08, 0.04)],
      [GEO.cone, '#f2a33a', mat4(-0.08, 0.52, 0.25, 0, 0.04, 0.08, 0.04)],
      [GEO.cyl, '#e8902a', mat4(0, 0.35, -0.35, 0, 0.03, 0.35, 0.03, 0.8)],
    ]), M.vc);
    this.cat = cat;
    this.cy = heightAt(this.palm.x, this.palm.z) + this.palm.top - 0.4;
    cat.position.set(this.palm.x, this.cy, this.palm.z);
    g.scene.add(cat);
    this.t = 0;
    this.stage = 'stuck';
    this.marker = { x: this.palm.x, z: this.palm.z };
    g.eventMarkers.push(this.marker);
    g.ui.toast(`🐈 ${owner.name.split(' ')[0]}'s cat ${this.catName} is stuck in a palm tree! Ram the tree with your cart (or give it a whack) to shake it loose.`, 'quest', 7);
    this.nag = 0;
  }

  update(dt) {
    const g = this.g;
    const p = g.player;
    this.t += dt;
    if (this.stage === 'stuck') {
      this.cat.rotation.y = Math.sin(this.t * 2) * 0.5;
      this.nag -= dt;
      if (this.nag <= 0 && Math.hypot(p.x - this.palm.x, p.z - this.palm.z) < 35) {
        this.nag = 7;
        this.owner.say(pick([`${this.catName}! Come down, baby!`, 'Somebody DO something!', 'Shake the tree! SHAKE IT!']), 3);
        audio.tone({ freq: 900, to: 600, type: 'triangle', dur: 0.3, vol: 0.08 }); // meow
      }
      const c = p.cart;
      const hitByCart = c && c.lastImpact > 3 && Math.hypot(c.x - this.palm.x, c.z - this.palm.z) < 2.8;
      const hitByClub = p.swing && p.swing.done && !this._swung && Math.hypot(p.x - this.palm.x, p.z - this.palm.z) < 2.6;
      if (p.swing && p.swing.done) this._swung = true; else if (!p.swing) this._swung = false;
      if (hitByCart || hitByClub) {
        this.stage = 'fall';
        this.vy = 2;
        audio.tone({ freq: 1200, to: 500, type: 'sawtooth', dur: 0.5, vol: 0.08 });
        g.camRig.addShake(0.3);
        for (let i = 0; i < 12; i++) g.particles.emit('leaf', this.palm.x, this.cy + 1, this.palm.z, { vx: rand(-2, 2), vy: rand(0, 2), vz: rand(-2, 2), gravity: 3, life: 2, size: 0.4, spin: 3 });
      }
      if (this.t > 240) this.finish(false);
    } else if (this.stage === 'fall') {
      this.vy -= 15 * dt;
      this.cy += this.vy * dt;
      const gy = heightAt(this.cat.position.x, this.cat.position.z);
      if (this.cy <= gy) {
        this.cy = gy;
        this.stage = 'run';
      }
      this.cat.position.y = this.cy;
      this.cat.rotation.x += dt * 8;
    } else if (this.stage === 'run') {
      this.cat.rotation.x = 0;
      const o = this.owner;
      const dx = o.x - this.cat.position.x, dz = o.z - this.cat.position.z, d = Math.hypot(dx, dz);
      this.cat.rotation.y = Math.atan2(dx, dz);
      if (d > 0.8) {
        this.cat.position.x += (dx / d) * 6 * dt;
        this.cat.position.z += (dz / d) * 6 * dt;
        this.cat.position.y = heightAt(this.cat.position.x, this.cat.position.z);
      } else this.finish(true);
    }
  }

  finish(ok) {
    const g = this.g;
    this.done = true;
    g.scene.remove(this.cat);
    g.eventMarkers = g.eventMarkers.filter((m) => m !== this.marker);
    this.owner.resumeBase();
    if (ok) {
      this.owner.say(`${this.catName}! My hero!`, 3);
      this.owner.char.play('cheer', 1.5);
      g.addMoney(60, 'cat rescue reward');
      g.xp('cha', 2);
      g.xp('stat', 1);
      g.state.counters.cats = (g.state.counters.cats || 0) + 1;
      g.achievement('cat');
    }
  }
}

// A 90-year-old streaker in nothing but a fanny pack. The HOA pays a bounty.
class Streaker {
  constructor(g) {
    this.g = g;
    const zones = [BUILDINGS.pooldeck, BUILDINGS.clubhouse];
    const z = pick(zones);
    const n = g.spawnNPC({ name: '"The Naked Gun" (Earl, 91)', female: false, role: 'streaker', x: z.x - 30, z: z.z + 20, hp: 40, look: { shirt: 6, shorts: '#f1c7a5', hat: 'none', glasses: 'none', mustache: true, skin: '#f1c7a5', sock: '#f1c7a5', shoe: '#f1c7a5' }, walkSpeed: 3.2, runSpeed: 4.8 });
    n.data.temp = true;
    n.data.quiet = true;
    n.state = 'flee';
    n.fleeFrom = { x: z.x + 30, z: z.z - 20 };
    n.fleeT = 999;
    this.n = n;
    this.t = 0;
    this.marker = n;
    g.eventMarkers.push(n);
    n.say('WHEEEEEE!', 2.5);
    g.ui.toast('🍑 STREAKER ALERT near the clubhouse! Earl (91) is running around in nothing but a fanny pack. The HOA pays $150 to whoever stops him.', 'quest', 7);
  }

  update(dt) {
    const g = this.g;
    const n = this.n;
    this.t += dt;
    if (!g.npcs.includes(n)) return this.finish(false);
    // he weaves around the clubhouse grounds, cackling
    if (n.state === 'flee' || n.state === 'wander') {
      n.state = 'flee';
      n.fleeFrom = { x: n.x + Math.sin(this.t * 0.7) * 20, z: n.z + Math.cos(this.t * 0.5) * 20 };
      if (Math.hypot(n.x - g.player.x, n.z - g.player.z) < 12) n.fleeFrom = g.player;
      n.fleeT = 999;
      if (chance(dt * 0.3)) n.say(pick(['CATCH ME IF YOU CAN!', 'FREEDOM!', "I'M 91! WHAT ARE THEY GONNA DO?", 'The breeze! THE BREEZE!']), 2);
      // keep him near the clubhouse/pool so the chase stays fun
      const hx = 30, hz = 5;
      if (Math.hypot(n.x - hx, n.z - hz) > 90) n.fleeFrom = { x: n.x + (n.x - hx), z: n.z + (n.z - hz) };
    }
    if (n.state === 'ko') return this.finish(true);
    if (this.t > 150) {
      n.say('Nap time. Byeee!', 2);
      return this.finish(false);
    }
  }

  finish(caught) {
    const g = this.g;
    this.done = true;
    g.eventMarkers = g.eventMarkers.filter((m) => m !== this.marker);
    if (caught) {
      g.addMoney(150, 'HOA streaker bounty');
      g.heat.value = Math.max(0, g.heat.value - 1);
      g.xp('intim', 1);
      g.achievement('streaker');
      g.ui.splash('STREAKER STOPPED', 'The HOA thanks you. Earl thanks nobody.', 2.5);
    } else {
      this.n.state = 'flee';
      this.n.fleeT = 20;
    }
  }
}

export { money };
