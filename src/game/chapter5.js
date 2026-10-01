// Chapter 5: "Paradise Paved" — Trip Vandermeer, a spray-tanned developer, parks bulldozers on the 3rd
// tee: Palmetto Links is going to be "Palmetto Vista," luxury condos for the discerning 55+. Karen's zoning
// committee (a committee of one) already signed off. Rally a petition, crack the bribe ledger out of his
// sales-trailer safe at night (don't wake Gary the rent-a-cop), blow it all open at the HOA zoning
// meeting, then stop Trip's bulldozer rampage across the course and drive his own D9 through his trailer.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { heightAt } from '../world/terrain.js';
import { makeSignTexture } from '../gfx/textures.js';
import { Driver } from './traffic.js';
import { audio } from '../core/audio.js';
import { pick, rand, chance, money } from '../core/utils.js';

const F = (g) => g.state.quest.flags;
const TRAILER = { x: -55, z: -66, sx: 12, sz: 3.6, h: 3.3 }; // the sales office; door on the north (+z) side
const DOOR = { x: -55, z: -62.9 };
const TRIP_DAY = { x: -58.6, z: -61.6 };
const CHAIR = { x: -50.2, z: -61.4 }; // Gary's lawn chair
const DOZER_A = { x: -44, z: -69.5, h: Math.PI }; // the one Trip takes for a spin
const DOZER_B = { x: -67.5, z: -70.5, h: 0.5 };
// the rampage: south down the 3rd fairway to the green, back up between 3 and 4, round again
const ROUTE = [[-60, -88], [-73, -130], [-77, -182], [-70, -232], [-44, -206], [-37, -142], [-48, -100]];
const PROG = { sigs: 0, damage: 0 }; // for the live objective titles
const PRE = ['c5_vista', 'c5_petition', 'c5_ledger', 'c5_meeting'];
const end = (name, text, title = '') => ({ name, title, text, choices: [{ text: 'Leave', action: () => null }] });
const base = (k) => (g) => { F(g).c5base ||= {}; F(g).c5base[k] = g.state.counters[k] || 0; };
const sigs = (g) => (g.state.counters.c5sigs || 0) - ((F(g).c5base || {}).c5sigs ?? 0);
const night = (g) => { const m = g.state.minutes; return m >= 20 * 60 || m < 6 * 60; };
let set = null; // the set dressing outlives a New Game; it's shown/hidden per save

export const CH5 = [
  {
    id: 'c5_vista', title: 'CHAPTER 5 — Somebody parked bulldozers by the 3rd tee. Find out who.',
    hint: 'Off Fairway Dr, between the clubhouse and the 3rd tee.',
    target: (g) => g.named.trip || TRAILER,
    start: (g) => {
      g.chapter5?.ensure();
      g.after(6, () => g.ui.splash('CHAPTER 5', 'PARADISE PAVED', 4, '#f2b705'));
      g.after(8.5, () => g.ui.toast('📱 Text from Millie: "There are BULLDOZERS on the 3rd tee!! Some slick developer says Palmetto Links is turning into CONDOS. Karen is grinning like she ate the canary AND the cage."', 'quest', 9));
    },
    done: (g) => F(g).c5Met,
    reward: (g) => g.ui.toast('📱 Millie: "A PETITION! I\'ll print the forms. The bylaws say \'a handful\' of signatures forces a public vote. Karen measured her hand. It\'s 8."', 'quest', 8),
  },
  {
    id: 'c5_petition',
    get title() { return `Get 8 residents to sign the Save Palmetto Links petition (${Math.min(8, PROG.sigs)}/8)`; },
    hint: 'Talk to residents anywhere — the clubhouse, the pool, the Golden Garter. Some need convincing (or a beer).',
    start: (g) => { base('c5sigs')(g); g.chapter5?.ensure(); },
    done: (g) => sigs(g) >= 8,
    reward: (g) => {
      g.ui.toast('📱 Millie: "EIGHT! That forces a public hearing. Karen called it \'a clerical catastrophe\' and fainted into a ficus."', 'quest', 8);
      g.after(9, () => g.ui.toast('📱 Lorraine (Golden Garter): "Hon, that developer drinks here every night. Brags his bribe ledger\'s in the safe in his sales trailer. Says the rent-a-cop\'s asleep by ten. Every night."', 'quest', 10));
    },
  },
  {
    id: 'c5_ledger', title: "Break into Trip's sales trailer after dark (8PM–6AM) and crack the safe",
    hint: 'Gary the rent-a-cop naps in a lawn chair out front. Don\'t sprint or rev a cart near him. (Or just bonk him.)',
    target: () => DOOR,
    start: (g) => g.chapter5?.ensure(),
    done: (g) => F(g).c5Ledger,
    reward: (g) => g.ui.toast('📱 Millie: "The HOA zoning meeting is TONIGHT at the clubhouse, 7 to 11. Bring the ledger. I\'m bringing a sheet cake."', 'quest', 8),
  },
  {
    id: 'c5_meeting', title: 'Expose Trip and Karen at the HOA zoning meeting (Clubhouse, 7PM–11PM)',
    hint: 'Walk into the clubhouse during the meeting.',
    target: (g) => g.world.pois.clubhouse,
    start: (g) => g.chapter5?.ensure(),
    done: (g) => F(g).c5Exposed,
  },
  {
    id: 'c5_dozer',
    get title() { return `STOP TRIP! He's bulldozing Palmetto Links. Yank him out of the cab [E] — course wrecked: ${Math.floor(PROG.damage)}%`; },
    hint: 'He only does 11 mph. Pull up alongside, hop out, and grab him.',
    target: (g) => g.chapter5?.rampage,
    start: (g) => g.chapter5?.ensure(),
    done: (g) => F(g).c5Yanked,
    reward: (g) => g.ui.hint('It\'s your bulldozer now. You know where his sales trailer is.', 6),
  },
  {
    id: 'c5_wreck', title: "Drive Trip's bulldozer through Trip's sales trailer",
    hint: 'Full throttle. For the community.',
    target: (g) => (g.player.cart === g.chapter5?.rampage ? TRAILER : g.chapter5?.rampage),
    start: (g) => g.chapter5?.ensure(),
    done: (g) => F(g).c5Wrecked,
    reward: (g) => {
      g.addMoney(3000, 'The Save Palmetto Links fund');
      g.xp('stat', 6);
      g.achievement('paradise');
      g.celebrate?.(24);
      g.ui.splash('CHAPTER 5 COMPLETE', 'Palmetto Links is saved. Trip was last seen hitchhiking to Naples in a pastel sweater. Karen is "between committees."', 8, '#f2b705');
      audio.play('levelup');
      g.after(9, () => g.ui.toast('📱 Millie: "Drinks at the Golden Garter tonight, on ME. Don\'t tell my daughter. Also: you can keep the bulldozer. Nobody knows how to stop you anyway."', 'quest', 9));
    },
  },
];

