// Hurricane Mildred: a warning the day before, then an afternoon storm that shoves carts, bends every
// palm in the county, flings lawn flamingos and patio chairs through the air, knocks out the power,
// and sends half the community to a hurricane party at the clubhouse. Afterward, the HOA pays a
// bounty for every stray flamingo you bring back.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M, shared } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { heightAt, waterAt } from '../world/terrain.js';
import { BUILDINGS } from '../world/layout.js';
import { audio } from '../core/audio.js';
import { rand, pick, chance, clamp } from '../core/utils.js';

const START = 13, FULL = 14, CALM = 20, END = 21; // storm hours on hurricane day
const PARTY = { x: 15, z: 12.5 }; // under the clubhouse portico
const PANIC = ['MY PERM!', 'Harold, get the lawn gnomes!', 'I survived Andrew, I can survive MILDRED!', 'Somebody grab the Werther\'s!', 'Is this the Rapture? I\'m not dressed!', 'The flamingos are migrating!'];
const PARTY_LINES = ['Mildred can\'t stop THIS party!', 'Pour me another boxed wine, it\'s a hurricane!', 'Hurricane party! Like 1965!', 'If the roof goes, I\'m going with it!', 'Somebody put on Jimmy Buffett!'];

// debris models (built once)
let DEBRIS = null;
function debrisGeos() {
  if (DEBRIS) return DEBRIS;
  DEBRIS = {
    flamingo: mergeParts([
      [GEO.sph, '#ff6fa8', mat4(0, 0.55, 0, 0, 0.22, 0.16, 0.32)],
      [GEO.cyl, '#ff6fa8', mat4(0, 0.82, 0.2, 0, 0.035, 0.45, 0.035, -0.3)],
      [GEO.sph, '#ff6fa8', mat4(0, 1.05, 0.3, 0, 0.08, 0.07, 0.1)],
      [GEO.cone, '#222', mat4(0, 1.02, 0.42, 0, 0.03, 0.12, 0.03, Math.PI / 2 + 0.5)],
      [GEO.cyl, '#222', mat4(0.05, 0.22, 0, 0, 0.012, 0.45, 0.012)],
      [GEO.cyl, '#222', mat4(-0.05, 0.22, 0, 0, 0.012, 0.45, 0.012)],
    ]),
    chair: mergeParts([
      [GEO.box, '#f4f4f4', mat4(0, 0.42, 0, 0, 0.5, 0.05, 0.5)],
      [GEO.box, '#f4f4f4', mat4(0, 0.72, -0.24, 0, 0.5, 0.55, 0.05, -0.15)],
      [GEO.cyl, '#f4f4f4', mat4(0.22, 0.2, 0.22, 0, 0.025, 0.42, 0.025)],
      [GEO.cyl, '#f4f4f4', mat4(-0.22, 0.2, 0.22, 0, 0.025, 0.42, 0.025)],
      [GEO.cyl, '#f4f4f4', mat4(0.22, 0.2, -0.22, 0, 0.025, 0.42, 0.025)],
      [GEO.cyl, '#f4f4f4', mat4(-0.22, 0.2, -0.22, 0, 0.025, 0.42, 0.025)],
    ]),
    noodle: mergeParts([[GEO.cyl, '#34d399', mat4(0, 0, 0, 0, 0.06, 1.5, 0.06)]]),
    lid: mergeParts([[GEO.cyl16, '#5c6a73', mat4(0, 0, 0, 0, 0.3, 0.04, 0.3)], [GEO.box, '#3f4a50', mat4(0, 0.04, 0, 0, 0.18, 0.04, 0.04)]]),
  };
  return DEBRIS;
}

export class Hurricane {
  constructor(g) {
    this.g = g;
    const s = g.state;
    s.hurricane ||= { day: -1, strays: 0, returned: 0 };
    this.debris = [];
    this.strays = []; // flamingo pickups left behind
    this.k = 0;
    this.windA = rand(0, Math.PI * 2);
    this.wind = { x: 0, z: 0, speed: 0 };
    this.party = [];
    this.spawnT = 0;
    this.outage = false;
  }

  get st() { return this.g.state.hurricane; }
  isToday() { return this.st.day === this.g.state.day; }

