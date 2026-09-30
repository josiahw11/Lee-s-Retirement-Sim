// The Game: owns state + all runtime entities and runs every system each frame.
import * as THREE from 'three';
import { Cart } from '../entities/cart.js';
import { Props, Balls, Pickups } from '../entities/props.js';
import { NPC } from './npcs.js';
import { Player } from './player.js';
import { Driver, COURSE_LOOPS, PATROL_LOOP, nearestNode } from './traffic.js';
import { Quests } from './quests.js';
import { Race, RACE_TIERS, TRACK } from './race.js';
import { ChugOff, Bingo, Brew } from './minigames.js';
import { Weather } from '../gfx/weather.js';
import { Party } from './party.js';
import { Events, showGazette } from './events.js';
import { Life } from './life.js';
import { BEACH, OCEAN, onSand } from '../world/beach.js';
import { updateTooth, deuceConfront, spawnTooth, spawnDeuce } from './chapter2.js';
import { WEAPONS, WEAPON_ORDER, LADIES, RECRUITS, CONCESSION, BLACKOUTS, CART_MODS, SHOPS } from './data.js';
import * as D from './dialogue.js';
import { NODES, EDGES, HOLES, PONDS, ZONES, STREETS, HOUSES, PLAYER_HOUSE, BUILDINGS } from '../world/layout.js';
import { heightAt, waterAt, onCourse, POOL, WATER_Y } from '../world/terrain.js';
import { clamp, lerp, rand, randInt, pick, chance, money, DAYS, fmtTime, distToSegment, wrapAngle, damp, dampAngle } from '../core/utils.js';
import { audio } from '../core/audio.js';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';

const SAVE_KEY = 'sunset-palms-save-v1';
const TIME_SCALE = 2; // game minutes per real second (1 day = 12 real minutes)

export function defaultState(name = 'Lee') {
  const romance = {};
  for (const l of LADIES) romance[l.id] = { aff: 0, conquest: false, last: -9999 };
  const carts = {};
  for (const c of CONCESSION) carts[c.id] = { owned: false, cut: 0, stock: { pills: 0, tea: 0 }, earned: 0 };
  return {
    v: 1,
    name,
    money: 180,
    day: 0, dow: 4, minutes: 8 * 60 + 30,
    stats: { str: { lvl: 2, xp: 0 }, cha: { lvl: 2, xp: 0 }, intim: { lvl: 1, xp: 0 }, stat: { lvl: 1, xp: 0 } },
    inv: { beer: 0, wine: 0, flowers: 0, pills: 0, tea: 0, balls: 0, teabags: 0, antler: 0, tooth: 0, towel: 0 },
    ballCap: 1, hopper: false, drones: 0, droneBank: 0,
    weapons: ['fists'], weapon: 'fists',
    cart: { color: '#ffffff', upgrades: {} },
    owned: { polo: false, chain: false, rolex: false, detector: false },
    look: { shirt: 0, hat: 'visor', glasses: 'aviator', sock: '#141414' },
    wardrobe: { shirt: [0], hat: ['visor'], glasses: ['aviator', 'none'], sock: ['#141414'] },
    romance,
    quest: { step: 0, flags: {}, started: {} },
    flags: {},
    empire: { carts, gang: [] },
    hoa: { registered: false, votes: 0, president: false, puppet: false, dirt: false, decrees: [], campaigned: {} },
    heat: 0,
    buzz: 0, bladder: 10,
    buffs: { colada: 0, rhino: 0, blue: 0 },
    perks: { casseroleDay: -1 },
    counters: { beers: 0, beersToday: 0, flamingos: 0, mailboxes: 0, gnomes: 0, ballsSold: 0, pillsSold: 0, teaSold: 0, knockouts: 0, maxAir: 0, pees: 0, conquests: 0, cartsTaken: 0, busted: 0, earned: 0, drunkDrive: 0 },
    achievements: [],
    pos: null,
  };
}