export function chapter5Started(g, STEPS) {
  const i = STEPS.findIndex((s) => s.id === 'c5_vista');
  return i >= 0 && g.state.quest.step >= i;
}

// ---------------------------------------------------------------- the set (built once)
function buildSet(g) {
  if (set) return set;
  const col = g.world.col;
  const y = heightAt(TRAILER.x, TRAILER.z);
  const T = TRAILER;
  const trailer = new THREE.Group();
  const parts = [];
  const B = (x0, ya, z0, x1, yb, z1, c) => parts.push([GEO.box, c, mat4((x0 + x1) / 2, y + (ya + yb) / 2, (z0 + z1) / 2, 0, x1 - x0, yb - ya, z1 - z0)]);
  const x0 = T.x - T.sx / 2, x1 = T.x + T.sx / 2, z0 = T.z - T.sz / 2, z1 = T.z + T.sz / 2;
  B(x0, 0.55, z0, x1, T.h, z1, '#f4f1e8'); // the box
  B(x0 - 0.02, 1.0, z0 - 0.02, x1 + 0.02, 1.2, z1 + 0.02, '#1f8a8a'); // teal stripe
  B(x0 - 0.02, T.h - 0.05, z0 - 0.02, x1 + 0.02, T.h + 0.08, z1 + 0.02, '#c9c4b5'); // roof edge
  B(x0 + 0.2, 0, z0 + 0.2, x1 - 0.2, 0.56, z1 - 0.2, '#7a7468'); // skirting
  for (const wx of [-4.2, -2.3, 2.3, 4.2]) B(T.x + wx - 0.65, 1.5, z1, T.x + wx + 0.65, 2.5, z1 + 0.04, '#24323a'); // windows
  B(T.x - 0.55, 0.6, z1, T.x + 0.55, 2.7, z1 + 0.05, '#d9d2c0'); // door
  B(T.x + 0.3, 1.6, z1 + 0.05, T.x + 0.38, 1.7, z1 + 0.09, '#c9a227'); // handle
  for (let i = 0; i < 3; i++) B(T.x - 0.8, 0, z1 + 0.25 + i * 0.32, T.x + 0.8, 0.5 - i * 0.17, z1 + 0.57 + i * 0.32, '#8a8f94'); // steps
  B(T.x - 1.4, 2.85, z1, T.x + 1.4, 2.95, z1 + 1.2, '#1f8a8a'); // awning
  B(x1 - 2.4, T.h + 0.08, T.z - 0.5, x1 - 1.2, T.h + 0.8, T.z + 0.5, '#9aa0a6'); // AC unit
  // brochure table + cucumber water out front, Gary's lawn chair, survey stakes with pink ribbons
  parts.push([GEO.box, '#ffffff', mat4(TRIP_DAY.x - 1.3, y + 0.74, TRIP_DAY.z, 0, 1.2, 0.05, 0.6)]);
  for (const dx of [-0.5, 0.5]) parts.push([GEO.cyl, '#bdbdbd', mat4(TRIP_DAY.x - 1.3 + dx, y + 0.37, TRIP_DAY.z, 0, 0.025, 0.74, 0.025)]);
  parts.push([GEO.cyl16, '#cfe8d5', mat4(TRIP_DAY.x - 1.65, y + 0.98, TRIP_DAY.z, 0, 0.12, 0.42, 0.12)]);
  for (let i = 0; i < 6; i++) parts.push([GEO.box, pick(['#1f8a8a', '#f2c94c', '#ffffff']), mat4(TRIP_DAY.x - 1.1 + (i % 3) * 0.16, y + 0.78, TRIP_DAY.z - 0.1 + Math.floor(i / 3) * 0.2, i * 0.2, 0.14, 0.01, 0.2)]);
  parts.push(
    [GEO.box, '#2f9e5b', mat4(CHAIR.x, y + 0.43, CHAIR.z, 0, 0.6, 0.05, 0.55)], // seat webbing
    [GEO.box, '#2f9e5b', mat4(CHAIR.x, y + 0.75, CHAIR.z - 0.32, 0, 0.6, 0.65, 0.05, -0.25)], // back
  );
  for (const dx of [-0.3, 0.3]) for (const dz of [-0.28, 0.28]) parts.push([GEO.cyl, '#c9ced1', mat4(CHAIR.x + dx, y + 0.21, CHAIR.z + dz, 0, 0.018, 0.42, 0.018)]);
  for (let i = 0; i < 12; i++) {
    const sx = -78 + i * 4.4, sz = -76 - (i % 2) * 2.5;
    parts.push([GEO.box, '#c8a46a', mat4(sx, heightAt(sx, sz) + 0.45, sz, 0, 0.05, 0.9, 0.05)]);
    parts.push([GEO.box, '#ff4fa3', mat4(sx + 0.08, heightAt(sx, sz) + 0.82, sz, 0, 0.12, 0.08, 0.01)]);
  }
  // the porta-potty (every construction site has one; this one has a waiting list)
  parts.push([GEO.box, '#2a6fb0', mat4(-46.5, y + 1.15, -63.2, 0.3, 1.1, 2.3, 1.1)], [GEO.box, '#e8e8e8', mat4(-46.5, y + 2.36, -63.2, 0.3, 1.2, 0.12, 1.2)]);
  col.addBoxC(-46.5, -63.2, 1.2, 1.2, 2.4, 'potty');
  const body = new THREE.Mesh(mergeParts(parts.slice(0, 12)), M.vc);
  body.castShadow = true;
  trailer.add(body);
  const props = new THREE.Mesh(mergeParts(parts.slice(12)), M.vc);
  props.castShadow = true;
  g.scene.add(trailer, props);
  const sign = (text, opts, w, h, sx, sy, sz) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: makeSignTexture(text, opts), roughness: 0.7 }));
    m.position.set(sx, sy, sz);
    return m;
  };
  trailer.add(sign('PALMETTO VISTA', { w: 1024, h: 160, bg: '#ffffff', fg: '#1f8a8a', border: '#c9a227', font: 'bold 88px Georgia, serif', sub: 'SALES OFFICE • NOW SELLING', subFont: 'bold 30px sans-serif' }, 5, 0.8, T.x, y + 3.0, z1 + 0.06));
  // the billboard
  const bb = new THREE.Group();
  bb.add(sign('PALMETTO VISTA', { w: 1024, h: 384, bg: '#1f8a8a', fg: '#ffffff', border: '#c9a227', font: 'bold 120px Georgia, serif', sub: 'LUXURY LIVING FOR THE DISCERNING 55+  •  "GOLF COURSE VIEWS!*"', subFont: 'bold 34px sans-serif' }, 8, 3, 0, 4.6, 0.12));
  bb.add(sign('*of where the golf course was. Starting at $1.2M. A Vandermeer Development.', { w: 1024, h: 64, bg: '#ffffff', fg: '#555555', font: 'italic 30px Georgia, serif' }, 8, 0.5, 0, 2.86, 0.12));
  const posts = new THREE.Mesh(mergeParts([[GEO.box, '#5a4a3a', mat4(-2.8, 3, 0, 0, 0.22, 6, 0.22)], [GEO.box, '#5a4a3a', mat4(2.8, 3, 0, 0, 0.22, 6, 0.22)], [GEO.box, '#5a4a3a', mat4(0, 4.4, -0.06, 0, 8.2, 3.6, 0.1)]]), M.vc);
  bb.add(posts);
  bb.position.set(-64, heightAt(-64, -58.5), -58.5);
  g.scene.add(bb);
  for (const dx of [-2.8, 2.8]) col.addCircle(-64 + dx, -58.5, 0.2, 6, 'post');
  // what's left after a D9 goes through it
  const rparts = [];
  for (let i = 0; i < 22; i++) {
    rparts.push([GEO.box, pick(['#f4f1e8', '#f4f1e8', '#1f8a8a', '#7a7468', '#d9d2c0']), mat4(T.x + rand(-6.5, 6.5), y + rand(0.05, 0.5), T.z + rand(-2.6, 2.6), rand(0, 3), rand(0.6, 2.4), rand(0.05, 0.14), rand(0.5, 1.8), rand(-0.4, 0.4), rand(-0.4, 0.4))]);
  }
  rparts.push([GEO.cyl16, '#cfe8d5', mat4(T.x + 2, y + 0.2, T.z + 1.8, 0, 0.14, 0.4, 0.14, Math.PI / 2)]);
  const rubble = new THREE.Mesh(mergeParts(rparts), M.vc);
  rubble.castShadow = true;
  rubble.visible = false;
  g.scene.add(rubble);
  const tcol = col.addBox(x0, z0, x1, z1, T.h, 'building');
  set = { trailer, props, bb, rubble, tcol, y };
  return set;
}