  // storm strength 0..1 right now
  level() {
    if (!this.isToday()) return 0;
    const h = this.g.state.minutes / 60;
    if (h < START || h >= END) return 0;
    if (h < FULL) return (h - START) / (FULL - START);
    if (h > CALM) return (END - h) / (END - CALM);
    return 1;
  }

  // called at each new day: maybe schedule one (first one lands on day 3)
  newDay() {
    const s = this.g.state;
    const st = this.st;
    if (st.day >= s.day) return;
    const due = (st.day < 0 && s.day >= 2) || (st.day >= 0 && s.day - st.day >= 5 && chance(0.25));
    if (due) this.schedule(s.day + 1);
  }

  schedule(day) {
    this.st.day = day;
    this.st.warned = false;
    this.g.state.flags.gazHurricane = false;
    this.g.ui.toast('🌀 NATIONAL HURRICANE CENTER: Hurricane Mildred (Category 1) expected to make landfall near Sunset Palms tomorrow afternoon. Tie down your flamingos.', 'heat', 9);
  }

  // reviewer shortcut: bring Mildred right now
  summon() {
    const s = this.g.state;
    this.st.warned = false;
    const want = START * 60 + 50;
    if (s.minutes < want) this.g.advanceTime(want - s.minutes);
    else if (s.minutes >= END * 60) this.g.advanceTime(1440 - s.minutes + want); // too late today: tomorrow afternoon
    this.st.day = s.day;
    this.g.ui.toast('🌀 Hurricane Mildred has arrived. Early. Like everyone around here.', 'heat', 6);
  }