const ACH = {
  firstBeer: ['Liquid Breakfast', 'Drank your first beer of the day. It\'s 5 o\'clock somewhere. Specifically Greenland.'],
  sixpack: ['Six Pack Senior', 'Drank 6 beers in a single day.'],
  air: ['Evel Knievel Jr.', 'Got 1.6+ seconds of air in a golf cart.'],
  pool: ['Code Yellow', 'Peed in the clubhouse pool.'],
  flamingo10: ['Flamingo Liberation Front', 'Liberated 10 lawn flamingos.'],
  mailbox: ['Mailbox Baseball', 'Smashed 5 mailboxes.'],
  splash: ['Hole In One', 'Launched a resident into a water hazard.'],
  sunk: ['Captain Sinks-A-Lot', 'Sank a golf cart.'],
  ko10: ['Assisted Living', 'Knocked out 10 people. They needed the nap.'],
  conquest: ['Still Got It', 'Your first romantic conquest.'],
  tammy: ['LEGEND', 'Won the heart of Tammy the Cart Girl.'],
  president: ['Mr. President', 'Took control of the HOA.'],
  busted: ['Rap Sheet', 'Got busted by HOA Security.'],
  blackout: ['Where Am I?', 'Drank until you blacked out.'],
  drunkDrive: ['Designated Driver? Never Heard Of Her', 'Drove hammered for 30 seconds straight.'],
  carjack: ['Grand Theft Golf Cart', 'Yanked a senior out of their own cart.'],
  cat: ['Neighborhood Hero', 'Rescued a cat from a palm tree (by ramming the tree).'],
  streaker: ['Indecent Exposure Unit', 'Tackled Earl, the 91-year-old streaker.'],
  pierJump: ["Ocean's Eleven Feet Deep", 'Drove a golf cart off the end of the pier.'],
  treasure: ['X Marks The Spot', 'Dug up buried treasure with a metal detector.'],
  gator: ['Gator Bait', 'Got bitten by Mr. Chompers. The sign warned you.'],
  raceWin: ['Geriatric Grand Prix', 'Won a golf cart race.'],
  chug: ['Bottoms Up', 'Won a chug-off.'],
  party: ['Animal House', 'Threw a lawn party at your place.'],
  bingo: ['Beat the System', "Won Karen's rigged bingo."],
  raceLegend: ['Senior Speed Demon', 'Won a $500 race against The Widow Maker.'],
};

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.npcs = [];
    this.carts = [];
    this.named = {};
    this.tags = [];
    this.eventMarkers = [];
    this.concession = [];
    this.drones = [];
    this.events = [];
    this.markerPos = null;
    this.running = false;
    this.fx = { damage: 0, blind: 0, fade: 0, drunk: 0, rhino: 0 };
    this.heat = { value: 0, get level() { return Math.min(5, Math.floor(this.value + 0.001)); } };
    this.state = defaultState();
    this.quests = new Quests(this);
    this.props = new Props(this.scene, this.world.propSpawns);
    this.balls = new Balls(this.scene);
    this.pickups = new Pickups(this.scene);
    this._lastToast = {};
    this._secT = 0;
    this.cut = null;
    this.titleT = 0;
    this.lampLights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffd59a, 0, 24, 1.6);
      this.scene.add(l);
      this.lampLights.push(l);
    }
    this.headlight = new THREE.SpotLight(0xfff2cc, 0, 45, 0.55, 0.5, 1.2);
    this.headlight.castShadow = false;
    this.scene.add(this.headlight, this.headlight.target);
    this.neonLight = new THREE.PointLight(0xff2bd6, 0, 7, 1.5);
    this.scene.add(this.neonLight);
    this.partyLight = new THREE.PointLight(0xff8fd0, 0, 26, 1.4);
    this.scene.add(this.partyLight);
    this.weather = new Weather(this.scene);
    this.storm = null;
    this.ui.onBubble = (ent, text) => {
      if (!this.running || text.startsWith('*') || ent === this.player) return;
      const d = Math.hypot(ent.x - this.player.x, ent.z - this.player.z);
      if (d > 30) return;
      ent.voice ??= rand(0.8, 1.2);
      audio.mumble(text, { female: ent.female, pitch: ent.voice, vol: clamp(1.2 - d / 30, 0.2, 1) });
    };
    this.populate();
    const ph = PLAYER_HOUSE;
    const cs = this.world.playerCartSpawn;
    this.playerCart = this.addCart({ x: cs.x, z: cs.z, ry: cs.ry, kind: 'player', color: '#ffffff' });
    this.player = new Player(this, ph.frontPos.x, ph.frontPos.z, ph.facing);
    this.state.minutes = 18.1 * 60; // golden hour for the title screen
  }

  // Title screen: the world lives on while the camera drifts around the clubhouse.
  titleUpdate(dt) {
    this.titleT += dt;
    for (const n of this.npcs) n.update(dt);
    this.updateCarts(dt);
    this.props.update(dt, 0, 0);
    this.balls.update(dt, this.scene);
    this.updateVisibility();
    this.updateLights(dt);
    const t = this.titleT * 0.05;
    const cx = 30, cz = 5;
    this.camera.position.set(cx + Math.cos(t) * 70, 22 + Math.sin(t * 0.7) * 4, cz + Math.sin(t) * 70);
    this.camera.lookAt(cx, 4, cz);
    this._fT = (this._fT || 0) - dt;
    if (this._fT <= 0) {
      this._fT = 0.05;
      for (const f of this.world.fountains) for (let i = 0; i < 3; i++) this.particles.emit('drop', f.x + rand(-0.2, 0.2), f.y + 0.3, f.z + rand(-0.2, 0.2), { vx: rand(-1.2, 1.2), vy: rand(6, 8), vz: rand(-1.2, 1.2), gravity: 9.8, life: 1.5, size: 0.3 });
    }
  }

  // ================================================================ spawning
  spawnNPC(o) {
    const n = new NPC(this, o);
    this.npcs.push(n);
    return n;
  }

  removeNPC(n) {
    if (n.cart) n.leaveCart();
    for (const o of this.npcs) if (o.aggro === n) { o.aggro = null; if (o.state === 'fight') o.resumeBase(); }
    n.char.dispose();
    this.npcs = this.npcs.filter((x) => x !== n);
    for (const b of this.ui.bubbles) if (b.ent === n) b.t = 0;
  }

  addCart(o) {
    const c = new Cart(o);
    this.scene.add(c.group);
    this.carts.push(c);
    return c;
  }

  populate() {
    const w = this.world;
    // parked carts
    for (const s of w.cartSpawns) this.addCart({ ...s, kind: s.owner === 'club' ? 'club' : 'resident' });
    // ball supply
    for (let i = 0; i < 110; i++) {
      const p = w.randomBallSpot();
      this.balls.add(p.x, p.z);
    }
    // residents
    const streetZone = (s) => ({ name: s.name, x0: s.x - 7, x1: s.x + 7, z0: 72, z1: 262 });
    for (let i = 0; i < 34; i++) {
      const female = i % 2 === 0;
      let o;
      if (i < 16) {
        const z = pick(ZONES);
        const p = w.randomZonePoint(z);
        o = { female, x: p.x, z: p.z, zone: z };
      } else {
        const h = HOUSES[Math.floor(Math.random() * HOUSES.length)];
        if (h.owner === 'player') continue;
        const s = STREETS.find((st) => st.name === h.street);
        o = { female, x: h.lawn.x, z: h.lawn.z, homePt: h.lawn, zone: streetZone(s) };
      }
      const n = this.spawnNPC({ ...o, role: 'resident' });
      n.data.snitch = female && chance(0.35);
      n.data.tough = randInt(1, 3);
      this.assignWants(n);
    }
    // walkers (with actual walkers)
    for (let i = 0; i < 4; i++) {
      const z = pick(ZONES);
      const p = w.randomZonePoint(z);
      const n = this.spawnNPC({ female: false, x: p.x, z: p.z, zone: z, role: 'resident', look: { walker: true }, walkSpeed: 0.6 });
      this.assignWants(n);
    }
    // shopkeepers
    const keeper = (name, female, x, z, face, poi, look = {}) => {
      const n = this.spawnNPC({ name, female, x, z, heading: face, role: 'shopkeeper', state: 'static', look: { female, ...look }, homePt: { x, z } });
      n.data.face = face;
      n.data.poi = poi;
      n.data.quiet = true;
      this.named[poi] = n;
      return n;
    };
    keeper('Barb', true, 153, 46.5, 0, 'liquor', { hair: '#d96d3b', shirt: 1, glasses: 'none', hat: 'none' });
    keeper('Gus', false, -23, -36, Math.PI, 'proshop', { hat: 'cap', hatColor: '#2f6b4a', shirt: 6, mustache: true, belly: 1.4 });
    keeper('Doc Pratt', false, -247.8, -4.5, Math.PI / 2, 'doc', { hat: 'fedora', hatColor: '#3a2a1a', glasses: 'readers', shirt: 6, shorts: '#4a5a7a', mustache: true });
    keeper('Sal', false, -223.5, 22, Math.PI / 2, 'sal', { hat: 'cap', hatColor: '#111111', shirt: 2, shorts: '#4a5a7a', belly: 1.5, glasses: 'none' });
    keeper('Flo', true, 193, 47.5, 0, 'buffet', { hair: '#f0d7a1', shirt: 3, glasses: 'readers' });
    keeper('Deb', true, 232, 46.5, 0, 'hoa', { hair: '#bdbdbd', shirt: 2, glasses: 'readers', hat: 'none' });
    keeper('Manny', false, 98, -2, 0, 'tiki', { hat: 'bucket', hatColor: '#f2c94c', shirt: 0, glasses: 'aviator', skin: '#c68863' });
    keeper('Skip', false, BEACH.bar.x + 7.6, BEACH.bar.z + 2.6, Math.PI / 2, 'pelican', { hat: 'bucket', hatColor: '#ff6b1a', shirt: 7, glasses: 'aviator', skin: '#c68863', hair: '#f0d7a1' });
    keeper('Captain Roy', false, BEACH.bait.x + 5, BEACH.bait.z + 2.5, Math.PI / 2, 'bait', { hat: 'fedora', hatColor: '#23408e', shirt: 2, mustache: true, belly: 1.4 });
    // beach life
    const vic = this.spawnNPC({ name: 'Vic, Retired Lifeguard', female: false, role: 'lifeguard', x: BEACH.tower.x + 2.6, z: BEACH.tower.z, state: 'static', look: { hat: 'visor', hatColor: '#e84a5f', shirt: 1, shorts: '#e84a5f', glasses: 'aviator', mustache: true, skin: '#9a6545' }, homePt: { x: BEACH.tower.x + 2.6, z: BEACH.tower.z } });
    vic.data.face = Math.PI / 2;
    vic.data.quiet = true;
    [[452, -1], [481, 1], [508, -1]].forEach(([x, side], i) => {
      const n = this.spawnNPC({ name: [`Fishin' Phil`, 'Old Man Moe', 'Sully'][i], female: false, role: 'fisher', x, z: BEACH.pier.z + side * 2.2, state: 'fish', look: { hat: 'bucket', hatColor: '#8a9a6a', shirt: 6 } });
      n.data.face = side > 0 ? 0 : Math.PI;
      n.char.setHeld('rod');
      n.data.quiet = true;
    });
    (this.world.beachSpots || []).slice(0, 6).forEach((sp) => {
      const n = this.spawnNPC({ female: chance(0.65), role: 'resident', x: sp.x, z: sp.z, state: 'lounge', look: { hat: 'none', glasses: 'big' } });
      n.baseState = 'lounge';
      n.data.face = rand(0, 6.28);
      n.heading = n.data.face;
      this.assignWants(n);
    });

    // Karen
    this.named.karen = this.spawnNPC({ name: 'Karen Whitmore', female: true, role: 'karen', x: 230, z: 50, zone: { x0: -10, x1: 250, z0: 44, z1: 52 }, look: { female: true, hair: '#f0d7a1', shirt: 6, hat: 'none', glasses: 'readers', skin: '#f5d3b8' }, walkSpeed: 1.5 });
    this.named.karen.data.quiet = true;

    // ladies (Tammy is spawned as a beverage cart operator)
    const spots = {
      beach: { x0: 368, x1: 416, z0: 30, z1: 140 },
      pool: ZONES[1], shuffle: ZONES[2], tiki: { x0: 88, x1: 108, z0: 5, z1: 12 }, pickleball: ZONES[4], clubhouse: ZONES[0],
    };
    for (const def of LADIES) {
      if (def.id === 'tammy') continue;
      const z = spots[def.spot];
      const p = w.randomZonePoint(z);
      const n = this.spawnNPC({ name: def.name, female: true, role: 'lady', x: p.x, z: p.z, zone: z, look: def.look, walkSpeed: 0.8 });
      n.data.lady = def;
      n.data.quiet = true;
      this.named[def.id] = n;
    }
    // husbands
    this.named.frank = this.spawnNPC({ name: 'Big Frank Mancuso', female: false, role: 'husband', x: -150, z: 40, zone: ZONES[4], hp: 90, dmg: 10, look: { female: false, belly: 1.6, height: 1.08, shirt: 1, hat: 'cap', hatColor: '#111111', glasses: 'none', mustache: true, skin: '#e8b996', hair: '#1c1c1c' } });
    // Chip + goons near the pro shop cart barn
    const goonLook = (i) => ({ female: false, shirt: [6, 4, 7][i % 3], shorts: '#f2f2f2', hat: 'visor', hatColor: '#ffffff', glasses: 'aviator', sweater: ['#f7a1c4', '#8fd3ff', '#fbe7a1'][i % 3], skin: '#f5d3b8' });
    this.named.chip = this.spawnNPC({ name: 'Chip Wainwright III', female: false, role: 'rival', x: 6, z: -38, state: 'static', hp: 80, dmg: 11, weapon: 'iron', look: { ...goonLook(0), sweater: '#f7a1c4', hat: 'none', hair: '#f2f2f2', belly: 0.95, height: 1.05, glasses: 'none' }, homePt: { x: 6, z: -38 } });
    this.named.chip.data.face = Math.PI;
    this.chipGoons = ['Biff', 'Thurston'].map((nm, i) => {
      const g = this.spawnNPC({ name: nm, female: false, role: 'goon', x: 2 + i * 7, z: -40, state: 'static', hp: 55, dmg: 9, weapon: 'putter', look: goonLook(i + 1), homePt: { x: 2 + i * 7, z: -40 } });
      g.data.face = Math.PI;
      return g;
    });

    // recruits
    for (const r of RECRUITS) {
      const n = this.spawnNPC({ name: r.name, female: false, role: 'recruit', x: r.spot[0], z: r.spot[1], state: 'static', hp: r.hp, dmg: r.dmg, look: r.look, homePt: { x: r.spot[0], z: r.spot[1] } });
      n.data.recruit = r;
      n.data.face = rand(0, 6.28);
      n.data.quiet = true;
      this.named[r.id] = n;
    }

    // Rocket Ron runs the cart races out of the clubhouse lot
    this.named.ron = this.spawnNPC({ name: '"Rocket" Ron Delvecchio', female: false, role: 'raceboss', x: -6, z: 47, state: 'static', hp: 70, look: { hat: 'cap', hatColor: '#ff6b1a', shirt: 7, glasses: 'aviator', mustache: true, skin: '#e0ac8a', hair: '#1c1c1c', belly: 1.1 }, homePt: { x: -6, z: 47 } });
    this.named.ron.data.face = Math.PI;
    this.named.ron.data.quiet = true;
    this.addCart({ x: -2.5, z: 44, ry: Math.PI, kind: 'resident', color: '#ff6b1a', upgrades: { governor: true, rims: true, neon: true, flag: true } });

    // golfers at tees
    for (const i of [0, 2, 3, 5]) {
      const h = HOLES[i];
      const face = Math.atan2(h.green[0] - h.tee[0], h.green[1] - h.tee[1]);
      const n = this.spawnNPC({ female: chance(0.3), role: 'golfer', x: h.tee[0] + 1, z: h.tee[1], state: 'golf', weapon: 'driver', look: { hat: 'visor', shirt: randInt(0, 7) }, homePt: { x: h.tee[0] + 1, z: h.tee[1] } });
      n.data.face = face;
      n.data.hole = h;
      n.data.quiet = true;
      this.addCart({ x: h.tee[0] - 4, z: h.tee[1] + 2, ry: face, kind: 'club' });
    }

    // traffic
    const starts = ['C2', 'C4', 'S3', 'P2', 'P5', 'C6', 'S5'];
    for (const id of starts) {
      const nd = NODES[id];
      const c = this.addCart({ x: nd.x + 2, z: nd.z + 2, ry: rand(0, 6), kind: 'resident' });
      const d = this.spawnNPC({ role: 'driver', female: chance(0.4), x: nd.x, z: nd.z });
      d.seatIn(c, new Driver(c, 'cruise', { speed: rand(5, 7) }));
      d.data.wants = null;
    }
    // security
    this.spawnSecurity('Officer Dale Pruitt', 262, 56, true);

    // beverage carts
    CONCESSION.forEach((def, i) => {
      const loop = COURSE_LOOPS[def.loop];
      const start = NODES[loop[0]];
      const c = this.addCart({ x: start.x, z: start.z, kind: 'concession', color: '#ffffff', canopy: def.canopy });
      let op;
      if (def.operator === 'tammy') {
        const l = LADIES.find((x) => x.id === 'tammy');
        op = this.spawnNPC({ name: 'Tammy', female: true, role: 'lady', x: start.x, z: start.z, look: l.look });
        op.data.lady = l;
        this.named.tammy = op;
      } else {
        op = this.spawnNPC({ name: def.operator, female: def.operator.startsWith('Dolores'), role: 'operator', x: start.x, z: start.z, look: { hat: 'visor', hatColor: '#ffffff' } });
      }
      op.data.quiet = true;
      const drv = new Driver(c, 'loop', { speed: 5, loop });
      op.seatIn(c, drv);
      op.data.operatorOf = def.id;
      this.concession.push({ def, cart: c, operator: op, driver: drv, get state() { return this._g.state.empire.carts[def.id]; }, _g: this });
    });
  }

  spawnSecurity(name, x, z, primary = false) {
    const c = this.addCart({ x, z, ry: -Math.PI / 2, kind: 'security', color: '#ffffff' });
    const n = this.spawnNPC({ name, female: false, role: 'security', x, z, hp: 70, dmg: 8, look: { hat: 'security', shirt: 2, shorts: '#1d2b53', badge: true, glasses: 'aviator', mustache: true, belly: 1.45 } });
    n.data.quiet = true;
    n.seatIn(c, new Driver(c, 'loop', { speed: 6.5, loop: PATROL_LOOP }));
    n.data.primary = primary;
    if (primary) this.named.dale = n;
    return n;
  }

  assignWants(n) {
    if (n.role !== 'resident') return;
    const r = Math.random();
    n.data.wants = n.female ? (r < 0.22 ? 'tea' : null) : r < 0.42 ? 'pills' : r < 0.52 ? 'tea' : null;
  }

  // ================================================================ start / save
  start(state, isNew) {
    this.state = state;
    const ph = PLAYER_HOUSE;
    this.playerCart.upgrades = { ...state.cart.upgrades };
    this.playerCart.setPaint(state.cart.color);
    this.playerCart.rebuild();
    const sp = state.pos || { x: ph.frontPos.x, z: ph.frontPos.z, h: ph.facing };
    const p = this.player;
    p.x = sp.x; p.z = sp.z; p.heading = sp.h ?? 0; p.y = heightAt(sp.x, sp.z);
    if (state.cartPos) {
      Object.assign(this.playerCart, { x: state.cartPos.x, z: state.cartPos.z, heading: state.cartPos.h, y: heightAt(state.cartPos.x, state.cartPos.z) });
      this.playerCart.syncMesh(0);
    }
    this.player.setLook(state.look);
    this.player.hp = this.maxHp();
    this.player.char.setHeld(state.weapon === 'fists' ? null : state.weapon);
    this.heat.value = state.heat || 0;
    // restore empire / gang
    for (const id of state.empire.gang) {
      const n = this.named[id];
      if (n) this.recruit(n, true);
    }
    this.spawnDrones();
    this.seedTreasure();
    const qid = this.quests.current()?.id;
    if (qid === 'c2_tooth') spawnTooth(this);
    if (state.quest.flags.beatChip) {
      // Chip keeps his distance now
      this.named.chip.data.retreatAfterKO = true;
    }
    this.world.homeSign.material.map = null;
    this.updateHomeSign();
    this.running = true;
    this.camRig.yaw = this.player.heading + Math.PI;
    this.camRig.target.set(this.player.x, this.player.y + 1.5, this.player.z);
    if (isNew) this.storm = { start: 14, dur: 1.3, warned: false };
    else this.rollWeather();
    if (isNew) {
      this.camRig.introDur = this.camRig.introT = 4.5;
      this.ui.splash('SUNSET PALMS', 'Day 1. Try to behave. (You won\'t.)', 3.5);
    }
    this.quests.begin();
    this.worldEvents = new Events(this);
    this.life = new Life(this);
    this.yesterday = { ...state.counters };
    if (isNew) {
      this.ui.toast(`Welcome to Sunset Palms, ${state.name}.`, 'quest', 6);
      setTimeout(() => this.ui.toast('📋 HOA Notice: Your cart is parked on GRASS. That\'s a warning. — K.W.', 'heat', 7), 3500);
    }
  }

  updateHomeSign() {
    import('../gfx/textures.js').then(({ makeSignTexture }) => {
      const t = makeSignTexture(`${this.state.name.toUpperCase()}'S PLACE`, { bg: '#1f6f78', fg: '#fff', border: '#f2c94c', font: 'bold 60px Georgia, serif', w: 512, h: 128 });
      this.world.homeSign.material.map = t;
      this.world.homeSign.material.emissiveMap = t;
      this.world.homeSign.material.needsUpdate = true;
    });
  }

  save() {
    const s = this.state;
    s.heat = this.heat.value;
    s.pos = { x: this.player.x, z: this.player.z, h: this.player.heading };
    const c = this.playerCart;
    s.cartPos = { x: c.x, z: c.z, h: c.heading };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
      this.ui.toast('💾 Game saved', '', 2.5);
    } catch (e) { /* storage may be unavailable */ }
  }

  static loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const d = defaultState(s.name);
      // merge to survive new fields
      const merge = (a, b) => {
        for (const k of Object.keys(a)) {
          if (b[k] === undefined) continue;
          if (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && b[k] && typeof b[k] === 'object') merge(a[k], b[k]);
          else a[k] = b[k];
        }
        for (const k of Object.keys(b)) if (a[k] === undefined) a[k] = b[k];
        return a;
      };
      return merge(d, s);
    } catch (e) {
      return null;
    }
  }

  // ================================================================ stats & money
  xpNeed(lvl) { return 3 + lvl * 2; }

  xp(k, n) {
    const s = this.state.stats[k];
    if (s.lvl >= 10) return;
    s.xp += n;
    while (s.lvl < 10 && s.xp >= this.xpNeed(s.lvl)) {
      s.xp -= this.xpNeed(s.lvl);
      s.lvl++;
      const nm = { str: 'STRENGTH', cha: 'CHARISMA', intim: 'INTIMIDATION', stat: 'STATUS' }[k];
      this.ui.toast(`⬆️ <b>${nm} UP!</b> Now ${s.lvl}`, 'ach', 5);
      audio.play('levelup');
      if (k === 'str') this.player.hp = this.maxHp();
    }
  }

  statBase(k) { return this.state.stats[k].lvl; }

  stat(k) {
    let v = this.state.stats[k].lvl;
    const b = this.state.buzz;
    const buffs = this.state.buffs;
    if (k === 'cha') {
      if (b >= 10 && b < 35) v += 1;
      else if (b >= 35 && b < 75) v += 2;
      else if (b >= 75) v -= 1;
      if (buffs.colada > 0) v += 1;
    }
    if (k === 'str') {
      if (b >= 40) v += 1;
      if (buffs.rhino > 0) v += 2;
    }
    if (k === 'intim' && buffs.rhino > 0) v += 2;
    if (k === 'stat' && this.state.hoa.decrees.includes('flamingo')) v += 1;
    return clamp(v, 1, 12);
  }

  flirtBonus() {
    return (this.state.buffs.blue > 0 ? 1.5 : 0);
  }

  chance(k, diff) {
    return clamp(0.5 + (this.stat(k) - diff) * 0.13, 0.05, 0.96);
  }

  roll(k, diff) {
    const ok = Math.random() < this.chance(k, diff);
    this.xp(k, ok ? 1 : 0);
    if (!ok && Math.random() < 0.5) this.xp(k, 1); // learning from failure. Some.
    return ok;
  }

  maxHp() { return 60 + this.stat('str') * 12; }

  buzz01() { return clamp(this.state.buzz / 100, 0, 1); }

  toast(text, kind = '', dur) { this.ui.toast(text, kind, dur); }

  ballCap() { return this.state.ballCap; }

  weaponDef() { return WEAPONS[this.state.weapon] || WEAPONS.fists; }

  cartModCount() { return Object.keys(this.state.cart.upgrades).filter((k) => this.state.cart.upgrades[k]).length; }

  absMinutes() { return this.state.day * 1440 + this.state.minutes; }

  addMoney(n, why = '') {
    this.state.money += n;
    if (n > 0) this.state.counters.earned += n;
    audio.play('cash');
    const p = this.player;
    if (p) this.ui.float(p.x, p.y + 2.4, p.z, `${n >= 0 ? '+' : ''}${money(n)}`, n >= 0 ? '#7CFC9A' : '#ff7a7a');
    if (why && Math.abs(n) >= 20) this.ui.toast(`💰 ${n >= 0 ? '+' : ''}${money(n)} — ${why}`, 'money', 3);
  }

  spend(n) {
    this.state.money -= n;
    if (this.player) this.ui.float(this.player.x, this.player.y + 2.4, this.player.z, `-${money(n)}`, '#ff7a7a');
  }

  giveWeapon(w) {
    if (!this.state.weapons.includes(w)) this.state.weapons.push(w);
    this.state.weapon = w;
    this.player.char.setHeld(w === 'fists' ? null : w);
    this.ui.toast(`${WEAPONS[w].icon} Equipped: ${WEAPONS[w].name}`, 'quest');
  }

  romance(id, d) {
    const r = this.state.romance[id];
    r.aff = clamp(r.aff + d, 0, 100);
  }

  unlockPerk(perkId, def) {
    this.state.perks[perkId] = true;
    this.ui.toast(`💞 PERK UNLOCKED: ${def.perk}`, 'love', 8);
    this.achievement('conquest');
    if (perkId === 'titanium') this.giveWeapon('titanium');
    if (perkId === 'legend') {
      this.celebrate(20);
      this.achievement('tammy');
      this.xp('stat', 12);
    }
    if (perkId === 'dirt') {
      this.state.hoa.dirt = true;
      this.ui.toast('📁 Linda spilled everything: you have DIRT ON KAREN.', 'quest', 6);
    }
  }

  achievement(id) {
    if (this.state.achievements.includes(id)) return;
    this.state.achievements.push(id);
    const a = ACH[id];
    this.ui.toast(`🏆 <b>${a[0]}</b><br><small>${a[1]}</small>`, 'ach', 6);
    audio.play('success');
  }

  // ================================================================ heat / crime
  witness(x, z, radius, strict = false) {
    for (const n of this.npcs) {
      if (n.state === 'ko' || n.role === 'gang' || n.role === 'driver') continue;
      const d = Math.hypot(n.x - x, n.z - z);
      let r = 0;
      if (n.role === 'security') r = radius * 1.8;
      else if (n.role === 'karen') r = radius * 1.4;
      else if (n.data.snitch) r = radius;
      else if (!strict && n.role !== 'shopkeeper') r = radius * 0.6;
      if (d < r && !this.world.col.blocked(n.x, n.z, x, z)) return n;
    }
    return null;
  }

  crime(x, z, amount, reason, radius = 18, strict = false) {
    const w = this.witness(x, z, radius, strict);
    if (!w) return false;
    this.addHeat(amount, reason);
    if (w.role !== 'security' && chance(0.7)) w.say(pick(["I SAW THAT! I'm calling Security!", "Karen's gonna hear about this!", 'DALE! DAAAALE!', "That's going in the newsletter!"]), 2.5);
    return true;
  }

  addHeat(n, reason) {
    if (this.state.hoa.decrees.includes('budget')) n *= 0.7;
    const before = this.heat.level;
    this.heat.value = clamp(this.heat.value + n, 0, 5.5);
    const now = performance.now();
    if (!this._lastToast[reason] || now - this._lastToast[reason] > 6000) {
      this._lastToast[reason] = now;
      this.ui.toast(`📋 HOA VIOLATION: ${reason}`, 'heat', 3.5);
    }
    if (this.heat.level > before) {
      audio.play('siren');
      if (!this.state.flags.heatHint) {
        this.state.flags.heatHint = true;
        this.ui.hint('🚨 HOA Security is after you! Break line of sight to cool off — or pay your fines at the HOA Office.', 7);
      }
      if (this.heat.level >= 3 && !this.named.deputy) {
        this.named.deputy = this.spawnSecurity('Deputy Earl', 270, 64);
        this.ui.toast('🚨 Dale called for backup: Deputy Earl is on patrol', 'heat', 4);
      }
    }
    this.heatCooldown = 8;
  }

  fineAmount() {
    return Math.max(50, Math.round(this.heat.value * 90));
  }

  updateHeat(dt) {
    const p = this.player;
    this.heatCooldown = Math.max(0, (this.heatCooldown || 0) - dt);
    let seen = false;
    for (const n of this.npcs) {
      if (n.role !== 'security' || n.state === 'ko') continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < 55 && !this.world.col.blocked(n.x, n.z, p.x, p.z)) seen = true;
      // busted?
      if (this.heat.level > 0 && d < 2.6 && (!p.cart || p.cart.speed < 3) && !p.ko) {
        this.bustT = (this.bustT || 0) + dt;
        if (this.bustT > 1.4) { this.bustT = 0; this.busted(n); return; }
      }
      // drunk / reckless driving in front of security
      if (p.cart && d < 30 && !this.world.col.blocked(n.x, n.z, p.x, p.z)) {
        if (this.state.buzz > 50 && p.cart.speed > 5) this.addHeat(dt * 0.12, 'Driving under the influence (of Geezer Light)');
        if (p.cart.speed > 12.5) this.addHeat(dt * 0.15, 'Exceeding 12 MPH');
      }
    }
    if (!seen || this.heat.level === 0) this.bustT = 0;
    if (this.heatCooldown <= 0) {
      let rate = seen ? 0.008 : 0.045;
      if (this.state.perks.heatcool) rate *= 1.3;
      if (this.state.hoa.decrees.includes('noise')) rate *= 2;
      this.heat.value = Math.max(0, this.heat.value - rate * dt);
    }
    if (this.heat.level === 0 && this.named.deputy && Math.hypot(this.named.deputy.x - p.x, this.named.deputy.z - p.z) > 80) {
      const d = this.named.deputy;
      const c = d.cart || d.parkedCart;
      this.removeNPC(d);
      if (c && c.driver !== p) { this.scene.remove(c.group); this.carts = this.carts.filter((x) => x !== c); }
      this.named.deputy = null;
    }
    // security on foot returns to their cart once heat is gone
    for (const n of this.npcs) {
      if (n.role === 'security' && !n.cart && n.state !== 'ko' && n.parkedCart && (this.heat.level === 0 || p.cart)) {
        const c = n.parkedCart;
        const d = Math.hypot(c.x - n.x, c.z - n.z);
        if (d < 2.2 && !c.driver) {
          n.seatIn(c, new Driver(c, 'loop', { speed: 6.5, loop: PATROL_LOOP }));
          n.parkedCart = null;
        } else {
          n.state = 'walkTo';
          n.target = { x: c.x, z: c.z };
          n.data.after = 'chaseFoot';
        }
      }
    }
  }

  busted(officer) {
    const s = this.state;
    const fine = this.fineAmount() + 50;
    const conf = Math.floor(s.inv.pills / 2), confT = Math.floor(s.inv.tea / 2);
    s.counters.busted++;
    this.achievement('busted');
    audio.play('sadTrombone');
    const p = this.player;
    officer.say(pick(['You have the right to remain SILENT, sir!', 'Section 9, paragraph 2: NO FUN. You\'re coming with me.', "I've been waiting for this since I failed the police exam!"]), 3);
    this.fadeOut(() => {
      s.money -= fine;
      s.inv.pills -= conf;
      s.inv.tea -= confT;
      this.heat.value = 0;
      if (p.cart) p.exitCart();
      // impound the player's cart next to the HOA office
      const c = this.playerCart;
      if (!c.driver) { c.x = 248; c.z = 52; c.heading = 0; c.vx = c.vz = 0; c.sunk = false; c.y = heightAt(c.x, c.z); c.syncMesh(0); }
      this.teleport(236, 50, 0);
      this.advanceTime(60);
      for (const n of this.npcs) if (n.role === 'security' && !n.cart && n.parkedCart) { n.state = 'walkTo'; n.target = { x: n.parkedCart.x, z: n.parkedCart.z }; n.data.after = 'chaseFoot'; }
    }, 3.2, 'BUSTED', `Officer Dale wrote you up. Fine: ${money(fine)}${conf || confT ? `. Confiscated: ${conf} Blue Boys, ${confT} Rhino Tea` : ''}. Your cart was impounded outside the HOA office.`, '#ff6b6b');
  }

  // ================================================================ time
  advanceTime(mins) {
    let left = mins;
    while (left > 0) {
      const step = Math.min(left, 60 - (this.state.minutes % 60) || 60);
      this.tickMinutes(step);
      left -= step;
    }
  }

  tickMinutes(m) {
    const s = this.state;
    const before = s.minutes;
    s.minutes += m;
    if (Math.floor(s.minutes / 60) !== Math.floor(before / 60)) {
      if (s.minutes >= 1440) {
        s.minutes -= 1440;
        this.newDay();
      }
      this.hourly(Math.floor(s.minutes / 60));
    }
  }

  rollWeather() {
    this.storm = chance(0.4) ? { start: rand(13.5, 16.5), dur: rand(0.8, 1.8), warned: false } : null;
  }

  // returns lightning flash (0..1)
  updateWeather(dt) {
    const h = this.state.minutes / 60;
    const s = this.storm;
    const on = !!s && h >= s.start && h < s.start + s.dur;
    this.weather.target = on ? 1 : 0;
    if (on && !s.warned && this.running) {
      s.warned = true;
      this.ui.toast('⛈️ Afternoon thunderstorm! Roads are slick and the ladies are worried about their perms.', 'quest', 5);
    }
    const flash = this.weather.update(dt, this.camera, () => audio.thunder(rand(0.3, 1.6)));
    audio.setRain(this.weather.intensity);
    // wet, shiny roads
    const k = this.weather.intensity;
    this.world.roadMat.roughness = 0.92 - k * 0.6;
    this.world.roadMat.metalness = k * 0.25;
    this.world.roadMat.color.setScalar(1 - k * 0.35);
    this.world.pathMat.roughness = 0.9 - k * 0.55;
    return flash;
  }

  newDay() {
    this.rollWeather();
    this.seedTreasure();
    const s = this.state;
    s.day++;
    s.dow = (s.dow + 1) % 7;
    s.counters.beersToday = 0;
    for (const n of this.npcs) {
      this.assignWants(n);
      n.data.chatted = false;
    }
    if (s.dow === 0) s.hoa.campaigned = {};
  }

  hourly(h) {
    const s = this.state;
    // pension & dues
    if (h === 9 && s.dow === 0) {
      this.addMoney(450, 'Weekly pension check');
      this.ui.toast('📬 Pension deposited: $450. Try not to drink it all. (You will.)', 'money', 6);
    }
    if (h === 9 && s.dow === 6) {
      this.spend(120);
      this.ui.toast('🏛️ HOA dues auto-deducted: -$120. Karen thanks you for your compliance.', 'heat', 6);
    }
    if (h === 9) {
      if (s.hoa.decrees.includes('bingo')) this.addMoney(80, 'Bingo Levy');
      if (s.hoa.decrees.includes('flamingo')) this.addMoney(40, 'Flamingo Ordinance');
    }
    if (h === 19 && s.dow === 6 && s.hoa.registered && !s.hoa.president) this.pendingElection = true;
    // beverage carts sell during course hours
    if (h >= 7 && h <= 19) {
      for (const c of this.concession) {
        const st = c.state;
        if (!st.owned) continue;
        let made = 0;
        const np = Math.min(st.stock.pills, randInt(1, 3));
        const nt = Math.min(st.stock.tea, chance(0.5) ? 1 : 0);
        st.stock.pills -= np;
        st.stock.tea -= nt;
        made = Math.round((np * 25 + nt * 140) * st.cut * (s.perks.legend ? 1.15 : 1));
        if (made > 0) {
          st.earned += made;
          this.state.money += made;
          this.state.counters.earned += made;
          this.ui.toast(`🛺 ${c.def.name.split('—')[0].trim()}: +${money(made)}`, 'money', 3);
        } else if (chance(0.35)) this.ui.toast(`🛺 ${c.def.name.split('—')[0].trim()} is OUT OF STOCK. Customers are getting cranky.`, '', 3.5);
      }
    }
    if (s.droneBank > 0) {
      this.addMoney(s.droneBank, 'Drone ball deliveries');
      s.droneBank = 0;
    }
    // refresh a few customers
    for (const n of this.npcs) if (n.role === 'resident' && !n.data.wants && chance(0.15)) this.assignWants(n);
    // rival sabotage
    this.maybeRivalEvent(h);
  }

  sleep() {
    if (this.party) this.party.end();
    this.fadeOut(() => {
      const s = this.state;
      const toMorning = ((24 * 60 - s.minutes) + 7 * 60) % 1440 || 1440;
      this.advanceTime(toMorning);
      this.player.hp = this.maxHp();
      s.buzz = 0;
      s.bladder = 40;
      this.heat.value = Math.max(0, this.heat.value - 2);
      this.save();
    }, 2.4, '☀️ GOOD MORNING', null);
    this.after(3.6, () => showGazette(this));
  }

  election() {
    const s = this.state;
    const pr = this.hoaProjection();
    const you = pr.you + randInt(-4, 4), karen = pr.karen + randInt(-4, 4);
    if (you > karen) {
      s.hoa.president = true;
      this.xp('stat', 8);
      this.achievement('president');
      this.celebrate(18, 15, 0);
      this.ui.openDialogue({ name: 'ELECTION RESULTS', title: 'Sunset Palms Clubhouse', text: `${s.name}: ${you} votes\nKaren Whitmore: ${karen} votes\n\nThe room erupts. Someone's oxygen tank falls over. Karen snaps her clipboard in half.\n\nYou are the new HOA PRESIDENT. Visit the HOA Office to issue decrees.`, choices: [{ text: '🎉 "Drinks are on Karen!"', action: () => null }] });
    } else {
      s.hoa.registered = false;
      s.hoa.votes = Math.floor(s.hoa.votes / 2);
      this.ui.openDialogue({ name: 'ELECTION RESULTS', title: 'Sunset Palms Clubhouse', text: `${s.name}: ${you} votes\nKaren Whitmore: ${karen} votes\n\nKaren wins. She thanks "the silent majority" while staring directly at you. Recount denied.\n\n(Re-register at the HOA office and campaign harder, or find some dirt on her...)`, choices: [{ text: '"This isn\'t over."', action: () => null }] });
    }
  }

  hoaProjection() {
    const s = this.state;
    const you = Math.round(s.hoa.votes + this.stat('cha') * 3 + this.stat('stat') * 3 + s.counters.conquests * 4 - this.stat('intim') - this.heat.level * 4);
    return { you: Math.max(0, you), karen: 42 };
  }

  // ================================================================ cutscene fades
  fadeOut(mid, hold = 2, title = '', sub = '', color = null) {
    this.cut = { t: 0, mid, hold, title, sub, color, fired: false };
  }

  updateCut(dt) {
    const c = this.cut;
    if (!c) return;
    c.t += dt;
    if (c.t < 0.6) this.fx.fade = c.t / 0.6;
    else if (!c.fired) {
      c.fired = true;
      this.fx.fade = 1;
      if (c.mid) c.mid();
      if (c.title) this.ui.splash(c.title, c.sub || '', c.hold + 0.8, c.color);
    } else if (c.t < 0.6 + c.hold) this.fx.fade = 1;
    else if (c.t < 1.4 + c.hold) this.fx.fade = 1 - (c.t - 0.6 - c.hold) / 0.8;
    else {
      this.fx.fade = 0;
      this.cut = null;
    }
  }

  teleport(x, z, h = 0) {
    const p = this.player;
    if (p.cart) p.exitCart();
    p.x = x; p.z = z; p.heading = h;
    p.y = heightAt(x, z);
    p.vx = p.vz = 0;
    this.camRig.target.set(x, p.y + 1.5, z);
    this.camRig.yaw = h + Math.PI;
  }

  // ================================================================ player actions
  damagePlayer(dmg, fx, fz, knock = 4) {
    const p = this.player;
    if (p.ko || this.cut) return;
    p.hp -= dmg * (this.state.buffs.rhino > 0 ? 0.6 : 1);
    this.fx.damage = 1;
    this.camRig.addShake(0.4);
    audio.play('oof', { pitch: 0.8 });
    if (!p.cart) {
      const dx = p.x - fx, dz = p.z - fz, d = Math.hypot(dx, dz) || 1;
      p.vx += (dx / d) * knock;
      p.vz += (dz / d) * knock;
      p.char.play('flinch', 0.4);
    }
    if (p.hp <= 0) this.naptime();
  }

  naptime() {
    const p = this.player;
    p.ko = true;
    p.hp = 0;
    audio.play('sadTrombone');
    this.fadeOut(() => {
      const lost = Math.max(0, Math.round(this.state.money * 0.15));
      this.state.money -= lost;
      this.teleport(PLAYER_HOUSE.frontPos.x, PLAYER_HOUSE.frontPos.z, PLAYER_HOUSE.facing);
      this.advanceTime(240);
      p.hp = this.maxHp();
      p.ko = false;
      for (const n of this.npcs) if (n.hostile || n.state === 'fight') n.resumeBase();
      this.ui.toast(`🩹 Someone "borrowed" ${money(lost)} from your wallet while you were out.`, 'heat', 5);
    }, 3, 'NAPTIME', 'A neighbor found you face-down in a hedge and dragged you home. Four hours passed.', '#ffb3c1');
  }

  blackout() {
    const s = this.state;
    const b = pick(BLACKOUTS);
    this.achievement('blackout');
    audio.play('sadTrombone');
    this.fadeOut(() => {
      const lost = Math.round(s.money * rand(0.05, 0.2));
      s.money -= lost;
      if (this.player.cart) this.player.exitCart();
      this.teleport(b.x, b.z, rand(0, 6));
      this.advanceTime(180);
      s.buzz = 25;
      s.bladder = 70;
      this.ui.toast(`🍺 You're down ${money(lost)} and have no memory of why.`, 'heat', 5);
    }, 3.6, 'BLACKOUT', b.note, '#c77dff');
  }

  drink() {
    const s = this.state;
    const p = this.player;
    if (s.inv.beer <= 0) { this.ui.hint('Out of beer! Liquor Barrel is on Palm Blvd.'); return; }
    if (p.char.action?.type === 'drink' || this.drinkT > 0) return;
    this.drinkT = 1.3;
    p.char.setHeld('beer');
    p.char.play('drink', 1.4);
    audio.play('drink');
  }

  finishDrink() {
    const s = this.state;
    const p = this.player;
    s.inv.beer--;
    s.buzz = Math.min(100, s.buzz + 19);
    s.bladder = Math.min(100, s.bladder + 13);
    p.hp = Math.min(this.maxHp(), p.hp + 4);
    s.counters.beers++;
    s.counters.beersToday++;
    this.achievement('firstBeer');
    if (s.counters.beersToday >= 6) this.achievement('sixpack');
    p.char.setHeld(s.weapon === 'fists' ? null : s.weapon);
    if (chance(0.5)) {
      setTimeout(() => {
        audio.play('burp');
        this.ui.bubble(p, pick(['*BRAAAAP*', '*buuuurp*', '*URRRP* ...pardon me.', '*BELCH* That\'s the stuff.']), 1.8);
      }, 350);
    }
    if (p.cart) this.ui.hint(pick(['Drinking and driving? In THIS economy?', 'Keep it under 12 MPH near Security...']), 2.5);
  }

  cycleWeapon(dir = 1, direct = null) {
    const owned = WEAPON_ORDER.filter((w) => this.state.weapons.includes(w));
    let w = direct;
    if (!w) {
      const i = owned.indexOf(this.state.weapon);
      w = owned[(i + dir + owned.length) % owned.length];
    }
    if (!owned.includes(w)) return;
    this.state.weapon = w;
    this.player.char.setHeld(w === 'fists' ? null : w);
    audio.play('click');
  }

  playerAttack() {
    const p = this.player;
    if (p.cart || p.ko || p.attackCd > 0 || this.drinkT > 0) return;
    const w = this.weaponDef();
    const speedMul = (this.state.buffs.rhino > 0 ? 0.75 : 1);
    p.attackCd = w.cd * speedMul;
    p.char.play(w.anim, w.dur * speedMul);
    p.swing = { t: 0, hitAt: w.dur * 0.5 * speedMul, done: false, w };
    audio.play('swing');
  }

  resolvePlayerSwing() {
    const p = this.player;
    const w = p.swing.w;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const str = this.stat('str');
    let hitAny = false;
    for (const n of this.npcs) {
      if (n.cart || n.role === 'gang') continue;
      const dx = n.x - p.x, dz = n.z - p.z, d = Math.hypot(dx, dz);
      if (d > w.range + 0.3 || d < 0.01) continue;
      const ang = Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1));
      if (ang > w.arc / 2 + 0.2) continue;
      const wasHostile = n.hostile;
      const dmg = Math.round(w.dmg + str * 1.6 + (this.state.buffs.rhino > 0 ? 6 : 0));
      const knock = w.knock * (1 + str * 0.05);
      const koBefore = n.state === 'ko';
      n.takeHit(dmg, p.x, p.z, knock, p);
      if (!koBefore) {
        this.ui.float(n.x, 2.2, n.z, `-${dmg}`, '#ffd23f', 0.9);
        if (!wasHostile && !['rival', 'goon', 'husband', 'streaker'].includes(n.role)) this.crime(p.x, p.z, n.role === 'security' ? 1.5 : 0.7, n.role === 'security' ? 'Assaulting an HOA officer' : 'Assault with a golf implement', 22);
      }
      hitAny = true;
    }
    // props (mailbox baseball)
    for (const pr of this.props.near(p.x, p.z)) {
      if (pr.state !== 'idle') continue;
      const dx = pr.x - p.x, dz = pr.z - p.z, d = Math.hypot(dx, dz);
      if (d > w.range + 0.4) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.3) continue;
      this.knockProp(pr, fx * (6 + w.knock), fz * (6 + w.knock), 5 + w.knock * 0.4, true);
      hitAny = true;
    }
    if (hitAny) {
      audio.play(w.anim === 'punch' ? 'hit' : 'bonk');
      this.camRig.addShake(w.knock > 12 ? 0.35 : 0.15);
      if (w.knock > 12) this.slowmo = 0.35;
      this.xp('str', 0.25);
    }
  }

  pocketSand() {
    const p = this.player;
    if (this.state.weapon !== 'wedge' || p.specialCd > 0 || p.cart) return;
    p.specialCd = 6;
    p.char.play('sand', 0.5);
    audio.play('pocketSand');
    this.ui.bubble(p, 'POCKET SAND!', 1.5);
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    for (let i = 0; i < 30; i++) this.particles.emit('sand', p.x + fx * 0.6, p.y + 1.4, p.z + fz * 0.6, { vx: fx * rand(4, 9) + rand(-2, 2), vy: rand(0.5, 3), vz: fz * rand(4, 9) + rand(-2, 2), gravity: 6, life: 0.8, size: 0.2 });
    for (const n of this.npcs) {
      const dx = n.x - p.x, dz = n.z - p.z, d = Math.hypot(dx, dz);
      if (d < 5 && (dx * fx + dz * fz) / (d || 1) > 0.5 && n.state !== 'ko') {
        n.blind = 4;
        n.windup = 0;
        n.say(pick(['MY EYES!', 'Not the sand!', 'AAAGH, IT\'S IN MY DENTURES!']), 2);
      }
    }
  }

  horn() {
    const c = this.player.cart;
    if (!c || this._hornT > 0) return;
    this._hornT = c.upgrades.horn ? 1.8 : 0.4;
    if (c.kind === 'security') {
      c.sirenOn = !c.sirenOn;
      audio.play('siren');
      if (c.sirenOn) for (const n of this.npcs) if (!n.cart && n.state === 'wander' && Math.hypot(n.x - c.x, n.z - c.z) < 25) { n.state = 'flee'; n.fleeFrom = this.player; n.fleeT = 3; }
      return;
    }
    audio.play(c.upgrades.horn ? 'cucaracha' : 'horn');
    for (const n of this.npcs) {
      if (n.cart || n.state !== 'wander') continue;
      if (Math.hypot(n.x - c.x, n.z - c.z) < 12) {
        n.char.play('flinch', 0.5);
        if (chance(0.4)) n.say(pick(['Jesus, Mary and Joseph!', 'My HEART!', 'Some of us are napping!', 'Is that... La Cucaracha?']), 2);
      }
    }
  }

  pee(dt, holding) {
    const s = this.state;
    const p = this.player;
    const want = holding && s.bladder > 1 && !p.cart;
    if (want && !p.peeing) {
      p.peeing = true;
      this._peeWitnessed = false;
      s.counters.pees++;
      this.ui.bubble(p, pick(['Ahhhhh...', 'Sweet relief.', '*whistles innocently*']), 2);
    }
    if (!want && p.peeing) p.peeing = false;
    if (p.peeing) {
      s.bladder = Math.max(0, s.bladder - dt * 28);
      p.char.play('pee', 0.2);
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      for (let i = 0; i < 3; i++) this.particles.emit('pee', p.x + fx * 0.3, p.y + 0.8, p.z + fz * 0.3, { vx: fx * 2.2 + rand(-0.2, 0.2), vy: 1.2, vz: fz * 2.2 + rand(-0.2, 0.2), gravity: 9, life: 0.6, size: 0.12 });
      if (!this._peeWitnessed) {
        this._peeWitnessed = true;
        this.crime(p.x, p.z, 0.5, 'Public urination', 16);
      }
      if (waterAt(p.x, p.z) === 'pool') {
        this.achievement('pool');
        for (const n of this.npcs) if (n.role !== 'shopkeeper' && Math.hypot(n.x - POOL.x0 - 12, n.z - POOL.z0 - 6) < 22 && n.state === 'wander' && !n._poolFled) {
          n._poolFled = true;
          n.state = 'flee'; n.fleeFrom = p; n.fleeT = 5;
          n.say(pick(['CODE YELLOW! CODE YELLOW!', 'Is the water getting WARMER?', 'EVERYBODY OUT!']), 2.5);
        }
      }
      if (s.bladder <= 0) p.peeing = false;
    }
    if (s.bladder >= 100 && !p.peeing) {
      s.bladder = 0;
      this.ui.splash('WHOOPS', 'You waited too long. The Depends were at home.', 2.5, '#ffe066');
      this.crime(p.x, p.z, 0.3, 'Public indignity', 12);
      audio.play('sadTrombone');
    }
  }

  // ================================================================ interactions
  findInteraction() {
    const p = this.player;
    if (p.ko || this.cut) return null;
    if (p.cart) return { label: 'Get out', action: () => { p.exitCart(); audio.play('click'); } };
    let best = null, bd = Infinity;
    const consider = (d, c) => { if (d < bd) { bd = d; best = c; } };
    for (const c of this.carts) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 2.6) continue;
      if (c.sunk) continue;
      const drv = c.driver;
      if (drv && drv !== p) {
        if (drv.role === 'lady' || drv.role === 'operator') continue; // talk instead
        if (drv.role === 'security' || drv.role === 'racer') continue;
        consider(d + 0.3, { label: `Yank ${drv.name.split(' ')[0]} out of the cart`, cls: 'bad', action: () => this.carjack(c) });
      } else {
        const own = c === this.playerCart;
        consider(d + 0.2, { label: own ? 'Drive your cart' : `Borrow ${c.kind === 'club' ? 'a club' : "somebody's"} cart`, action: () => this.enterCart(c) });
      }
    }
    for (const n of this.npcs) {
      if (!n.talkable) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      const reach = n.cart ? 4.5 : 2.6;
      if (d > reach) continue;
      if (n.state === 'ko') {
        if (!n.data.looted) consider(d, { label: `Check ${n.name.split(' ')[0]}'s pulse (and wallet)`, action: () => this.loot(n) });
        continue;
      }
      if (n.hostile || n.state === 'flee') continue;
      if (n.cart && n.role !== 'lady' && n.role !== 'operator') continue;
      consider(d - 0.4, { label: `Talk to ${n.name}`, action: () => this.talk(n) });
    }
    if (this.detector && this.detector.strength > 0.9) consider(0.5, { label: '🔍 Dig here!', action: () => this.dig() });
    for (const poi of Object.values(this.world.pois)) {
      const d = Math.hypot(poi.x - p.x, poi.z - p.z);
      if (d < poi.r) consider(d + 0.1, { label: poi.label, action: () => this.visitPOI(poi) });
    }
    return best;
  }

  enterCart(c) {
    const p = this.player;
    if (c.kind === 'security') {
      this.addHeat(1.5, "Commandeering Dale's cart");
      this.ui.hint('You stole a Security cart. Press H for the siren. Dale is going to cry.', 5);
    } else if (c !== this.playerCart && c.kind !== 'club') this.crime(c.x, c.z, 0.5, 'Unauthorized cart usage', 16);
    p.enterCart(c);
    audio.play('click');
    if (c.sunk) c.sunk = false;
    this.announceRadio();
  }

  announceRadio() {
    const st = audio.stations[audio.station];
    this.ui.radio(st.freq ? `${st.freq} ${st.name}  [R] to change` : 'RADIO OFF  [R]');
  }

  carjack(c) {
    const drv = c.driver;
    drv.leaveCart();
    drv.vx = rand(-4, 4);
    drv.vz = rand(-4, 4);
    drv.vy = 4;
    drv.air = true;
    drv.say(pick(['HEY! I\'M DRIVING HERE!', 'HELP! CARJACKING!', 'That\'s MY CART, you hooligan!']), 2.5);
    this.player.enterCart(c);
    this.announceRadio();
    this.achievement('carjack');
    this.crime(c.x, c.z, 1.1, 'Grand Theft Golf Cart', 25);
    audio.play('oof');
  }

  loot(n) {
    n.data.looted = true;
    const amt = n.role === 'rival' || n.role === 'goon' ? randInt(30, 80) : randInt(3, 25);
    this.addMoney(amt, 'rifled some pockets');
    const extra = chance(0.25) ? pick(['a half-eaten Werther\'s', 'a denture cup', 'a coupon for Metamucil', 'a photo of a cat named Dave']) : null;
    if (extra) this.ui.hint(`You also found ${extra}. You keep it.`, 3);
    if (chance(0.3) && n.role === 'resident' && !n.female) this.state.inv.pills += 1;
    this.crime(n.x, n.z, 0.5, 'Looting a napping senior', 15);
  }

  talk(n) {
    let node = null;
    n.talking = true;
    n.faceTo(this.player.x, this.player.z, 1, 100);
    if (n.role === 'lady') node = D.talkLady(this, n);
    else if (n.role === 'operator') node = D.talkOperator(this, n);
    else if (n.role === 'shopkeeper') {
      const r = D.visit(this, this.world.pois[n.data.poi]);
      if (r && r !== 'shop') node = r;
      else { n.talking = false; return; }
    } else if (n.role === 'karen') node = D.talkKaren(this, n);
    else if (n === this.named.deuce) node = this.state.quest.flags.beatDeuce ? { name: n.name, title: 'Humbled Patriarch', text: `"Go away. I'm calling my lawyer. And my other lawyer."`, choices: [] } : deuceConfront(this);
    else if (n.role === 'rival') node = D.talkChip(this, n);
    else if (n.role === 'golfer') node = D.talkGolfer(this, n);
    else if (n.role === 'recruit' || n.role === 'gang') node = D.talkRecruit(this, n);
    else if (n.role === 'security') node = this.talkSecurity(n);
    else if (n.role === 'raceboss') node = this.talkRon(n);
    else if (n.role === 'racer') node = { name: n.name, title: 'Racer', text: `"Not now, I'm in the zone."`, choices: [] };
    else if (n.role === 'goon') node = { name: n.name, title: "Chip's Crew", text: pick(['"Chip says you\'re \'nouveau riche.\' I don\'t know what that means but I\'m offended."', '"Do you have a tee time? No? Then beat it."']), choices: [] };
    else if (n.role === 'fisher') node = { name: n.name, title: 'Pier Fisherman', text: pick([`"Caught a grouper this big once. Wife left me the same day. Worth it."`, `"Shh. You'll scare the fish. And the fish are all I have left."`, `"Some maniac drove a golf cart off this pier last week. Beautiful arc, though."`]), choices: [] };
    else if (n.role === 'lifeguard') node = { name: n.name, title: 'Retired Lifeguard (1971-2004)', text: pick([`"Rip currents, jellyfish, and Rhonda. The three dangers of this beach."`, `"If you go past the buoys, I'm not coming in after you. My knees are shot."`, `"Treasure hunters dig all over this sand. Found a Rolex last Tuesday. Real one."`]), choices: [] };
    else if (n.role === 'husband') node = { name: n.name, title: 'Resident', text: '"You lookin\' at my wife? Everybody looks at my wife. Don\'t look at my wife."', choices: [] };
    else node = D.talkResident(this, n);
    if (node) {
      const prev = node.onClose;
      node.onClose = () => { n.talking = false; if (prev) prev(); };
      this.ui.openDialogue(node);
    } else n.talking = false;
  }

  talkSecurity(n) {
    const lvl = this.heat.level;
    return {
      name: n.name, title: 'HOA Security',
      text: lvl > 0 ? '"You\'re in a LOT of trouble, sir. A LOT. I\'ve got a notepad and I\'m not afraid to use it."' : pick(['"Keep it under twelve, citizen."', '"I\'m basically a cop. Legally I\'m not. But spiritually."', '"Move along. Nothing to see. Unless you saw something. Did you see something?"']),
      choices: [
        ...(lvl > 0 ? [{ text: '"Here\'s a hundred bucks. Buy yourself a real badge."', check: { label: 'CHA', chance: this.chance('cha', 3 + lvl) }, disabled: this.state.money < 100, action: () => {
          this.spend(100);
          if (this.roll('cha', 3 + lvl)) { this.heat.value = Math.max(0, this.heat.value - 2.5); return { name: n.name, text: '"...I didn\'t see anything. Have a blessed day."', choices: [] }; }
          this.addHeat(1, 'Attempted bribery of an HOA officer');
          return { name: n.name, text: '"BRIBERY? That\'s a Section 14! I\'m keeping the hundred as evidence!"', choices: [] };
        } }] : []),
        { text: 'Leave', action: () => null },
      ],
    };
  }

  visitPOI(poi) {
    const r = D.visit(this, poi);
    if (r && r !== 'shop') this.ui.openDialogue(r);
  }

  // ================================================================ combat events
  npcHits(npc, target) {
    const dmg = npc.dmg * (npc.weapon ? 1.4 : 1);
    audio.play(npc.weapon ? 'bonk' : 'hit', { vol: 0.8 });
    if (target === this.player) this.damagePlayer(dmg, npc.x, npc.z, npc.data.boss ? 12 : npc.weapon ? 6 : 4);
    else target.takeHit(dmg, npc.x, npc.z, 4, npc);
  }

  nearestHostile(x, z, r, self) {
    let best = null, bd = r;
    for (const n of this.npcs) {
      if (n === self || !n.hostile || n.state === 'ko' || n.role === 'gang') continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  onKnockout(npc, attacker) {
    if (this.brawlGroup && this.brawlGroup.includes(npc)) {
      npc.data.brawlDown = true;
      npc.data.retreatAfterKO = true;
    }
    const s = this.state;
    if (attacker === this.player || (attacker && attacker.role === 'gang')) {
      s.counters.knockouts++;
      if (s.counters.knockouts >= 10) this.achievement('ko10');
      this.xp('intim', npc.role === 'resident' ? 0.5 : 1.5);
      this.xp('str', 0.5);
      const cash = npc.role === 'rival' ? 120 : npc.role === 'goon' ? randInt(20, 50) : npc.role === 'husband' ? 40 : randInt(0, 12);
      if (cash > 0) this.pickups.drop(npc.x, npc.z, cash);
      this.ui.float(npc.x, 2.5, npc.z, pick(['KO!', 'NAPTIME!', 'BONK!', 'DOWN GOES GRANDPA!']), '#ff9f1c', 1.5);
    }
    this.checkBrawls();
  }

  onSplashdown(npc) {
    audio.play('splash');
    this.particles.burst('drop', npc.x, npc.y + 0.5, npc.z, 30, { speed: 3, up: 6, life: 1.2, size: 0.25, gravity: 12 });
    this.ui.float(npc.x, 3, npc.z, 'HOLE IN ONE!', '#4cc9f0', 2);
    if (npc.state === 'ko') this.achievement('splash');
  }

  startBrawl(group, title, sub, onWin) {
    this.brawlGroup = group;
    this.brawlOnWin = onWin;
    for (const n of group) {
      n.data.brawlDown = false;
      n.data.retreatAfterKO = false;
      n.hostile = true;
      n.aggro = this.player;
      n.state = 'fight';
      n.hp = n.maxHp;
    }
    this.ui.splash(title, sub, 2, '#ff9f1c');
    audio.play('whistle');
  }

  chipBrawl(chip) {
    this.startBrawl([chip, ...this.chipGoons], 'BRAWL!', 'Chip & the Country Club Boys', () => {
      this.state.quest.flags.beatChip = true;
      this.named.chip.data.retreatAfterKO = true;
      for (const g of this.chipGoons) g.data.retreatAfterKO = true;
      setTimeout(() => this.named.chip.say('Father will hear about this!', 3), 1500);
    });
  }

  checkBrawls() {
    if (this.brawlGroup && this.brawlGroup.every((n) => n.state === 'ko' || n.data.brawlDown)) {
      const win = this.brawlOnWin;
      for (const n of this.brawlGroup) n.hostile = false;
      this.brawlGroup = null;
      this.brawlOnWin = null;
      this.ui.splash('VICTORY', 'Another bunch of blue-bloods, napping on the lawn.', 2.5);
      audio.play('success');
      if (win) win();
    }
    // rival sabotage events
    for (const ev of this.events) {
      if (!ev.done && ev.goons.every((n) => n.state === 'ko')) {
        ev.done = true;
        if (ev.kind === 'cart') ev.target.c.driver.stopT = 0;
        this.ui.toast('✅ Sabotage stopped! Chip\'s goons are napping.', 'quest', 4);
        this.xp('intim', 2);
        this.eventMarkers = this.eventMarkers.filter((m) => m !== ev.marker);
      }
    }
  }

  husbandEvent(def, lady) {
    const h = this.named[def.husband];
    if (!h) return;
    this.pendingHusband = { def, h, lady };
  }

  brawl(leader, n, label) {
    leader.hostile = true;
    leader.aggro = this.player;
    leader.state = 'fight';
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28);
      const b = this.spawnNPC({ female: false, role: 'goon', x: leader.x + Math.cos(a) * 10, z: leader.z + Math.sin(a) * 10, hp: 45, dmg: 7, weapon: chance(0.5) ? 'putter' : null, look: { hat: 'cap', shirt: randInt(0, 7) } });
      b.hostile = true;
      b.aggro = this.player;
      b.state = 'fight';
      b.data.temp = true;
    }
    this.ui.splash('BRAWL!', label, 1.8, '#ff9f1c');
  }

  rivalAmbush(x, z, n) {
    const goons = [];
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28);
      const g = this.spawnNPC({ female: false, role: 'goon', x: x + Math.cos(a) * 14, z: z + Math.sin(a) * 14, hp: 50, dmg: 7, weapon: pick(['putter', 'iron', null]), look: { hat: 'visor', hatColor: '#fff', shirt: pick([4, 6, 7]), sweater: pick(['#f7a1c4', '#8fd3ff', '#fbe7a1']), glasses: 'aviator' } });
      g.hostile = true;
      g.aggro = this.player;
      g.state = 'fight';
      g.data.temp = true;
      goons.push(g);
    }
    return goons;
  }

  maybeRivalEvent(h) {
    const s = this.state;
    if (!s.quest.flags.beatChip || s.hoa.decrees.includes('colors')) return;
    if (this.events.some((e) => !e.done)) return;
    if (h < 8 || h > 20 || !chance(0.22)) return;
    const owned = this.concession.filter((c) => c.state.owned);
    const targets = [...owned.map((c) => ({ kind: 'cart', c })), ...this.drones.map((d) => ({ kind: 'drone', d }))];
    if (!targets.length) return;
    const t = pick(targets);
    const pos = t.kind === 'cart' ? t.c.cart : t.d;
    // guards nearby deter or fight
    const goons = [];
    for (let i = 0; i < randInt(2, 3); i++) {
      const a = rand(0, 6.28);
      const g = this.spawnNPC({ female: false, role: 'goon', x: pos.x + Math.cos(a) * 6, z: pos.z + Math.sin(a) * 6, hp: 50, dmg: 7, weapon: pick(['putter', 'iron']), look: { hat: 'visor', hatColor: '#fff', shirt: pick([4, 6, 7]), sweater: pick(['#f7a1c4', '#8fd3ff', '#fbe7a1']), glasses: 'aviator' } });
      g.state = 'wander';
      g.zone = { x0: pos.x - 8, x1: pos.x + 8, z0: pos.z - 8, z1: pos.z + 8 };
      g.data.temp = true;
      g.data.saboteur = true;
      goons.push(g);
    }
    const ev = { t: 120, kind: t.kind, target: t, goons, done: false, marker: { x: pos.x, z: pos.z } };
    for (const g of goons) g.data.event = ev;
    if (t.kind === 'cart') t.c.driver.stopT = 9999;
    this.events.push(ev);
    this.eventMarkers.push(ev.marker);
    this.ui.toast(`🚨 <b>SABOTAGE!</b> Chip's goons are hitting your ${t.kind === 'cart' ? t.c.def.name.split('—')[0].trim() : 'ball drone'}! Get there in 2 hours.`, 'heat', 8);
    audio.play('siren');
  }

  updateEvents(dt) {
    const p = this.player;
    for (const ev of this.events) {
      if (ev.done) continue;
      ev.t -= dt * TIME_SCALE;
      // goons turn on the player (or guards) when approached
      for (const g of ev.goons) {
        if (g.state === 'wander' && (Math.hypot(g.x - p.x, g.z - p.z) < 18 || this.gang().some((m) => Math.hypot(m.x - g.x, m.z - g.z) < 16))) {
          g.hostile = true;
          g.aggro = p;
          g.state = 'fight';
          g.say(pick(["It's the vulgar little man!", 'Chip sends his regards!', 'Get him, Thurston!']), 2);
        }
      }
      if (ev.t <= 0) {
        ev.done = true;
        this.eventMarkers = this.eventMarkers.filter((m) => m !== ev.marker);
        if (ev.kind === 'cart') {
          const st = ev.target.c.state;
          st.owned = false;
          st.stock = { pills: 0, tea: 0 };
          this.state.counters.cartsTaken = Math.max(0, this.state.counters.cartsTaken - 1);
          this.ui.toast(`❌ Chip took back ${ev.target.c.def.name.split('—')[0].trim()}. Take it back!`, 'heat', 6);
        } else {
          const i = this.drones.indexOf(ev.target.d);
          if (i >= 0) { this.scene.remove(ev.target.d.mesh); this.drones.splice(i, 1); }
          this.state.drones = Math.max(0, this.state.drones - 1);
          this.spawnDrones();
          this.ui.toast('❌ Chip\'s goons smashed one of your drones.', 'heat', 6);
        }
        for (const g of ev.goons) { g.state = 'flee'; g.fleeT = 20; g.hostile = false; }
      }
      if (ev.done && ev.kind === 'cart') ev.target.c.driver.stopT = 0;
    }
    // clean up temp NPCs that are done and far away
    for (const n of [...this.npcs]) {
      if (n.data.event && !n.data.event.done) continue; // saboteurs stay until their raid resolves
      if (n.data.temp && (n.state === 'flee' || (n.state === 'ko' && n.koT < 1) || !n.hostile) && Math.hypot(n.x - p.x, n.z - p.z) > 70) this.removeNPC(n);
    }
    this.events = this.events.filter((e) => !e.done || e.goons.some((g) => this.npcs.includes(g)));
  }

  // ================================================================ empire
  takeCart(c, cut) {
    c.state.owned = true;
    c.state.cut = cut;
    this.state.counters.cartsTaken++;
    this.xp('stat', 2);
    this.ui.splash('CART ACQUIRED', `${c.def.name} now sells YOUR product.`, 2.5, '#7CFC9A');
    audio.play('success');
  }

  gang() {
    return this.npcs.filter((n) => n.role === 'gang');
  }

  recruit(n, silent = false) {
    n.role = 'gang';
    n.state = 'follow';
    n.baseState = 'follow';
    n.hostile = false;
    if (!this.state.empire.gang.includes(n.data.recruit.id)) this.state.empire.gang.push(n.data.recruit.id);
    if (!silent) {
      this.ui.toast(`🤝 ${n.name} joined your crew!`, 'quest', 4);
      this.xp('intim', 2);
      audio.play('success');
    }
  }

  setGangMode(n, mode) {
    if (mode === 'guard') {
      n.state = 'guard';
      n.baseState = 'guard';
      n.data.post = { x: n.x, z: n.z };
    } else {
      n.state = 'follow';
      n.baseState = 'follow';
    }
  }

  dismissGang(n) {
    n.role = 'recruit';
    n.state = 'returnHome';
    n.baseState = 'static';
    this.state.empire.gang = this.state.empire.gang.filter((id) => id !== n.data.recruit.id);
  }

  spawnDrones() {
    while (this.drones.length < this.state.drones) {
      const parts = [
        [GEO.box, '#222', mat4(0, 0, 0, 0, 0.5, 0.15, 0.5)],
        [GEO.box, '#e84a5f', mat4(0, 0.08, 0, 0, 0.3, 0.06, 0.3)],
        [GEO.box, '#444', mat4(0, 0, 0, Math.PI / 4, 1.3, 0.05, 0.08)],
        [GEO.box, '#444', mat4(0, 0, 0, -Math.PI / 4, 1.3, 0.05, 0.08)],
        [GEO.cyl, '#aaa', mat4(0, -0.2, 0, 0, 0.15, 0.2, 0.15)],
      ];
      const m = new THREE.Mesh(mergeParts(parts), M.vc);
      m.castShadow = true;
      const rotors = [];
      for (const [x, z] of [[0.46, 0.46], [-0.46, 0.46], [0.46, -0.46], [-0.46, -0.46]]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 12), new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.45 }));
        r.position.set(x, 0.06, z);
        m.add(r);
        rotors.push(r);
      }
      this.scene.add(m);
      const d = { mesh: m, x: -40 + rand(-10, 10), z: -60, y: 8, target: null, carry: 0, t: rand(0, 5), rotors };
      this.drones.push(d);
    }
    while (this.drones.length > this.state.drones) {
      const d = this.drones.pop();
      this.scene.remove(d.mesh);
    }
  }

  updateDrones(dt) {
    for (const d of this.drones) {
      d.t += dt;
      if (!d.target || !this.balls.list.includes(d.target)) {
        // nearest ball
        let best = null, bd = Infinity;
        for (const b of this.balls.list) {
          const dist = (b.x - d.x) ** 2 + (b.z - d.z) ** 2;
          if (dist < bd && !this.drones.some((o) => o !== d && o.target === b)) { bd = dist; best = b; }
        }
        d.target = best;
      }
      let ty = 7;
      if (d.target) {
        const dx = d.target.x - d.x, dz = d.target.z - d.z, dist = Math.hypot(dx, dz);
        if (dist > 0.6) {
          const sp = Math.min(7, dist * 2);
          d.x += (dx / dist) * sp * dt;
          d.z += (dz / dist) * sp * dt;
        }
        if (dist < 8) ty = d.target.y + 1.2;
        if (dist < 0.7 && d.y < d.target.y + 1.6) {
          const i = this.balls.list.indexOf(d.target);
          if (i >= 0) this.balls.removeAt(i);
          this.state.droneBank += 2;
          d.target = null;
          if (Math.hypot(d.x - this.player.x, d.z - this.player.z) < 30) audio.play('ball', { vol: 0.5 });
        }
      }
      d.y = damp(d.y, ty + Math.sin(d.t * 2) * 0.2, 2, dt);
      d.mesh.position.set(d.x, d.y, d.z);
      d.mesh.rotation.z = Math.sin(d.t * 1.3) * 0.08;
      for (const r of d.rotors) r.rotation.y += dt * 40;
    }
  }

  // Mr. Chompers patrols Gator Pond and bites anything that ends up in the water.
  updateGator(dt) {
    const gt = this.world.gator;
    if (!gt) return;
    gt.t += dt;
    gt.biteCd -= dt;
    const pond = gt.pond;
    let prey = null, bd = Infinity;
    const cands = [this.player, ...this.npcs];
    gt.rampage = Math.max(0, (gt.rampage || 0) - dt);
    for (const c of cands) {
      if (c !== this.player && c.cart) continue;
      const onLand = gt.rampage > 0 && c === this.player && Math.hypot(c.x - gt.x, c.z - gt.z) < 30;
      if (!onLand && waterAt(c.x, c.z) !== pond) continue;
      const d = Math.hypot(c.x - gt.x, c.z - gt.z);
      if (d < bd) { bd = d; prey = c; }
    }
    let tx, tz, speed;
    if (prey) {
      tx = prey.x; tz = prey.z; speed = 4.2;
      if (gt.mode !== 'hunt' && prey === this.player) this.ui.hint('🐊 Something is moving in the water...', 3);
      gt.mode = 'hunt';
    } else {
      const a = gt.t * 0.1;
      tx = pond.x + Math.cos(a) * pond.r * 0.45;
      tz = pond.z + Math.sin(a) * pond.r * 0.45;
      speed = 1.1;
      gt.mode = 'lurk';
    }
    const dx = tx - gt.x, dz = tz - gt.z, d = Math.hypot(dx, dz);
    gt.heading = dampAngle(gt.heading, Math.atan2(dx, dz), 3, dt);
    if (d > 1.6) {
      gt.x += Math.sin(gt.heading) * speed * dt;
      gt.z += Math.cos(gt.heading) * speed * dt;
    }
    const pd = Math.hypot(gt.x - pond.x, gt.z - pond.z), lim = pond.r * 0.85;
    if (pd > lim && !(gt.rampage > 0)) {
      if (pd > lim + 1.5) {
        // stranded on land after a rampage: waddle back to the water
        const a = Math.atan2(pond.x - gt.x, pond.z - gt.z);
        gt.heading = dampAngle(gt.heading, a, 4, dt);
        gt.x += Math.sin(gt.heading) * 3 * dt;
        gt.z += Math.cos(gt.heading) * 3 * dt;
      } else { gt.x = pond.x + ((gt.x - pond.x) / pd) * lim; gt.z = pond.z + ((gt.z - pond.z) / pd) * lim; }
    }
    const wet = waterAt(gt.x, gt.z) === pond;
    const y = wet ? WATER_Y - (gt.mode === 'hunt' ? 0.02 : 0.14) + Math.sin(gt.t * 1.4) * 0.03 : heightAt(gt.x, gt.z) + 0.2;
    gt.m.position.set(gt.x, y, gt.z);
    gt.m.rotation.y = gt.heading + Math.sin(gt.t * (gt.mode === 'hunt' ? 9 : 2)) * 0.07;
    if (prey && bd < 2.3 && gt.biteCd <= 0) {
      gt.biteCd = 1.5;
      audio.play('bonk');
      audio.play('splash', { vol: 0.6 });
      this.particles.burst('drop', prey.x, WATER_Y + 0.3, prey.z, 18, { speed: 2.5, up: 5, life: 1, size: 0.25, gravity: 12 });
      this.ui.float(prey.x, 2.2, prey.z, 'CHOMP!', '#7CFC9A', 1.2);
      if (prey === this.player) {
        this.damagePlayer(20, gt.x, gt.z, 7);
        this.achievement('gator');
      } else {
        if (!prey.takeHit(18, gt.x, gt.z, 7, null) && prey.state !== 'ko') {
          prey.state = 'flee';
          prey.fleeFrom = { x: gt.x, z: gt.z };
          prey.fleeT = 5;
        }
        prey.say(pick(['GATOR! GATOR!', 'MR. CHOMPERS, NO!', 'NOT AGAIN!']), 2);
      }
    }
  }

  // Launch a volley of fireworks around a point (defaults to over the Duck Pond / near the player).
  celebrate(n = 10, x = null, z = null) {
    const p = this.player;
    const cx = x ?? p.x, cz = z ?? p.z;
    for (let i = 0; i < n; i++) {
      this.after(i * rand(0.25, 0.55), () => {
        audio.listenerX = this.player.x;
        audio.listenerZ = this.player.z;
        audio.tone({ freq: 400, to: 1400, type: 'sine', dur: 0.6, vol: 0.03 });
        this.particles.firework(cx + rand(-30, 30), cz + rand(-30, 30) - 20, heightAt(cx, cz), audio);
      });
    }
  }

  after(seconds, fn) {
    (this.timers ||= []).push({ t: seconds, fn });
  }

  startParty() {
    if (this.party) return;
    this.spend(250);
    if (audio.station === 0) audio.setStation(1);
    this.party = new Party(this);
  }

  startMinigame(kind, opts = {}) {
    const Cls = kind === 'bingo' ? Bingo : kind === 'brew' ? Brew : ChugOff;
    if (opts.bet) this.spend(opts.bet);
    this.ui.modal = 'minigame';
    if (this.ui.onModalOpen) this.ui.onModalOpen();
    document.getElementById('minigame').classList.remove('hidden');
    this.input.pressed.clear();
    this.minigame = new Cls(this, opts);
  }

  endMinigame() {
    this.minigame = null;
    document.getElementById('minigame').classList.add('hidden');
    if (this.ui.modal === 'minigame') this.ui.modal = null;
    if (this.ui.onModalClose) this.ui.onModalClose();
  }

  // ---------------- metal detecting on the beach ----------------
  seedTreasure() {
    this.treasures = [];
    for (let i = 0; i < 400 && this.treasures.length < 14; i++) {
      const x = 330 + Math.random() * (BEACH.shore - 334), z = BEACH.z0 + 10 + Math.random() * (BEACH.z1 - BEACH.z0 - 20);
      if (!onSand(x, z) || this.world.col.query(x, z, 2).some((o) => o.t === 'b' && x > o.x0 - 2 && x < o.x1 + 2 && z > o.z0 - 2 && z < o.z1 + 2)) continue;
      if (Math.abs(z - BEACH.pier.z) < 5 && x > BEACH.pier.x0) continue;
      this.treasures.push({ x, z });
    }
  }

  updateDetector(dt) {
    const p = this.player;
    const on = this.state.owned.detector && !p.cart && onSand(p.x, p.z);
    const el = document.getElementById('detector');
    if (!on || !this.treasures) {
      this.detector = null;
      if (el) el.classList.add('hidden');
      return;
    }
    let best = Infinity;
    for (const t of this.treasures) best = Math.min(best, Math.hypot(t.x - p.x, t.z - p.z));
    const strength = clamp(1 - best / 20, 0, 1);
    this.detector = { strength };
    if (el) {
      el.classList.remove('hidden');
      const bars = Math.round(strength * 8);
      el.innerHTML = `🔍 <b>${'▮'.repeat(bars)}<span>${'▯'.repeat(8 - bars)}</span></b>${strength > 0.9 ? ' <em>DIG! [E]</em>' : ''}`;
    }
    this.beepT = (this.beepT || 0) - dt;
    if (strength > 0.05 && this.beepT <= 0) {
      this.beepT = lerp(1.3, 0.09, strength);
      audio.tone({ freq: 700 + strength * 1100, type: 'square', dur: 0.05, vol: 0.05 + strength * 0.05 });
    }
  }

  dig() {
    const p = this.player;
    let bi = -1, bd = Infinity;
    this.treasures.forEach((t, i) => { const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < bd) { bd = d; bi = i; } });
    if (bi < 0) return;
    this.treasures.splice(bi, 1);
    p.char.play('sand', 0.6);
    audio.play('pocketSand');
    this.particles.burst('sand', p.x, p.y + 0.3, p.z, 20, { speed: 2, up: 3, life: 0.8, size: 0.2, gravity: 8 });
    const loot = pick([
      ['a handful of quarters', 12], ['a handful of quarters', 18], ['a crusty $20 bill', 20], ['loose change and a Life Saver', 7],
      [`a lost wedding ring. Somebody's in trouble`, 120], ['a gold Rolex. A REAL one this time', 250],
      [`somebody's dentures. You pawn them anyway`, 3], ['a Spanish doubloon from 1715!', 400],
      ['a flip phone with 40 missed calls from "Mom"', 0], ['a vintage can of Schlitz (still sealed)', 0],
    ]);
    const [what, cash] = loot;
    if (cash) this.addMoney(cash, 'metal detecting');
    if (what.includes('Schlitz')) this.state.inv.beer++;
    if (what.includes('doubloon')) this.xp('stat', 2);
    this.state.counters.treasures = (this.state.counters.treasures || 0) + 1;
    this.achievement('treasure');
    this.ui.splash('🔍 FOUND IT', `You dug up ${what}.`, 2.4, '#f2c94c');
    this.detector = null;
  }

  talkRon(n) {
    const inRace = this.race && this.race.running;
    const won = this.state.counters.racesWon || 0;
    return {
      name: n.name, title: `Cart Race Bookie • ${won} win${won === 1 ? '' : 's'}`,
      text: inRace ? `"You're already racing! Go go go!"` : `"They call me Rocket. Partly 'cause I'm fast. Mostly 'cause of my colonoscopy.

One lap of the Back Nine Grand Prix: Fairway Drive, down the west path, across the course, up the east side and home. Hit every checkpoint. Winner takes three times the bet."

${this.playerCart.upgrades.governor ? '' : '(Tip: a stock cart tops out at 25 mph. Sal can fix that.)'}`,
      choices: inRace ? [] : [
        ...RACE_TIERS.map((t) => ({ text: `Race: ${t.label} vs ${t.rivals.join(' & ')}`, tag: `win ${money(t.bet * 3)}`, disabled: this.state.money < t.bet, action: () => { this.startRace(t); return null; } })),
        { text: 'Maybe later', action: () => null },
      ],
    };
  }

  startRace(tier) {
    if (this.race) { this.race.dispose(); this.race = null; }
    const p = this.player;
    if (!p.cart) {
      const c = this.playerCart;
      if (c.sunk || c.driver) this.recoverCart();
      p.enterCart(c);
    }
    this.spend(tier.bet);
    this.race = new Race(this, tier);
  }

  updateRace(dt) {
    const r = this.race;
    if (!r) return;
    if (r.running) {
      for (const x of r.racers) x.npc.data.chase = x.done ? null : { x: TRACK[Math.min(x.cp, TRACK.length - 1)][0], z: TRACK[Math.min(x.cp, TRACK.length - 1)][1] };
      r.update(dt);
    } else {
      r.cleanupT -= dt;
      if (r.cleanupT <= 0) {
        r.dispose();
        this.race = null;
      }
    }
  }

  coastGuard() {
    this.fadeOut(() => {
      if (this.player.cart) this.player.exitCart();
      this.teleport(BEACH.pier.x0 - 4, BEACH.pier.z + 6, -Math.PI / 2);
      this.recoverCart();
      this.spend(75);
      this.advanceTime(45);
    }, 2.6, 'RESCUED', 'The Coast Guard fished you out of the Atlantic. Sal has your cart. That will be $75, and a lecture.', '#4cc9f0');
  }

  recoverCart() {
    const c = this.playerCart;
    c.sunk = false;
    c.x = -226; c.z = 38; c.heading = Math.PI / 2;
    c.vx = c.vz = c.vy = 0;
    c.y = heightAt(c.x, c.z);
    c.syncMesh(0);
    this.ui.toast('🐊 Sal fished your cart out. It smells like pond.', 'quest', 4);
  }

  // ================================================================ helpers for quests / ui
  nearestBall() {
    const p = this.player;
    let best = null, bd = Infinity;
    for (const b of this.balls.list) {
      const d = (b.x - p.x) ** 2 + (b.z - p.z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  nearestCustomer(kind) {
    const p = this.player;
    let best = null, bd = Infinity;
    for (const n of this.npcs) {
      if (n.data.wants !== kind || n.state === 'ko') continue;
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  nearestUnownedCart() {
    const p = this.player;
    let best = null, bd = Infinity;
    for (const c of this.concession) {
      if (c.state.owned) continue;
      const d = (c.cart.x - p.x) ** 2 + (c.cart.z - p.z) ** 2;
      if (d < bd) { bd = d; best = c.cart; }
    }
    return best;
  }

  onQuestComplete(s) {
    this.ui.toast(`✅ <b>${s.title}</b>`, 'quest', 4);
    audio.play('success');
  }

  chapterComplete() {
    this.celebrate(16);
    this.ui.splash('CHAPTER 1 COMPLETE', `${this.state.name} runs Sunset Palms now. Karen is weeping into her clipboard. Keep playing — Tammy awaits.`, 6, '#7CFC9A');
    audio.play('levelup');
  }

  onRoad(x, z) {
    for (const e of EDGES) {
      if (Math.abs(x - (e.a.x + e.b.x) / 2) > Math.abs(e.a.x - e.b.x) / 2 + 8) continue;
      if (Math.abs(z - (e.a.z + e.b.z) / 2) > Math.abs(e.a.z - e.b.z) / 2 + 8) continue;
      if (distToSegment(x, z, e.a.x, e.a.z, e.b.x, e.b.z) < e.width / 2 + 0.5) return true;
    }
    const B = BUILDINGS;
    const pr = BEACH.pier;
    if (x > pr.x0 && x < pr.x1 && Math.abs(z - pr.z) < pr.w / 2) return true;
    for (const lot of [B.parking, B.strip, BEACH.lot]) if (Math.abs(x - lot.x) < lot.sx / 2 && Math.abs(z - lot.z) < lot.sz / 2) return true;
    return false;
  }

  knockProp(pr, vx, vz, up, byClub = false) {
    if (!this.props.hit(pr, vx, vz, up)) return;
    const t = pr.type;
    const c = this.state.counters;
    audio.play(t === 'mailbox' ? 'crash' : 'plastic', { vol: 0.7 });
    if (t === 'flamingo') {
      c.flamingos++;
      if (c.flamingos % 5 === 0) this.ui.toast(`🦩 Flamingos liberated: ${c.flamingos}`, '', 2.5);
      if (c.flamingos >= 10) this.achievement('flamingo10');
    }
    if (t === 'mailbox') {
      c.mailboxes++;
      if (byClub) this.ui.float(pr.x, 2, pr.z, 'HOME RUN!', '#f2c94c', 1.4);
      if (c.mailboxes >= 5) this.achievement('mailbox');
    }
    if (t === 'gnome') c.gnomes++;
    this.particles.burst(t === 'flamingo' ? 'confetti' : 'dust', pr.x, pr.y + 0.6, pr.z, 6, { speed: 2, up: 3, life: 0.8, size: 0.25 });
    this.crime(pr.x, pr.z, t === 'mailbox' ? 0.35 : 0.15, t === 'mailbox' ? 'Destruction of federal property (mailbox)' : 'Lawn ornament abuse', 22);
  }

  // ================================================================ per-frame
  update(dt) {
    const s = this.state;
    const p = this.player;
    const input = this.input;
    const modal = this.ui.modal;

    this.updateCut(dt);
    this.fx.damage = Math.max(0, this.fx.damage - dt * 2.5);

    if (!modal && !this.cut) {
      // ----- time
      this.tickMinutes(dt * TIME_SCALE);
      // ----- input actions
      if (input.hit('KeyE')) {
        const it = this.findInteraction();
        if (it) it.action();
      }
      if (input.hit('KeyB')) this.drink();
      if (input.click(0) || input.hit('KeyF')) this.playerAttack();
      if (input.click(2) || input.hit('KeyG')) this.pocketSand();
      if (input.hit('KeyQ')) this.cycleWeapon(1);
      for (let i = 0; i < WEAPON_ORDER.length; i++) if (input.hit(`Digit${i + 1}`)) this.cycleWeapon(0, WEAPON_ORDER.filter((w) => s.weapons.includes(w))[i]);
      if (input.hit('KeyH')) this.horn();
      this._hornT = (this._hornT || 0) - dt;
      if (input.hit('KeyR') && p.cart) {
        const st = audio.setStation(audio.station + 1);
        this.ui.radio(st.freq ? `${st.freq} ${st.name}` : 'RADIO OFF');
      }
      this.pee(dt, input.key('KeyP'));
      // dev shortcuts for reviewers
      if (input.hit('BracketRight')) { this.addMoney(1000, 'dev cheat'); }
      if (input.hit('BracketLeft')) { for (const k of ['str', 'cha', 'intim', 'stat']) this.xp(k, this.xpNeed(s.stats[k].lvl)); }
      if (input.hit('Backquote')) this.advanceTime(180);

      // ----- player
      p.update(dt, input, this.camRig);
      if (this.drinkT > 0) {
        this.drinkT -= dt;
        if (this.drinkT <= 0) this.finishDrink();
      }
      if (p.swing) {
        p.swing.t += dt;
        if (!p.swing.done && p.swing.t >= p.swing.hitAt) { p.swing.done = true; this.resolvePlayerSwing(); }
        if (p.swing.t > p.swing.w.dur) p.swing = null;
      }

      // ----- body chemistry
      s.buzz = Math.max(0, s.buzz - dt * 0.33);
      if (s.buzz >= 100 && !this.cut) this.blackout();
      for (const k of Object.keys(s.buffs)) s.buffs[k] = Math.max(0, s.buffs[k] - dt);
      if (!p.ko) p.hp = Math.min(this.maxHp(), p.hp + dt * 0.6);
      if (p.cart && s.buzz > 70 && p.cart.speed > 4) {
        s.counters.drunkDrive += dt;
        if (s.counters.drunkDrive > 30) this.achievement('drunkDrive');
      }

      // ----- NPCs + carts
      for (const n of this.npcs) {
        if (n.talking) n.talking = false; // no dialogue is open in this branch
        n.update(dt);
      }
      this.updateCarts(dt);
      this.updateHeat(dt);
      this.updateEvents(dt);
      this.updateDrones(dt);
      this.updateGator(dt);
      this.updateRace(dt);
      if (this.party) {
        this.party.update(dt, dt * TIME_SCALE);
        if (!this.party.active) this.party = null;
      }
      this.props.update(dt, p.x, p.z);
      this.balls.update(dt, this.scene);
      this.pickups.update(dt, p.x, p.z, (pk) => { this.addMoney(pk.amount, ''); });
      this.collectBalls();

      // pending husband confrontation
      if (this.pendingHusband) {
        const { def, h } = this.pendingHusband;
        if (h.state !== 'walkTo' && h.state !== 'ko') {
          const a = rand(0, 6.28);
          h.x = p.x + Math.cos(a) * 14; h.z = p.z + Math.sin(a) * 14;
          const col = { x: h.x, z: h.z };
          this.world.col.resolve(col, 0.5);
          h.x = col.x; h.z = col.z;
          h.state = 'walkTo';
          h.target = p;
          h.data.walkSpeed = 3.2;
          h.say(def.husband === 'frank' ? 'HEY! HEY YOU!' : 'I SAY! YOU THERE!', 2.5);
          h.data.onArrive = () => {
            h.state = 'static';
            this.ui.openDialogue(D.husbandConfront(this, h, def));
            this.pendingHusband = null;
          };
          h.data.after = 'static';
        }
      }
      if (this.pendingElection && !this.ui.modal) {
        this.pendingElection = false;
        this.election();
      }
      updateTooth(this, dt);
      this.updateDetector(dt);
      if (this.worldEvents) this.worldEvents.update(dt);
      if (this.life) this.life.update(dt);
      if (this.timers && this.timers.length) {
        for (const tm of this.timers) tm.t -= dt;
        const due = this.timers.filter((tm) => tm.t <= 0);
        this.timers = this.timers.filter((tm) => tm.t > 0);
        for (const tm of due) tm.fn();
      }
      if (this.oceanRescueT > 0) {
        this.oceanRescueT -= dt;
        if (this.oceanRescueT <= 0) this.coastGuard();
      }
      audio.setSurf(p.x > 300 ? clamp(1 - (BEACH.shore - p.x) / 110, 0.25, 1) : clamp(1 - (300 - p.x) / 40, 0, 0.25));
      const walker = this.named.walker;
      if (walker && walker.data.zoomT > 0) {
        walker.data.zoomT -= dt;
        if (Math.random() < dt * 8) this.particles.emit('dust', walker.x, walker.y + 0.2, walker.z, { vy: 0.5, life: 0.6, size: 0.4, grow: 0.6 });
        if (walker.data.zoomT <= 0) {
          walker.walkSpeed = walker.data.baseWalk ?? 0.6;
          walker.runSpeed = walker.data.baseRun ?? 2.3;
          if (walker.state !== 'ko' && !walker.hostile) walker.resumeBase();
          walker.say('...I need a nap.', 2.5);
        }
      }
      const cq = this.quests.current();
      if (cq && cq.id === 'c2_deuce' && !this.named.deuce && Math.hypot(p.x - 15, p.z - 24) > 45) spawnDeuce(this);
      if (cq && cq.id === 'c2_deuce' && this.named.deuce && !s.quest.flags.deuceIntro && !p.cart && Math.hypot(this.named.deuce.x - p.x, this.named.deuce.z - p.z) < 14) {
        this.ui.openDialogue(deuceConfront(this));
      }
      // Chip confrontation trigger
      const qs = this.quests.current();
      if (qs && qs.id === 'chip' && !s.quest.flags.chipIntro) {
        const chip = this.named.chip;
        if (Math.hypot(chip.x - p.x, chip.z - p.z) < 12 && !p.cart) {
          this.ui.openDialogue(D.chipConfront(this, chip));
        }
      }
      this.quests.update(dt);
      this.checkAchievements();
    } else {
      if (modal === 'minigame' && this.minigame) this.minigame.update(dt, input);
      // keep animating characters in dialogue so the world doesn't look frozen
      for (const n of this.npcs) if (n.talking || n.visible) n.char.update(dt * 0.5);
      p.char.update(dt);
    }

    // ----- camera + visuals (always)
    const c = p.cart;
    this.camRig.update(dt, input, {
      x: p.x, y: p.y, z: p.z, heading: p.heading, inCart: !!c, speed: c ? c.speed : p.speed,
      boost: c && c.upgrades.turbo && (input.key('ShiftLeft') || input.key('ShiftRight')),
      reversing: c && c.forwardSpeed < -1,
    });
    this.updateVisibility();
    this.updateTagsAndMarker();
    this.updateLights(dt);
    this.updateAudio(dt);
    this.fx.drunk = clamp((s.buzz - 15) / 85, 0, 1);
    this.fx.rhino = s.buffs.rhino > 0 ? 1 : 0;
    this.fx.blind = clamp(p.blind / 2, 0, 1);

    // interaction prompt
    if (!modal && !this.cut) {
      const it = this.findInteraction();
      this.ui.prompt(it ? `<kbd>E</kbd>${it.label}` : null);
    } else this.ui.prompt(null);

    // fountains
    this._fT = (this._fT || 0) - dt;
    if (this._fT <= 0) {
      this._fT = 0.05;
      for (const f of this.world.fountains) {
        if (Math.hypot(f.x - p.x, f.z - p.z) > 150) continue;
        for (let i = 0; i < 3; i++) this.particles.emit('drop', f.x + rand(-0.2, 0.2), f.y + 0.3, f.z + rand(-0.2, 0.2), { vx: rand(-1.2, 1.2), vy: rand(6, 8), vz: rand(-1.2, 1.2), gravity: 9.8, life: 1.5, size: 0.3 });
      }
    }
  }

  updateCarts(dt) {
    const p = this.player;
    for (const c of this.carts) {
      if (c.driver) continue; // driven carts update via driver/player
      if (c.speed > 0.05 || !c.grounded || c.sunk) c.update(dt, { throttle: 0, steer: 0 }, this.world.col);
      c.setLights(false);
    }
    // cart vs cart
    const list = this.carts;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        if (Math.abs(dx) > 2.6 || Math.abs(dz) > 2.6) continue;
        const d = Math.hypot(dx, dz);
        if (d >= 2.4 || d < 0.001) continue;
        const nx = dx / d, nz = dz / d, pen = 2.4 - d;
        a.x -= nx * pen / 2; a.z -= nz * pen / 2;
        b.x += nx * pen / 2; b.z += nz * pen / 2;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) {
          const imp = -rv * 0.9;
          a.vx -= nx * imp; a.vz -= nz * imp;
          b.vx += nx * imp; b.vz += nz * imp;
          if (-rv > 3 && (a === p.cart || b === p.cart)) {
            audio.play('crash', { vol: clamp(-rv / 10, 0.3, 1) });
            this.camRig.addShake(clamp(-rv / 15, 0.1, 0.6));
            const other = a === p.cart ? b : a;
            if (other.driver && other.driver !== p) {
              const dr = other.driver;
              if (dr.role === 'security') this.addHeat(1, 'Ramming an HOA vehicle');
              else {
                dr.say(pick(['MY CART!', "I'm calling my insurance guy! He's also my son!", 'You maniac!', 'I just got that detailed!']), 2);
                this.crime(other.x, other.z, 0.3, 'Reckless cart operation', 18);
              }
            }
          }
        }
        a.syncMesh(0);
        b.syncMesh(0);
      }
    }
    const pc = p.cart;
    if (pc) {
      if (pc.lastImpact > 4) {
        audio.play('crash', { vol: clamp(pc.lastImpact / 12, 0.3, 1) });
        this.camRig.addShake(clamp(pc.lastImpact / 14, 0.15, 0.8));
        this.particles.burst('dust', pc.x, pc.y + 0.5, pc.z, 6, { speed: 2, up: 2, life: 0.7, size: 0.45, grow: 0.7, gravity: 1 });
      }
      if (pc.landed) {
        const air = pc.lastAir || 0;
        if (air > 0.35) {
          audio.play('land', { vol: clamp(air, 0.3, 1) });
          this.camRig.addShake(clamp(air * 0.5, 0.2, 0.8));
          this.particles.burst('dust', pc.x, pc.y + 0.2, pc.z, 14, { speed: 3, up: 1.5, life: 0.9, size: 0.6, grow: 0.9, gravity: 1 });
        }
        if (air > this.state.counters.maxAir) this.state.counters.maxAir = air;
        if (air > 0.85) {
          this.ui.splash(air > 1.9 ? 'INSANE AIR!' : air > 1.35 ? 'SICK AIR!' : 'AIR TIME!', `${air.toFixed(1)} seconds of pure freedom`, 1.6);
          this.xp('stat', air > 1.35 ? 1 : 0.5);
        }
        if (air > 1.6) this.achievement('air');
      }
      // dust + nitrous flames
      const spd = pc.speed;
      if (spd > 6 && !this.onRoad(pc.x, pc.z) && Math.random() < dt * 20) this.particles.emit('dust', pc.x - Math.sin(pc.heading) * 1.2, pc.y + 0.2, pc.z - Math.cos(pc.heading) * 1.2, { vy: 0.6, life: 0.9, size: 0.5, grow: 0.8, drag: 1 });
      if (pc.upgrades.turbo && (this.input.key('ShiftLeft') || this.input.key('ShiftRight')) && spd > 2) {
        for (let i = 0; i < 2; i++) this.particles.emit('spark', pc.x - Math.sin(pc.heading) * 1.4, pc.y + 0.45, pc.z - Math.cos(pc.heading) * 1.4, { vx: -Math.sin(pc.heading) * 4 + rand(-0.5, 0.5), vy: rand(0, 1), vz: -Math.cos(pc.heading) * 4 + rand(-0.5, 0.5), life: 0.3, size: 0.5, grow: -1 });
      }
      if (pc.sunk && !this._sinkHandled) {
        this._sinkHandled = true;
        audio.play('splash');
        this.particles.burst('drop', pc.x, pc.y + 0.5, pc.z, 40, { speed: 4, up: 7, life: 1.4, size: 0.3, gravity: 12 });
        this.achievement('sunk');
        if (waterAt(pc.x, pc.z) === OCEAN) {
          this.achievement('pierJump');
          this.ui.float(pc.x, pc.y + 3, pc.z, 'PIER JUMP!', '#4cc9f0', 2);
        }
        this.ui.splash('SPLASHDOWN', pc === this.playerCart ? "Your cart is sleeping with the fishes. Sal can fish it out." : 'Well, that one\'s gone.', 2.5, '#4cc9f0');
        this.sinkExitT = 0.9;
        if (waterAt(pc.x, pc.z) === OCEAN && pc === this.playerCart) this.oceanRescueT = 2.8;
      }
      if (!pc.sunk) this._sinkHandled = false;
      if (this.sinkExitT > 0) {
        this.sinkExitT -= dt;
        if (this.sinkExitT <= 0 && p.cart === pc) p.exitCart();
      }

      // run over props
      if (spd > 2.5) {
        for (const pr of this.props.near(pc.x, pc.z)) {
          if (pr.state !== 'idle') continue;
          if (Math.hypot(pr.x - pc.x, pr.z - pc.z) < 1.4) this.knockProp(pr, pc.vx * 1.1, pc.vz * 1.1, 3 + spd * 0.35);
        }
      }
      // run over people
      for (const n of this.npcs) {
        if (n.cart || n.air || n.role === 'gang') continue;
        const d = Math.hypot(n.x - pc.x, n.z - pc.z);
        if (d < 1.45 && spd > 3) {
          const wasHostile = n.hostile;
          n.vx = pc.vx * 1.2 + rand(-1, 1);
          n.vz = pc.vz * 1.2 + rand(-1, 1);
          n.vy = 4 + spd * 0.35;
          n.air = true;
          n.hp -= spd * 3;
          n.recentlyHit = 2;
          audio.play('bonk');
          audio.play(n.female ? 'ow' : 'oof');
          this.camRig.addShake(0.3);
          pc.vx *= 0.8; pc.vz *= 0.8;
          this.ui.float(n.x, 2.5, n.z, pick(['BOWLING!', 'STRIKE!', 'FORE!!', 'YEET!']), '#ff9f1c', 1.2);
          if (spd > 9) this.slowmo = 0.4;
          if (n.state === 'ko') continue;
          if (!wasHostile && !['rival', 'goon', 'husband', 'streaker'].includes(n.role)) this.crime(n.x, n.z, n.role === 'security' ? 1.5 : 1, n.role === 'security' ? 'Running over an HOA officer' : 'Vehicular senior-slaughter (attempted)', 25);
          if (n.state === 'drive') continue;
          if (n.hp > 0) n.provoke(p);
        }
      }
    } else {
      // NPC carts hitting the player on foot
      for (const c of this.carts) {
        if (!c.driver || c.speed < 4) continue;
        if (Math.hypot(p.x - c.x, p.z - c.z) < 1.4) {
          this.damagePlayer(c.speed * 2, c.x, c.z, c.speed);
          c.vx *= 0.5; c.vz *= 0.5;
          if (c.driver.role !== 'security') c.driver.say(pick(['Oops!', 'Didn\'t see ya! Cataracts!', 'You were in my blind spot! It\'s everywhere!']), 2);
        }
      }
    }
    // concession carts pause for the player on foot
    for (const c of this.concession) {
      if (!p.cart && Math.hypot(p.x - c.cart.x, p.z - c.cart.z) < 8) c.driver.stopT = Math.max(c.driver.stopT, 0.6);
    }
  }

  collectBalls() {
    const s = this.state;
    const p = this.player;
    const hopper = p.cart && s.hopper;
    if (p.cart && !hopper) return;
    const r = hopper ? 2.8 : 1.1;
    const list = this.balls.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (Math.abs(b.x - p.x) > r || Math.abs(b.z - p.z) > r) continue;
      if (Math.hypot(b.x - p.x, b.z - p.z) > r) continue;
      if (s.inv.balls >= s.ballCap) {
        if (!this._fullHint || performance.now() - this._fullHint > 5000) {
          this._fullHint = performance.now();
          this.ui.hint(s.ballCap === 1 ? 'Pockets full! (1 ball) Buy a bucket at the Pro Shop, genius.' : 'Ball capacity full! Sell to Gus at the Pro Shop.', 3);
        }
        return;
      }
      s.inv.balls++;
      this.balls.removeAt(i);
      audio.play('ball');
      this.particles.emit('spark', b.x, b.y + 0.3, b.z, { vy: 1.5, life: 0.4, size: 0.4 });
    }
  }

  golferShot(n) {
    const h = n.data.hole;
    if (!h || n.state !== 'golf') return;
    audio.play('fore', { vol: 0.2 });
    if (Math.hypot(n.x - this.player.x, n.z - this.player.z) < 40) n.say(pick(['FORE!', 'Get in the hole! ...Aw, nuts.', 'Slice! SLICE! Dammit!', 'That one\'s in the water. Again.']), 2);
    let tx, tz;
    const t = rand(0.45, 0.95);
    tx = h.tee[0] + (h.green[0] - h.tee[0]) * t + rand(-28, 28);
    tz = h.tee[1] + (h.green[1] - h.tee[1]) * t + rand(-10, 10);
    if (chance(0.3)) {
      let best = null, bd = Infinity;
      for (const p of PONDS) { const d = Math.hypot(p.x - tx, p.z - tz); if (d < bd) { bd = d; best = p; } }
      if (best && bd < 90) { const a = rand(0, 6.28), r = rand(0, best.r * 0.8); tx = best.x + Math.cos(a) * r; tz = best.z + Math.sin(a) * r; }
    }
    if (!onCourse(tx, tz) || this.balls.list.length > 260) return;
    this.balls.launch(n.x, n.z, tx, tz);
  }

  checkAchievements() {
    this._achT = (this._achT || 0) - 1 / 60;
  }

  updateVisibility() {
    const cam = this.camera.position;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - cam.x, n.z - cam.z);
      const vis = d < (this.drawDist || 170) || n.cart;
      if (vis !== n.visible) {
        n.visible = vis;
        n.char.root.visible = vis;
      }
      // only nearby people cast shadows (big draw-call saver)
      const shadow = d < 55;
      if (shadow !== n._shadow) {
        n._shadow = shadow;
        n.char.root.traverse((o) => { if (o.isMesh) o.castShadow = shadow; });
      }
    }
    for (const c of this.carts) {
      const shadow = Math.hypot(c.x - cam.x, c.z - cam.z) < 60;
      if (shadow !== c._shadow) {
        c._shadow = shadow;
        c.group.traverse((o) => { if (o.isMesh) o.castShadow = shadow; });
      }
    }
  }

  updateTagsAndMarker() {
    const p = this.player;
    const tags = [];
    const q = this.quests.current();
    const tgt = this.race && this.race.running ? this.race.target() : q && q.target ? q.target(this) : null;
    this.markerPos = tgt ? { x: tgt.x, y: tgt.y ?? heightAt(tgt.x, tgt.z), z: tgt.z } : null;
    for (const n of this.npcs) {
      if (!n.visible) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d > 32) continue;
      let icon = null, label = null, cls = '';
      const y = (n.cart ? n.y + 3 : n.y + (n.state === 'ko' ? 1.0 : 2.3));
      if (n.state === 'ko') icon = '💤';
      else if (n.hostile) { icon = '💢'; cls = 'hostile'; }
      else if (n.data.wants === 'pills' && this.state.quest.flags.metDoc) icon = '💊';
      else if (n.data.wants === 'tea' && this.state.quest.flags.metDoc) icon = '🍵';
      else if (n.role === 'lady') { icon = this.state.romance[n.data.lady.id].conquest ? '💞' : '💗'; cls = 'lady'; }
      else if (n.role === 'recruit') icon = '⭐';
      else if (n.role === 'gang') icon = '🟢';
      else if (n.role === 'operator') icon = this.concession.find((c) => c.operator === n)?.state.owned ? '✅' : '🛺';
      else if (n.role === 'security') icon = this.heat.level > 0 ? '🚨' : null;
      else if (n.role === 'karen') icon = '📋';
      if (d < 13 && n.role !== 'resident' && n.role !== 'driver' && n.role !== 'goon') label = n.name;
      if (n.role === 'recruit' && d < 13) label = `${n.name} — Recruit`;
      if (!icon && !label) continue;
      tags.push({ key: n.id, x: n.x, y, z: n.z, icon, label, cls });
    }
    this.tags = tags;
  }

  updateLights(dt) {
    const night = this.sky.night;
    const p = this.player;
    this._lampT = (this._lampT || 0) - dt;
    if (this._lampT <= 0) {
      this._lampT = 0.4;
      const lamps = this.world.lamps.map((l) => ({ l, d: (l.x - p.x) ** 2 + (l.z - p.z) ** 2 })).sort((a, b) => a.d - b.d);
      this.lampLights.forEach((L, i) => {
        const e = lamps[i];
        if (!e) return;
        L.position.set(e.l.x, e.l.y, e.l.z);
      });
    }
    for (const L of this.lampLights) L.intensity = night * 55;
    const lightsOn = night > 0.35;
    for (const c of this.carts) if (c.driver) c.setLights(lightsOn);
    const pc = p.cart;
    if (pc && lightsOn) {
      const fx = Math.sin(pc.heading), fz = Math.cos(pc.heading);
      this.headlight.position.set(pc.x + fx * 1.3, pc.y + 1.0, pc.z + fz * 1.3);
      this.headlight.target.position.set(pc.x + fx * 12, pc.y, pc.z + fz * 12);
      this.headlight.intensity = 60;
    } else this.headlight.intensity = 0;
    if (pc && pc.upgrades.neon) {
      this.neonLight.position.set(pc.x, pc.y + 0.3, pc.z);
      this.neonLight.intensity = 6 + night * 20;
    } else this.neonLight.intensity = 0;
  }

  updateAudio(dt) {
    const p = this.player;
    const c = p.cart;
    audio.setEngine(!!c && !this.ui.modal, c ? clamp(c.speed / 16, 0, 1) : 0, c ? this.input.axis(['KeyS'], ['KeyW']) : 0);
    const partyNear = this.party && Math.hypot(p.x - this.party.center.x, p.z - this.party.center.z) < 45;
    audio.setRadio(((!!c && audio.station !== 0) || partyNear) && !this.ui.modal);
    if (c) c.bass = c.upgrades.speakers && audio.station !== 0;
    audio.ambientTick(dt, this.sky.night > 0.6);
  }

  // ================================================================ menu (TAB)
  renderMenu(tab) {
    const s = this.state;
    const tabs = [['status', 'STATUS'], ['bag', 'BAG'], ['romance', 'ROMANCE'], ['empire', 'EMPIRE'], ['hoa', 'HOA'], ['help', 'HELP']];
    const tabEl = document.getElementById('menu-tabs');
    tabEl.innerHTML = tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('');
    tabEl.querySelectorAll('button').forEach((b) => (b.onclick = () => this.renderMenu(b.dataset.tab)));
    const body = document.getElementById('menu-body');
    let h = '';
    if (tab === 'status') {
      const row = (k, nm, desc) => {
        const base = this.statBase(k), eff = this.stat(k), st = s.stats[k];
        let pips = '';
        for (let i = 1; i <= 10; i++) pips += `<i class="${i <= base ? 'on' : i <= eff ? 'on buff' : ''}"></i>`;
        return `<div class="statrow"><span class="nm">${nm}</span><span class="pips">${pips}</span><span class="xp">${eff !== base ? `(${eff} buffed) ` : ''}XP ${Math.floor(st.xp)}/${this.xpNeed(st.lvl)}</span></div><div style="font-size:12px;font-weight:700;opacity:.7;margin:-4px 0 6px 130px">${desc}</div>`;
      };
      h += `<h3>${s.name}, age 72 — Resident of Sunset Palms</h3>`;
      h += row('str', '💪 STRENGTH', 'HP, damage, knockback. Train: water aerobics, brawls, buffet.');
      h += row('cha', '😏 CHARISMA', 'Flirting, deals, votes. Beer gives liquid courage (until you slur).');
      h += row('intim', '😠 INTIMIDATION', 'Shakedowns, cart takeovers, scaring husbands & Karen.');
      h += row('stat', '💎 STATUS', 'Cart mods, bling, conquests, power. Gate for high-tier romance.');
      const c = s.counters;
      h += `<h3>Rap Sheet</h3><div class="grid2">
        <div class="card"><div class="t">🍺 ${c.beers} beers drunk</div><div class="sub">${c.beersToday} today • Max air ${c.maxAir.toFixed(1)}s</div></div>
        <div class="card"><div class="t">💊 ${c.pillsSold} Blue Boys / 🍵 ${c.teaSold} teas sold</div><div class="sub">Lifetime earnings ${money(c.earned)}</div></div>
        <div class="card"><div class="t">🦩 ${c.flamingos} flamingos • 📬 ${c.mailboxes} mailboxes</div><div class="sub">🥊 ${c.knockouts} knockouts • 🚨 busted ${c.busted}×</div></div>
        <div class="card"><div class="t">🏆 ${s.achievements.length}/${Object.keys(ACH).length} achievements</div><div class="sub">${s.achievements.map((a) => ACH[a][0]).join(' • ') || 'None yet. Go be terrible.'}</div></div>
      </div>`;
    } else if (tab === 'bag') {
      const inv = s.inv;
      h += '<h3>Inventory</h3><div class="grid2">';
      h += `<div class="card"><div class="t">🍺 Geezer Light ×${inv.beer}</div><p>+Buzz, +CHA (to a point). Press B.</p></div>`;
      h += `<div class="card"><div class="t">💊 Blue Boys ×${inv.pills}</div><p>Sell to residents with 💊, stock beverage carts, or...</p><div class="row-btns"><button class="btn" id="use-blue" ${inv.pills ? '' : 'disabled'}>TAKE ONE (+flirting)</button></div></div>`;
      h += `<div class="card"><div class="t">🍵 Rhino Horn Tea ×${inv.tea}</div><p>Sells $130+. Or drink it: RHINO MODE (+STR, +INT, speed).</p><div class="row-btns"><button class="btn" id="use-rhino" ${inv.tea ? '' : 'disabled'}>DRINK IT</button></div></div>`;
      h += `<div class="card"><div class="t">⛳ Golf balls ${inv.balls}/${s.ballCap}</div><p>${s.hopper ? 'Ball-Hopper installed (drive over them).' : s.ballCap > 1 ? 'Five-gallon bucket.' : 'Pockets. Just pockets.'} Drones: ${s.drones}</p></div>`;
      h += `<div class="card"><div class="t">🍷 Box wine ×${inv.wine} • 💐 Flowers ×${inv.flowers}</div><p>Gifts for the ladies. Know their tastes.</p></div>`;
      h += `<div class="card"><div class="t">🏌️ Weapons</div><p>${s.weapons.map((w) => `${WEAPONS[w].icon} ${WEAPONS[w].name}${w === s.weapon ? ' ◀' : ''}`).join('<br>')}</p></div>`;
      h += '</div>';
    } else if (tab === 'romance') {
      h += '<h3>The Ladies of Sunset Palms</h3><div class="grid2">';
      for (const l of LADIES) {
        const r = s.romance[l.id];
        const n = Math.round(r.aff / 20);
        const where = { beach: 'Boca Beach (through the front gate)', pool: 'Pool deck', shuffle: 'Shuffleboard courts', tiki: 'Tiki Hut bar', pickleball: 'Pickleball courts', clubhouse: 'Clubhouse', cart: 'Beverage cart on the course' }[l.spot];
        h += `<div class="card"><div class="t">${l.name} ${r.conquest ? '💞' : ''}</div><div class="sub">Tier ${l.tier} • ${l.title} • ${where}</div><div class="hearts">${'❤'.repeat(n)}${'♡'.repeat(5 - n)}</div><p>${l.bio}</p><p style="opacity:.75">Needs CHA ${l.reqCha} / STATUS ${l.reqStat}${l.needsPimpedCart ? ` / ${l.needsPimpedCart} cart mods` : ''} • Likes: ${l.likes.join(', ') || '—'}${l.dislikes.length ? ` • Hates: ${l.dislikes.join(', ')}` : ''}</p><p><b>Perk:</b> ${r.conquest ? l.perk : '???'}</p></div>`;
      }
      h += '</div>';
    } else if (tab === 'empire') {
      h += '<h3>Beverage Cart Network</h3><div class="grid2">';
      for (const c of this.concession) {
        const st = c.state;
        h += `<div class="card"><div class="t">${c.def.name}</div><div class="sub">${st.owned ? `YOURS • ${Math.round(st.cut * 100)}% cut` : "Chip's"}</div><p>${st.owned ? `Stock: 💊 ${st.stock.pills} • 🍵 ${st.stock.tea}<br>Earned: ${money(st.earned)}` : 'Talk to the operator to take it over (Undercut or Intimidate).'}</p></div>`;
      }
      h += `<div class="card"><div class="t">🛸 Ball Drones ×${s.drones}</div><p>Collect balls automatically. $2/ball paid out hourly. Chip's goons may sabotage them.</p></div>`;
      h += '</div><h3>Your Crew</h3><div class="grid2">';
      const gang = this.gang();
      if (!gang.length) h += '<div class="card"><p>No crew yet. Look for ⭐ recruits around the parks and clubhouse.</p></div>';
      for (const g of gang) h += `<div class="card"><div class="t">${g.name}</div><div class="sub">${g.state === 'guard' ? 'On guard duty' : 'Following you'} • HP ${Math.round(g.hp)}/${g.maxHp}</div><p>${g.data.recruit.bio}</p></div>`;
      h += '</div>';
    } else if (tab === 'hoa') {
      const hs = s.hoa;
      const pr = this.hoaProjection();
      h += `<h3>Homeowners Association</h3><div class="card"><div class="t">${hs.president ? '🏛️ You are HOA PRESIDENT' : hs.puppet ? '🎭 Karen is your puppet' : 'Karen Whitmore is President'}</div><p>
        ${hs.president || hs.puppet ? `Active decrees: ${hs.decrees.length ? hs.decrees.join(', ') : 'none — visit the HOA Office'}` : hs.registered ? `You're on the ballot! Election Sunday 7 PM. Projected: you ~${pr.you} vs Karen ~${pr.karen}.` : 'Two routes to power: register at the HOA Office ($250) and win Sunday\'s election (CHA + STATUS), or get DIRT ON KAREN and blackmail her (INTIMIDATION).'}
        </p><p>Dirt on Karen: ${hs.dirt ? '✅ YES' : '❌ Not yet (try the maintenance dumpster at night, or get close to Linda Wainwright)'}</p>
        <p>Current HOA heat: ${'📋'.repeat(this.heat.level) || 'none'} — Fines payable at the HOA office.</p></div>`;
    } else if (tab === 'help') {
      h += `<h3>How to Play</h3><div class="grid2">
        <div class="card"><div class="t">Money</div><p>Pension ($450) hits Monday. HOA dues ($120) Sunday. Legal: collect golf balls for Gus. Illegal: buy Blue Boys & Rhino Tea from Doc, sell to residents with 💊/🍵 or stock beverage carts.</p></div>
        <div class="card"><div class="t">HOA Heat 📋</div><p>Crimes witnessed by Security, Karen or snitchy neighbors add heat. Security chases you. Get caught = fine + confiscation. Break line of sight to cool off, or pay fines at the HOA office.</p></div>
        <div class="card"><div class="t">Beer 🍺</div><p>Buzz boosts CHA (liquid courage) and STR. Past "Hammered", you slur (-CHA), stagger and the world spins. Hit 100 and you black out somewhere embarrassing. Bladder fills: P to pee.</p></div>
        <div class="card"><div class="t">Romance 💗</div><p>Small talk, pickup lines (odds shown), and gifts raise hearts. At ❤❤❤ ask her out. Married ladies come with husbands. Tammy the Cart Girl is the legend.</p></div>
        <div class="card"><div class="t">Brawling 🏌️</div><p>Click / F to swing. Q or 1-6 swap clubs. Wedge + right-click = POCKET SAND. Drivers launch geezers into ponds. Nobody dies — they nap.</p></div>
        <div class="card"><div class="t">Carts 🛺</div><p>Hop in any cart (E). Yank drivers out GTA-style. Hit the ramps on the course. Sal pimps your ride. Watch the ponds.</p></div>
        <div class="card"><div class="t">Reviewer shortcuts</div><p>] = +$1,000 • [ = +1 all stats • &#96; (backtick) = skip 3 hours</p></div>
      </div>`;
    }
    body.innerHTML = h;
    const ub = document.getElementById('use-blue');
    if (ub) ub.onclick = () => { s.inv.pills--; s.buffs.blue = 150; this.ui.toast('💊 You took a Blue Boy. Flirting bonus active. Walking is... different.', 'love', 4); this.renderMenu('bag'); };
    const ur = document.getElementById('use-rhino');
    if (ur) ur.onclick = () => { s.inv.tea--; s.buffs.rhino = 90; audio.play('levelup'); this.ui.toast('🦏 RHINO MODE! +2 STR, +2 INT, faster, tougher.', 'heat', 4); this.renderMenu('bag'); };
  }
}

export { SAVE_KEY, SHOPS, CART_MODS, fmtTime, DAYS, lerp, wrapAngle };