// ---------------------------------------------------------------- the chapter's live state
export class Chapter5 {
  constructor(g, steps) {
    this.g = g;
    this.steps = steps;
    this.dozers = [];
    this.rampage = null;
    this.debris = [];
    this.wp = 0;
    this.barkT = 4;
    this.zzzT = 0;
    this.tick = 0;
    this.tripAt = null;
    this.ensure();
  }

  get started() {
    return chapter5Started(this.g, this.steps);
  }

  // show the construction site (and its people) once the chapter is under way
  ensure() {
    const g = this.g, f = F(g);
    if (!this.started) {
      if (set) { set.trailer.visible = set.props.visible = set.bb.visible = set.rubble.visible = false; set.tcol.h = -1; }
      delete g.world.pois.vista;
      return;
    }
    const s = buildSet(g);
    s.props.visible = s.bb.visible = true;
    s.trailer.visible = !f.c5Wrecked;
    s.rubble.visible = !!f.c5Wrecked;
    s.tcol.h = f.c5Wrecked ? -1 : TRAILER.h;
    g.world.poi('vista', DOOR.x, DOOR.z, f.c5Wrecked ? 'What\'s left of the sales trailer' : 'Palmetto Vista Sales Trailer', 2.2);
    if (!this.dozers.length) {
      for (const [i, d] of [DOZER_A, DOZER_B].entries()) {
        const c = g.addCart({ x: d.x, z: d.z, ry: d.h, kind: 'dozer', color: '#f2b705' });
        c.locked = !(i === 0 && f.c5Yanked); // props until Trip takes one; yours once you take it off him
        this.dozers.push(c);
      }
      this.rampage = this.dozers[0];
    }
  }

  reset() {
    // replaying the chapter from the reviewer shortcut: rebuild the trailer, park the dozers
    const g = this.g;
    for (const d of this.debris) g.scene.remove(d.m);
    this.debris = [];
    this.removeTrip();
    this.removeGary();
    for (const c of this.dozers) {
      if (c.driver && c.driver !== g.player) c.driver.leaveCart?.();
      if (g.player.cart === c) g.player.exitCart();
      g.scene.remove(c.group);
    }
    g.carts = g.carts.filter((c) => !this.dozers.includes(c));
    this.dozers = [];
    this.rampage = null;
    this.wp = 0;
    this.ensure();
  }

  clear() {
    const g = this.g;
    this.removeTrip();
    this.removeGary();
    for (const d of this.debris) g.scene.remove(d.m);
    for (const c of this.dozers) g.scene.remove(c.group);
    g.carts = g.carts.filter((c) => !this.dozers.includes(c));
  }