  update(dt) {
    const g = this.g;
    const k = this.level();
    this.k = k;
    const p = g.player;
    // wind: slowly veering direction, gusting speed
    const t = performance.now() / 1000;
    this.windA += dt * 0.03;
    const gust = 0.75 + 0.25 * Math.sin(t * 0.9) + 0.15 * Math.sin(t * 2.7);
    const speed = 22 * k * gust;
    this.wind = { x: Math.sin(this.windA) * speed, z: Math.cos(this.windA) * speed, speed };
    // palms and bushes lean downwind and thrash (wind shader uniforms)
    shared.gust.value = 1 + 3.5 * k;
    shared.lean.value.set(this.wind.x, this.wind.z).multiplyScalar(0.05);
    g.weather.windX = 5 + this.wind.x * 1.2;
    if (k <= 0) {
      if (this.wasOn) this.stop();
      this.updateStrays();
      return;
    }
    if (!this.wasOn) this.start();
    // shove carts and the player
    for (const c of g.carts) {
      if (c.sunk || (!c.driver && c.grounded)) continue; // parked carts stay parked
      const push = c.grounded ? 0.06 : 0.35; // airborne carts sail
      c.vx += this.wind.x * push * dt;
      c.vz += this.wind.z * push * dt;
      if (!c.grounded) c.vy += 1.4 * k * dt; // updraft: storm chasers get extra hang time
    }
    if (!p.cart && !p.ko && !p.stand) {
      p.x += this.wind.x * 0.035 * dt;
      p.z += this.wind.z * 0.035 * dt;
    }
    // storm chaser: big air in the hurricane
    const pc = p.cart;
    if (pc && !pc.grounded && pc.airT > 2.4) g.achievement('stormchaser');
    // flying debris upwind of the player
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.debris.length < 22) {
      this.spawnT = rand(0.25, 0.9) / Math.max(0.3, k);
      this.spawnDebris();
    }
    this.updateDebris(dt);
    // residents panic
    if (chance(dt * 0.6 * k)) {
      const n = pick(g.npcs.filter((x) => x.role === 'resident' && x.state === 'wander' && x.visible));
      if (n) { n.say(pick(PANIC), 2); n.state = 'flee'; n.fleeFrom = { x: n.x - this.wind.x, z: n.z - this.wind.z }; n.fleeT = 3; }
    }
    // hurricane party at the clubhouse
    for (const n of this.party) {
      if (n.state !== 'party') continue;
      if (!n.char.action && chance(dt * 1.5)) n.char.play(pick(['dance', 'dance', 'cheer']), rand(1.5, 3));
      if (chance(dt * 0.02) && Math.hypot(n.x - p.x, n.z - p.z) < 25) n.say(pick(PARTY_LINES), 2.2);
    }
    // power goes out at dusk
    const h = g.state.minutes / 60;
    const out = k > 0.5 && h >= 18;
    if (out && !this.outage) g.ui.toast('⚡ The power is OUT across Sunset Palms. Somewhere, Karen is screaming at the power company.', 'heat', 6);
    this.outage = out;
  }

  start() {
    const g = this.g;
    this.wasOn = true;
    if (!this.st.warned) {
      this.st.warned = true;
      g.ui.splash('🌀 HURRICANE MILDRED 🌀', 'Category 1. Tie down the flamingos. Party at the clubhouse.', 4, '#4cc9f0');
      audio.play('siren');
    }
    // gather a crowd at the clubhouse
    const pool = g.npcs.filter((n) => (n.role === 'resident' || (n.role === 'lady' && !n.cart)) && n.state !== 'ko' && !n.hostile && !n.cart && !n.data.aqua);
    pool.sort((a, b) => Math.hypot(a.x - PARTY.x, a.z - PARTY.z) - Math.hypot(b.x - PARTY.x, b.z - PARTY.z));
    this.party = pool.slice(0, 12);
    for (const n of this.party) {
      n.state = 'walkTo';
      n.target = { x: PARTY.x + rand(-9, 9), z: PARTY.z + rand(-1.5, 1.5) };
      n.data.walkSpeed = n.walkSpeed * 1.8;
      n.data.after = 'party';
    }
    g.world.poi('hurricaneParty', PARTY.x, PARTY.z + 2.5, '🌀 Hurricane Party', 4);
  }

  stop() {
    const g = this.g;
    this.wasOn = false;
    this.outage = false;
    shared.gust.value = 1;
    shared.lean.value.set(0, 0);
    g.weather.windX = 5;
    for (const n of this.party) {
      n.data.after = undefined;
      n.data.walkSpeed = undefined;
      if ((n.state === 'party' || n.state === 'walkTo') && !n.hostile) n.resumeBase();
    }
    this.party = [];
    delete g.world.pois.hurricaneParty;
    // debris that was still flying comes down as strays
    for (const d of this.debris) this.land(d);
    this.debris = [];
    if (this.strays.length) g.ui.toast(`🦩 Mildred has passed. ${this.strays.length} lawn flamingos are scattered around the community. The HOA pays $25 a bird at the HOA Office.`, 'quest', 8);
  }

  spawnDebris() {
    const g = this.g;
    const p = g.player;
    const w = this.wind;
    const kind = pick(['flamingo', 'flamingo', 'flamingo', 'chair', 'noodle', 'lid']);
    const mesh = new THREE.Mesh(debrisGeos()[kind], M.vc);
    mesh.castShadow = true;
    // upwind of the player, off to one side
    const ws = w.speed || 1;
    const ux = w.x / ws, uz = w.z / ws;
    const side = rand(-25, 25), back = rand(30, 45);
    const x = p.x - ux * back + uz * side, z = p.z - uz * back - ux * side;
    const d = { kind, mesh, x, y: heightAt(x, z) + rand(2, 9), z, vx: w.x * rand(0.6, 1.1), vy: rand(-1, 3), vz: w.z * rand(0.6, 1.1), sx: rand(-6, 6), sy: rand(-6, 6), sz: rand(-6, 6), t: 0, hit: false };
    mesh.position.set(d.x, d.y, d.z);
    g.scene.add(mesh);
    this.debris.push(d);
  }

  updateDebris(dt) {
    const g = this.g;
    const p = g.player;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      d.vy -= 3.5 * dt; // mostly carried by the wind
      d.vx += (this.wind.x - d.vx) * 0.6 * dt;
      d.vz += (this.wind.z - d.vz) * 0.6 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.mesh.position.set(d.x, d.y, d.z);
      d.mesh.rotation.x += d.sx * dt; d.mesh.rotation.y += d.sy * dt; d.mesh.rotation.z += d.sz * dt;
      // bonk the player
      if (!d.hit && Math.abs(d.x - p.x) < 1 && Math.abs(d.z - p.z) < 1 && d.y > p.y && d.y < p.y + 2.2) {
        d.hit = true;
        if (!p.cart) g.damagePlayer(4, d.x - d.vx, d.z - d.vz, 5);
        audio.play('bonk', { vol: 0.7 });
        g.ui.float(p.x, p.y + 2.4, p.z, pick(['BONK!', 'FLAMINGO\'D!', 'OW!', 'THWACK!']), '#ff6fa8', 1.2);
      }
      const gy = heightAt(d.x, d.z);
      if (d.y <= gy + 0.1 || d.t > 12) {
        this.debris.splice(i, 1);
        this.land(d);
      }
    }
  }

  // debris comes to rest; flamingos become strays you can collect
  land(d) {
    const g = this.g;
    if (d.kind !== 'flamingo' || waterAt(d.x, d.z) || this.strays.length >= 14 || Math.abs(d.x) > 290 || Math.abs(d.z) > 290) {
      g.scene.remove(d.mesh);
      return;
    }
    const q = { x: d.x, z: d.z };
    g.world.col.resolve(q, 0.6); // blown onto a roof? it slides off onto the lawn
    d.x = q.x; d.z = q.z;
    if (waterAt(d.x, d.z)) { g.scene.remove(d.mesh); return; }
    d.mesh.position.set(d.x, heightAt(d.x, d.z) + 0.05, d.z);
    d.mesh.rotation.set(chance(0.5) ? Math.PI / 2 : 0, rand(0, 6.28), 0); // some land on their side
    this.strays.push(d);
    this.st.strays = this.strays.length;
  }

  updateStrays() {
    const g = this.g;
    const p = g.player;
    for (let i = this.strays.length - 1; i >= 0; i--) {
      const d = this.strays[i];
      if (Math.hypot(d.x - p.x, d.z - p.z) < 1.4) {
        g.scene.remove(d.mesh);
        this.strays.splice(i, 1);
        g.state.inv.flamingos = (g.state.inv.flamingos || 0) + 1;
        audio.play('pickup');
        g.ui.float(d.x, d.y + 1.2, d.z, '🦩 +1', '#ff6fa8', 1.2);
      }
    }
  }

  clear() {
    for (const d of [...this.debris, ...this.strays]) this.g.scene.remove(d.mesh);
    this.debris = [];
    this.strays = [];
    shared.gust.value = 1;
    shared.lean.value.set(0, 0);
  }
}

// hurricane party dialogue at the clubhouse portico
export function hurricanePartyNode(g) {
  const s = g.state;
  return {
    name: 'Hurricane Party', title: 'Clubhouse portico • Mildred is howling',
    text: '*Forty retirees, three boxes of Franzia, a battery radio playing Jimmy Buffett, and a man in a raincoat insisting this is "nothing compared to Andrew." The shutters are rattling. Nobody cares.*',
    choices: [
      { text: 'Grab a plastic cup of boxed wine', action: () => { s.buzz = Math.min(100, s.buzz + 18); audio.play('drink'); return { name: 'Hurricane Party', title: 'Franzia Sunset Blush', text: '*It tastes like sugar and regret. You pour another.* (+buzz)', choices: [{ text: 'Back to the party', action: () => hurricanePartyNode(g) }, { text: 'Leave', action: () => null }] }; } },
      { text: 'Start a conga line', tag: 'CHA', action: () => {
        const ok = g.roll('cha', 4);
        if (ok) { g.xp('stat', 2); g.achievement('conga'); }
        return { name: 'Hurricane Party', title: ok ? 'CONGA!' : 'Conga... no', text: ok ? '*Thirty-one seniors follow you around the clubhouse in a conga line while 90 mph winds rattle the windows. Someone\'s walker is part of it. It is the greatest moment of your retirement.* (+Status)' : '*Two people join. One of them is holding onto you for balance. The line dissolves near the snack table.*', choices: [{ text: 'Back to the party', action: () => hurricanePartyNode(g) }, { text: 'Leave', action: () => null }] };
      } },
      { text: '"This is nothing compared to Andrew."', action: () => ({ name: 'Hurricane Party', title: 'Storytime', text: '*You tell a story about Hurricane Andrew that is 40% true. The man in the raincoat tells one that is 10% true. You become best friends and mortal enemies simultaneously.*', choices: [{ text: 'Back to the party', action: () => hurricanePartyNode(g) }, { text: 'Leave', action: () => null }] }) },
      { text: 'Leave', action: () => null },
    ],
  };
}

export { BUILDINGS, clamp };