  // ---------------- people
  spawnTrip(where) {
    const g = this.g;
    this.removeTrip();
    const look = { shirt: 6, sweater: '#f7a1c4', glasses: 'aviator', hair: '#1c1c1c', skin: '#e3995a', belly: 0.95, height: 1.04, shorts: '#e9dcc0', shoe: '#6b4a2a', sock: '#ffffff', mustache: false, combover: false, hat: 'none' };
    const at = where === 'club' && g.club ? null : TRIP_DAY;
    const n = g.spawnNPC({ name: 'Trip Vandermeer', female: false, role: 'developer', x: at ? at.x : 0, z: at ? at.z : 0, state: 'static', hp: 60, dmg: 7, look, homePt: at ? { ...at } : null });
    n.data.quiet = true;
    if (where === 'club' && g.club) {
      g.club.pose(n, 7.0, -3.8, -Math.PI / 2 - 0.6, { y: g.club.b.y0 + 0.67 - 0.86, mode: 'sit' });
      delete n.data.spot; // the club doesn't own him
    } else n.data.face = 0;
    g.named.trip = n;
    this.tripAt = where;
    return n;
  }

  removeTrip() {
    const g = this.g, n = g.named.trip;
    if (n && g.npcs.includes(n)) g.removeNPC(n);
    g.named.trip = null;
    this.tripAt = null;
  }

  spawnGary() {
    const g = this.g;
    if (this.gary && g.npcs.includes(this.gary)) return this.gary;
    const n = g.spawnNPC({ name: 'Gary (Rent-a-Cop)', female: false, role: 'guard', x: CHAIR.x, z: CHAIR.z, state: 'static', hp: 50, dmg: 6, look: { shirt: 2, hat: 'cap', hatColor: '#1d2b53', glasses: 'none', belly: 1.45, hair: '#6b4a2a', mustache: true, badge: true }, homePt: { ...CHAIR } });
    n.data.quiet = true;
    this.gary = n;
    this.sleep(n);
    return n;
  }

  sleep(n) {
    const y = heightAt(CHAIR.x, CHAIR.z);
    n.x = CHAIR.x; n.z = CHAIR.z; n.y = y + 0.45 - 0.86;
    n.data.asleep = true;
    n.data.stand = { t: Infinity, y: n.y, ry: 0, mode: 'sit', act: 'snooze', actDur: 4 };
  }

  wake(n, loud) {
    const g = this.g;
    if (!n.data.asleep) return;
    n.data.asleep = false;
    n.data.awakeT = 25;
    const y = heightAt(CHAIR.x + 1, CHAIR.z + 0.6);
    n.x = CHAIR.x + 1; n.z = CHAIR.z + 0.6; n.y = y;
    n.data.stand = { t: Infinity, y, ry: 0.4, mode: 'idle', act: null };
    n.say(loud ? 'HEY! This is PRIVATE PROPERTY! I have a WHISTLE!' : 'Huh?! Who\'s there?! ...Raccoon? Is that you, Kevin?', 3);
    if (loud) { g.addHeat(0.6, 'Trespassing on a construction site'); audio.play('whistle'); }
  }

  removeGary() {
    const g = this.g;
    if (this.gary && g.npcs.includes(this.gary)) g.removeNPC(this.gary);
    this.gary = null;
  }

  // ---------------- per frame
  update(dt) {
    const g = this.g, f = F(g), p = g.player;
    if (!this.started) return;
    const id = g.quests.current()?.id;
    PROG.sigs = sigs(g);
    PROG.damage = f.c5Damage || 0;
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 1;
      // Trip works the trailer by day and drinks at the Golden Garter by night (until the meeting)
      let want = null;
      if (id === 'c5_vista') want = 'trailer';
      else if (PRE.includes(id)) want = night(g) && g.club ? 'club' : 'trailer';
      else if (id === 'c5_dozer') want = 'dozer';
      const far = (pt) => Math.hypot(p.x - pt.x, p.z - pt.z) > 45;
      const trip = g.named.trip;
      if (want !== 'dozer' && want !== this.tripAt) {
        const leaving = trip ? { x: trip.x, z: trip.z } : null;
        const going = want === 'club' ? { x: 349, z: 146 } : TRIP_DAY;
        if ((!leaving || far(leaving) || !trip.visible) && (!want || far(going))) {
          this.removeTrip();
          if (want) this.spawnTrip(want);
        }
      }
      if (want === 'dozer' && (!trip || trip.cart !== this.rampage) && !f.c5Yanked) this.startRampage(true);
      // Gary minds the site at night until the trailer's gone
      const garyWanted = night(g) && !f.c5Wrecked && (id === 'c5_petition' || id === 'c5_ledger' || id === 'c5_meeting');
      if (garyWanted && !this.gary && far(CHAIR)) this.spawnGary();
      if (!garyWanted && this.gary && far(CHAIR)) this.removeGary();
    }
    this.updateGary(dt);
    if (id === 'c5_dozer') this.updateRampage(dt);
    if (id === 'c5_wreck' && !f.c5Wrecked && p.cart === this.rampage) {
      const c = this.rampage, T = TRAILER;
      const dx = Math.max(Math.abs(c.x - T.x) - T.sx / 2, 0), dz = Math.max(Math.abs(c.z - T.z) - T.sz / 2, 0);
      if (Math.hypot(dx, dz) < c.radius + 0.5 && (c.speed > 1 || c.lastImpact > 0.6)) this.wreck();
    }
    this.updateDebris(dt);
  }

  updateGary(dt) {
    const g = this.g, n = this.gary, p = g.player;
    if (!n || !g.npcs.includes(n)) return;
    if (n.state === 'ko' || n.hostile) return;
    const d = Math.hypot(p.x - n.x, p.z - n.z);
    if (n.data.asleep) {
      this.zzzT -= dt;
      if (this.zzzT <= 0 && d < 40) { this.zzzT = 1.4; g.particles.emit('zzz', n.x, n.y + 2.0, n.z, { vy: 0.45, vx: 0.15, life: 1.6, size: 0.35 }); }
      const c = p.cart;
      const loud = (c && c.speed > 4 && d < 10) || (!c && p.speed > 4.4 && d < 6.5) || (c && g._hornT > 0 && d < 22);
      if (loud) this.wake(n, d < 9);
    } else {
      n.data.awakeT -= dt;
      if (n.data.awakeT <= 0 && d > 8) { n.say('...must\'ve been the wind. *yawn* Five more minutes.', 3); this.sleep(n); }
    }
  }

  startRampage(silent = false) {
    const g = this.g, f = F(g);
    this.ensure();
    const c = this.rampage;
    if (!c) return;
    if (g.player.cart === c) g.player.exitCart();
    if (c.driver && c.driver !== g.player) c.driver.leaveCart();
    const trip = this.spawnTrip('trailer');
    c.locked = false;
    trip.seatIn(c, new Driver(c, 'cruise', { speed: 4.8 }));
    trip.data.chase = { x: ROUTE[0][0], z: ROUTE[0][1] };
    this.wp = 0;
    this.tripAt = 'dozer';
    f.c5Damage ||= 0;
    if (!silent) {
      g.after(1.5, () => g.ui.toast('📱 Millie: "TRIP STOLE HIS OWN BULLDOZER!! He\'s tearing up the 3rd fairway! STOP HIM!!"', 'heat', 8));
      g.after(3, () => g.ui.hint('Catch the dozer, hop out of your cart, and yank Trip out of the cab [E]', 7));
    }
  }

  updateRampage(dt) {
    const g = this.g, f = F(g), c = this.rampage, trip = g.named.trip;
    if (!c || !trip || trip.cart !== c) return;
    const w = ROUTE[this.wp];
    if (Math.hypot(c.x - w[0], c.z - w[1]) < 7) this.wp = this.wp + 1 >= ROUTE.length ? 1 : this.wp + 1;
    const nw = ROUTE[this.wp];
    trip.data.chase = { x: nw[0], z: nw[1] };
    // tearing up the turf
    if (c.speed > 0.8) {
      if (c.z < -52) f.c5Damage = Math.min(100, (f.c5Damage || 0) + dt * 0.85);
      const s = Math.sin(c.heading), co = Math.cos(c.heading);
      c._trackKeys ||= [`${c.id}:TL`, `${c.id}:TR`];
      for (const [k, lx] of [[0, 1.05], [1, -1.05]]) {
        const x = c.x + lx * co - 1.4 * s, z = c.z - lx * s - 1.4 * co;
        g.skids.mark(c._trackKeys[k], x, heightAt(x, z) + 0.01, z, 0.9, 'grass');
      }
      if (Math.random() < dt * 8) g.particles.emit(Math.random() < 0.5 ? 'dust' : 'leaf', c.x + s * 2.3 + rand(-1.2, 1.2), c.y + 0.4, c.z + co * 2.3 + rand(-1.2, 1.2), { vy: rand(0.8, 2.2), vx: rand(-1, 1), vz: rand(-1, 1), life: 1.1, size: 0.5, grow: 0.6, drag: 1 });
    }
    if (Math.random() < dt * 4) g.particles.emit('smoke', c.x + Math.sin(c.heading) * 1.05 + Math.cos(c.heading) * 0.45, c.y + 3.1, c.z + Math.cos(c.heading) * 1.05 - Math.sin(c.heading) * 0.45, { vy: 1.4, life: 1.6, size: 0.45, grow: 1.2, drag: 0.6 });
    this.barkT -= dt;
    if (this.barkT <= 0) {
      this.barkT = rand(5, 8);
      trip.say(pick(['MINE! IT\'S ALL MINE!', 'FORE, SUCKERS!', 'You can\'t stop PROGRESS!', 'I\'m putting a Cheesecake Factory on the 9th green!', 'Do you know what a D9 does to a sand trap?!', 'Karen, baby, I\'m doing this for US!', 'Property values are going UP! The course is going DOWN!']), 2.5);
    }
    const p = g.player;
    if (!p.cart && Math.hypot(p.x - c.x, p.z - c.z) < 9 && !this._yankHint) { this._yankHint = true; g.ui.hint('Get right up next to the tracks and press E to yank Trip out!', 4); }
    if ((f.c5Damage || 0) >= 100 && !g.cut) {
      g.fadeOut(() => {
        f.c5Damage = 0;
        if (c.driver) c.driver.leaveCart();
        Object.assign(c, { x: DOZER_A.x, z: DOZER_A.z, heading: DOZER_A.h, vx: 0, vz: 0, y: heightAt(DOZER_A.x, DOZER_A.z) });
        c.syncMesh(0);
        this.removeTrip();
        this.startRampage(true);
      }, 2.2, 'PALMETTO LINKS: PAVED', 'Trip carved TRIP WAS HERE into the 3rd green. Security towed the dozer back. He\'s already hot-wiring it again. Try again — faster.', '#f2b705');
    }
  }

  // Lee yanked Trip out of the cab (game.carjack calls this for dozers)
  onCarjack(c, drv) {
    const g = this.g, f = F(g);
    if (c !== this.rampage || f.c5Yanked) return;
    f.c5Yanked = true;
    g.ui.splash('YOINK!', 'Trip Vandermeer, evicted from his own bulldozer.', 2.5, '#f2b705');
    g.camRig.addShake(0.4);
    drv.data.chase = null;
    g.after(1.2, () => drv.say(pick(['MY DOZER! I have PERMITS!', 'You can\'t do this! I have a LAWYER! He\'s also my cousin!', 'This is a $400,000 machine, you LUNATIC!']), 3));
    g.after(4, () => {
      if (!g.npcs.includes(drv) || drv.state === 'ko') return;
      drv.state = 'walkTo';
      drv.target = { x: drv.x + 40, z: -40 };
      drv.say('I\'m calling my mother! SHE\'S a lawyer TOO!', 3);
    });
    g.after(16, () => { if (g.named.trip === drv) this.removeTrip(); });
  }

  wreck() {
    const g = this.g, f = F(g), s = set, T = TRAILER, c = this.rampage;
    f.c5Wrecked = true;
    s.trailer.visible = false;
    s.rubble.visible = true;
    s.tcol.h = -1;
    g.world.poi('vista', DOOR.x, DOOR.z, 'What\'s left of the sales trailer', 2.2);
    audio.play('crash', { vol: 1 });
    g.after(0.15, () => audio.play('crash', { vol: 0.8 }));
    g.after(0.35, () => audio.play('thud', { vol: 1 }));
    g.camRig.addShake(1);
    g.achievement('dozer');
    g.particles.burst('dust', T.x, s.y + 1.5, T.z, 70, { speed: 6, up: 4, life: 2, size: 1.1, grow: 1.4, gravity: 1 });
    g.particles.burst('confetti', T.x, s.y + 2, T.z, 90, { speed: 7, up: 9, life: 3, size: 0.32, gravity: 4 }); // ten thousand glossy brochures
    g.particles.burst('cash', T.x, s.y + 2, T.z, 30, { speed: 5, up: 8, life: 2.5, size: 0.3, gravity: 5 });
    // flying panels: they tumble, land, and stay
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const mats = ['#f4f1e8', '#f4f1e8', '#1f8a8a', '#d9d2c0'].map((col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(rand(0.6, 2.2), 0.08, rand(0.5, 1.6)), pick(mats));
      m.position.set(T.x + rand(-5, 5), s.y + rand(1, 3), T.z + rand(-1.5, 1.5));
      m.castShadow = true;
      g.scene.add(m);
      this.debris.push({ m, vx: fx * rand(4, 10) + rand(-3, 3), vy: rand(5, 11), vz: fz * rand(4, 10) + rand(-3, 3), rx: rand(-6, 6), rz: rand(-6, 6), rest: false });
    }
    g.ui.splash('DEMOLISHED', 'Palmetto Vista: never built, briefly sold.', 3, '#f2b705');
  }

  updateDebris(dt) {
    for (const d of this.debris) {
      if (d.rest) continue;
      const m = d.m;
      d.vy -= 16 * dt;
      m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
      m.rotation.x += d.rx * dt; m.rotation.z += d.rz * dt;
      const gy = heightAt(m.position.x, m.position.z) + 0.05;
      if (m.position.y <= gy) {
        m.position.y = gy;
        d.vy *= -0.3; d.vx *= 0.5; d.vz *= 0.5; d.rx *= 0.4; d.rz *= 0.4;
        if (Math.abs(d.vy) < 1) { d.rest = true; m.rotation.x = rand(-0.08, 0.08); m.rotation.z = rand(-0.08, 0.08); }
      }
    }
  }
}

// ---------------------------------------------------------------- dialogue
export function tripNode(g, n) {
  const f = F(g), id = g.quests.current()?.id;
  const title = 'Developer • Vandermeer Development Group • 61 (the youngest man in Sunset Palms)';
  if (!f.c5Met) {
    const met = (text) => () => { f.c5Met = true; audio.play('cash'); return { name: n.name, title, text, choices: [{ text: 'Leave', action: () => null }] }; };
    return {
      name: n.name, title,
      text: '*His teeth are so white they have their own weather system. His sweater is tied over his shoulders like it\'s holding him hostage.*\n\n"Trip Vandermeer, Vandermeer Development. Welcome to the future home of PALMETTO VISTA! Two hundred luxury condominiums for the discerning 55-plus. Golf course views!"\n\n*He gestures at the golf course. The one he\'s about to destroy.*',
      choices: [
        { text: '"Over my dead body."', action: met('"Ha! At your age, pal, that\'s a scheduling issue." *He winks.* "The HOA Zoning Committee already approved it. The residents vote at the zoning meeting, but that\'s a formality. Unless you\'ve got a petition. Which you don\'t."') },
        { text: '"How much for a unit?"', action: met('"For you? One-point-two million. Okay, one-point-three. You look like a man who appreciates a granite countertop."\n\n*He hands you a brochure. On the back, in tiny print: "Rezoning approved by HOA Zoning Committee — Chair: K. Whitmore."*') },
        { text: '"Who approved this?"', check: { label: 'INT', chance: g.chance('intim', 3) }, action: () => {
          if (g.roll('intim', 3)) return met('*He sweats through the spray tan.* "The... Zoning Committee. It\'s a committee of one. Karen. She\'s very... thorough. Very well compensated— I mean COMMITTED. Very committed."')();
          return met('"The proper authorities, pal. The vote\'s just a formality. Run along and enjoy your last few rounds."')();
        } },
      ],
    };
  }
  const lines = {
    c5_petition: ['"A petition? Cute. Nobody at Sunset Palms can SEE the dotted line, let alone sign it."', '"Have a brochure. Have two. They\'re biodegradable. Like this golf course."'],
    c5_ledger: ['"My office? Locked up tight, pal. And Gary\'s on the night shift. Gary NEVER sleeps." *Gary is visibly asleep in the background.*', '"Rex at the Golden Garter says hi. Rex says I tip better than you. Rex is right."'],
    c5_meeting: ['"See you at the zoning meeting, grandpa. Bring a hanky."', '"Karen and I are VERY excited about the vote. Karen\'s excited about a lot of things lately. New teeth."'],
  };
  if (n.data.stand && n.data.stand.mode === 'sit') return end(n.name, pick(['"Another round for the house! Put it on Vandermeer Development!" *He winks at Rex. Rex winks back, professionally.*', '"Do you know who I am? I\'m about to be the guy who owns that golf course. Lorraine! Two more!"', '"You again? Pal, this is a gentlemen\'s club. Go home." *He throws a hundred at Bunny. She catches it with her teeth.*']), 'Developer, off the clock');
  return end(n.name, pick(lines[id] || ['"Palmetto Vista. Luxury living. Coming soon."']), title);
}

export function garyNode(g, n) {
  if (n.data.asleep) {
    return {
      name: n.name, title: 'Night Security • Vigilant Since 9:58 PM',
      text: '*He\'s out cold. A string of drool connects his chin to his badge. His walkie-talkie is quietly playing smooth jazz. A half-eaten Hot Pocket rests on his belly, rising and falling.*',
      choices: [
        { text: 'Draw a mustache on him with a Sharpie', action: () => { g.xp('stat', 0.5); n.data.drawn = true; return end(n.name, '*You give him a magnificent handlebar mustache. He already had a mustache. Now he has two. He smiles in his sleep.*'); } },
        { text: 'Eat the rest of his Hot Pocket', action: () => { g.player.hp = Math.min(g.maxHp(), g.player.hp + 8); return end(n.name, '*Lukewarm. Pepperoni. Delicious. You feel like a thief. You ARE a thief.*'); } },
        { text: 'Tiptoe away', action: () => null },
      ],
    };
  }
  return end(n.name, pick(['"This is a CONSTRUCTION SITE, sir. No looky-loos. I have a whistle AND a flashlight."', '"Mr. Vandermeer pays me twelve dollars an hour to stay awake. I\'m giving him about nine dollars of effort."']), 'Night Security');
}

export function vistaNode(g) {
  const f = F(g), id = g.quests.current()?.id;
  if (f.c5Wrecked) return end('Palmetto Vista (former) Sales Office', '*Particleboard, a busted water cooler and ten thousand glossy brochures. A seagull is sitting on what\'s left of the scale model, looking pleased with itself.*');
  if (!night(g)) {
    return {
      name: 'Palmetto Vista Sales Office', title: 'Open 9 to 5 • "Ask about our pre-construction pricing!"',
      text: '*Cucumber water. A scale model of Palmetto Vista with a tiny bronze Karen in the fountain. Brochures: "LUXURY LIVING FOR THE DISCERNING 55+. Golf course views!*" (*of where the golf course was)*' + (id === 'c5_ledger' ? '\n\nTrip\'s in and out all day. The safe is behind his desk. Come back after dark, when it\'s just the rent-a-cop.' : ''),
      choices: [
        { text: 'Drink the cucumber water', action: () => { g.player.hp = Math.min(g.maxHp(), g.player.hp + 5); return end('Cucumber Water', '*It tastes like a spa owes you money.* (+5 health)'); } },
        { text: 'Leave', action: () => null },
      ],
    };
  }
  if (id !== 'c5_ledger' || f.c5Ledger) return end('Palmetto Vista Sales Office', '*Locked up for the night. A $4 padlock and a sign: "TRESPASSERS WILL BE PROSECUTED (BY GARY)."*');
  const gary = g.chapter5?.gary;
  if (gary && !gary.data.asleep && gary.state !== 'ko' && g.npcs.includes(gary)) return end('Palmetto Vista Sales Office', '*Gary\'s awake, pacing with a flashlight and humming the Jeopardy theme. Give him a minute to nod off.*');
  return {
    name: 'Palmetto Vista Sales Office', title: 'After hours',
    text: '*The padlock comes off with one twist. It was not locked. Inside: a desk, a framed photo of Trip shaking hands with Karen (both holding a giant check), and a Mosler safe with a sticky note on it: "NOT THE LEDGER — T.V."*',
    choices: [
      { text: 'Crack the safe', tag: 'listen for the click', action: () => {
        g.startMinigame('safe', { time: 55, onDone: (ok) => {
          if (ok) g.ui.openDialogue(ledgerNode(g));
          else g.ui.toast('🔐 Gary snorts in his sleep and you freeze. Try the safe again.', 'heat', 4);
        } });
        g.ui.closeDialogue();
        return 'keep';
      } },
      { text: 'Leave', action: () => null },
    ],
  };
}

function ledgerNode(g) {
  const f = F(g);
  const take = (cash) => () => {
    f.c5Ledger = true;
    g.xp('intim', 2);
    if (cash) { g.addMoney(2000, '"petty cash"'); g.addHeat(1.2, 'Burglary of a sales office'); }
    audio.play('success');
    return end('The Ledger', cash ? '*Ledger under one arm, two grand in the other. Gary snores on. Somewhere, a bulldozer weeps.*' : '*Just the ledger. You\'re not a thief. You\'re a whistleblower who got in through an unlocked door.*');
  };
  return {
    name: "Trip's Ledger", title: 'Vandermeer Development • "Consulting" expenses',
    text: '*A leather ledger, and inside it, in Trip\'s loopy handwriting:*\n\nK. WHITMORE — $25,000 — "zoning consulting"\nK. WHITMORE — $4,100 — "veneers"\nK. WHITMORE — $612 — "racing jacket for Buck (vintage)"\nGARY — $50 — "nap fund"\nCOUNTY INSPECTOR — 1 timeshare week — "look the other way"\n\n*Under it all: a fat envelope labeled PETTY CASH.*',
    choices: [
      { text: 'Take the ledger', tag: 'HERO', action: take(false) },
      { text: 'Take the ledger AND the petty cash', tag: `+${money(2000)} • heat`, tagCls: 'bad', action: take(true) },
    ],
  };
}

// the clubhouse gets a meeting option while it's that step
export function meetingChoices(g) {
  if (g.quests.current()?.id !== 'c5_meeting') return [];
  const h = g.state.minutes / 60;
  const open = h >= 19 && h < 23;
  return [{ text: '🏛️ Attend the HOA zoning meeting', tag: open ? 'happening now' : 'tonight 7PM–11PM', tagCls: open ? '' : 'bad', disabled: !open, action: () => meeting1(g) }];
}

const MTG = 'The HOA Zoning Meeting';
function meeting1(g) {
  const name = g.state.name;
  return {
    name: MTG, title: 'Clubhouse Ballroom • folding chairs • one sheet cake',
    text: '*Sixty residents, forty oxygen tanks, one sheet cake. Karen is at the podium with a gavel she bought online. Trip Vandermeer stands beside a scale model of Palmetto Vista, flashing teeth that could guide ships to shore.*\n\nKaren: "All in favor of rezoning Palmetto Links as a luxury condominium community, say aye—"',
    choices: [
      { text: 'Stand on your chair: "OBJECTION!"', action: () => meeting2(g, `"This isn't a courtroom, ${name}. Get OFF the chair. That chair is HOA property."`) },
      { text: '"Point of order, Madam Chair." (You\'ve watched a LOT of C-SPAN.)', action: () => meeting2(g, `"The chair does not recognize Mr. ${name}. The chair has never recognized Mr. ${name}."`) },
    ],
  };
}

function meeting2(g, karen) {
  return {
    name: MTG, title: 'Karen does not want to hear it',
    text: `Karen: ${karen}`,
    choices: [{ text: '📝 Slap the petition on the podium (8 signatures)', action: () => meeting3(g) }],
  };
}

function meeting3(g) {
  return {
    name: MTG, title: 'Bylaws, Section 9(c)',
    text: '*Mabel Crenshaw reads the bylaws aloud, slowly, with commentary: eight signatures forces a full public vote. Karen turns the color of a boiled shrimp.*\n\nTrip, all teeth: "Folks, folks. Signatures, schmignatures. Palmetto Vista means property values UP and the 18th hole becomes a beautiful three-story parking structure. Honestly — who here even GOLFS?"\n\n*Every hand in the room goes up. Two of them are holding putters.*',
    choices: [
      { text: '🎤 Give a speech about the 9th hole', check: { label: 'CHA', chance: g.chance('cha', 5) }, action: () => {
        const ok = g.roll('cha', 5);
        if (ok) g.xp('cha', 2);
        return {
          name: MTG, title: ok ? 'There isn\'t a dry eye in the house' : 'Some polite coughing',
          text: ok ? '"The 9th hole is where Earl got his only hole-in-one. Where Doris and Walt had their first kiss. Where I buried my first wife\'s cat, Mr. Pickles. You want to put a PARKING GARAGE on Mr. Pickles?"\n\n*Sixty people gasp. Doris is weeping. Earl is weeping. Earl doesn\'t know why.*' : '"The 9th hole is... it\'s got... grass. And a flag. A good flag."\n\n*Someone\'s oxygen tank beeps. It\'s the only response.*',
          choices: [{ text: '📖 Now read Trip\'s ledger aloud', action: () => meeting4(g) }],
        };
      } },
      { text: '📖 Read Trip\'s ledger aloud', action: () => meeting4(g) },
    ],
  };
}

function meeting4(g) {
  g.state.flags.karenDisgraced = true;
  return {
    name: MTG, title: 'You clear your throat',
    text: '"K. Whitmore: twenty-five thousand dollars, zoning consulting. K. Whitmore: four thousand one hundred, veneers. K. Whitmore: six hundred and twelve dollars, racing jacket for Buck, vintage."\n\n*Sixty heads turn toward Karen. Forty oxygen tanks hiss at once. Officer Dale, in the back, quietly puts down his sheet cake.*\n\nKaren: "...I can explain. The veneers were for the COMMUNITY."',
    choices: [{ text: '"I call the question. Let\'s VOTE."', action: () => meeting5(g) }],
  };
}

function meeting5(g) {
  g.state.hoa.votes = (g.state.hoa.votes || 0) + 20;
  g.xp('stat', 4);
  return {
    name: MTG, title: '59 to 1',
    text: '*The vote: fifty-nine to one against rezoning. The one is Karen. Officer Dale escorts her out, still clutching her clipboard. The room gives you a standing ovation (the ones who can stand).*\n\n*Then a pencil snaps. Trip Vandermeer is shaking.*\n\n"You think a VOTE stops Trip Vandermeer? I\'ve got PERMITS. I\'ve got a D9. And I\'ve got NOTHING LEFT TO LOSE!"\n\n*He sprints out the side door toward the 3rd tee, sweater flapping like a pastel cape.*',
    choices: [{ text: '🚨 After him!', action: () => { F(g).c5Exposed = true; g.chapter5?.startRampage(); return null; } }],
  };
}

// a "Save Palmetto Links" petition option for anyone you chat with while it's that step
const SIGN_YES = [
  '"Bulldoze the golf course? Where would I go to avoid my wife?" *signs*',
  '"I\'ve lost four hundred balls on the 3rd hole. Those are MY balls. Gimme that pen." *signs*',
  '"Condos?! I moved here to get AWAY from people!" *signs in shaky cursive*',
  '"Karen\'s for it? Then I\'m against it." *signs twice. You let it count once.*',
  '"My late husband\'s ashes are in the bunker on 7. Don\'t ask." *signs*',
  '"I don\'t even golf. But I hate change. And I hate Trip\'s teeth." *signs*',
];
export function addPetition(g, n, node) {
  if (g.quests.current()?.id !== 'c5_petition' || n.data.signed || !node || !node.choices) return;
  if (!['resident', 'clubber', 'golfer', 'fisher', 'lady', 'recruit', 'dancer', 'patron'].includes(n.role)) return;
  const sign = (text) => {
    n.data.signed = true;
    g.state.counters.c5sigs = (g.state.counters.c5sigs || 0) + 1;
    PROG.sigs = sigs(g);
    audio.play('pickup');
    g.ui.toast(`📝 Petition signatures: ${Math.min(8, sigs(g))}/8`, 'quest', 3);
    return end(n.name, text, 'Signed!');
  };
  node.choices.unshift({ text: '📝 "Sign my petition to save Palmetto Links?"', action: () => {
    if (n.role === 'dancer') return sign(pick(['"Honey, I\'ve signed worse things on this stage." *signs with a flourish and a lipstick kiss*', '"Save the golf course? That\'s where all my best customers nap." *signs*']));
    if (chance(0.55 + g.state.stats.cha.lvl * 0.04)) return sign(pick(SIGN_YES));
    return {
      name: n.name, title: 'Not so fast',
      text: pick(['"I don\'t sign anything without my reading glasses. And I can\'t find my reading glasses."', '"The last petition I signed, I ended up married for thirty years."', '"What\'s in it for me? I\'m seventy-nine. I want something NOW."']),
      choices: [
        ...(g.state.inv.beer > 0 ? [{ text: 'Sweeten the deal with a cold one 🍺', tag: `you have ${g.state.inv.beer}`, action: () => { g.state.inv.beer--; audio.play('canOpen'); return sign('*Cracks it open, signs with the other hand.* "Now THAT\'S democracy."'); } }] : []),
        { text: '"Karen supports the condos."', check: { label: 'CHA', chance: g.chance('cha', 2) }, action: () => (g.roll('cha', 2) ? sign('"KAREN supports it?! Give me that pen. GIVE IT."') : end(n.name, '"Karen? Karen who? I don\'t follow politics."')) },
        { text: 'Never mind', action: () => null },
      ],
    };
  } });
}

export function resetChapter5(g) {
  const f = F(g);
  for (const k of ['c5Met', 'c5base', 'c5Ledger', 'c5Exposed', 'c5Yanked', 'c5Wrecked', 'c5Damage']) delete f[k];
  delete g.state.flags.gazVista;
  delete g.state.flags.gazKaren;
  delete g.state.flags.karenDisgraced;
  g.chapter5?.reset();
}

