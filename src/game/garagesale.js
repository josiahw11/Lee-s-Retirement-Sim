// Garage Sale Saturdays (8AM–2PM): four neighbors drag folding tables of junk into their driveways.
// Buy it, haggle for it (CHA), or just take it (crime). Some of the junk is actually useful.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { HOUSES } from '../world/layout.js';
import { heightAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { pick, rand, money, mulberry32 } from '../core/utils.js';
import { makeSignTexture } from '../gfx/textures.js';

let SIGN_MAT = null;

const OPEN = 8, CLOSE = 14;
// what's for sale; `give` returns a description of what you got
const ITEMS = [
  { id: 'iron', name: "Late husband's 7-iron", price: 60, icon: '🏑', mesh: 'club', give: (g) => { const s = g.state; if (!s.weapons.includes('iron')) { s.weapons.push('iron'); return 'A 7-Iron joins your bag.'; } g.addMoney(90, 'resold the 7-iron to Gus'); return 'You already own one. You flip it to Gus for $90.'; } },
  { id: 'shirts', name: 'Box of Hawaiian shirts', price: 25, icon: '👕', mesh: 'box', give: (g) => { const w = g.state.wardrobe.shirt; const n = [0, 1, 2, 3, 4, 5, 6, 7].find((i) => !w.includes(i)); if (n !== undefined) { w.push(n); return 'A new Hawaiian shirt for your wardrobe (change at home).'; } g.xp('stat', 1); return 'All shirts you own. You wear two at once anyway. +Status'; } },
  { id: 'schlitz', name: 'Six-pack of warm Schlitz (1994)', price: 5, icon: '🍺', mesh: 'cans', give: (g) => { g.state.inv.beer += 6; return '+6 beers. Vintage.'; } },
  { id: 'vhs', name: "VHS: 'Sweatin' to the Oldies'", price: 3, icon: '📼', mesh: 'vhs', give: (g) => { g.xp('str', 2); return 'You watch it in one sitting. +STR'; } },
  { id: 'werthers', name: "Jar of loose Werther's", price: 4, icon: '🍬', mesh: 'jar', give: (g) => { g.player.hp = g.maxHp(); return 'Fully healed. Mostly by sugar.'; } },
  { id: 'speakers', name: 'Bass speakers ("fell off a cart")', price: 180, icon: '🔊', mesh: 'speaker', give: (g) => { const c = g.playerCart; if (!c.upgrades.speakers) { c.upgrades.speakers = true; g.state.cart.upgrades.speakers = true; c.rebuild(); return 'Installed on your cart. Rattles dentures within 30 ft.'; } g.addMoney(250, 'resold the speakers'); return 'You already have speakers. Sal buys these for $250.'; } },
  { id: 'detector', name: 'Metal detector (works... mostly)', price: 90, icon: '🔍', mesh: 'detector', give: (g) => { if (!g.state.owned.detector) { g.state.owned.detector = true; return 'Metal detector acquired! Go beep on Boca Beach.'; } g.addMoney(120, 'resold the detector'); return 'You already have one. The bait shack gives you $120 for it.'; } },
  { id: 'clown', name: 'Porcelain clown (probably haunted)', price: 12, icon: '🤡', mesh: 'clown', give: (g) => { g.xp('intim', 2); return 'You put it on your porch. Nobody knocks anymore. +INT'; } },
  { id: 'teeth', name: 'Dentures, gently used', price: 2, icon: '🦷', mesh: 'teeth', give: () => 'Why did you buy these. They are in your pocket now. Forever.' },
  { id: 'lamp', name: 'Swag lamp (1971)', price: 15, icon: '💡', mesh: 'lamp', give: (g) => { g.xp('stat', 1); return 'Groovy. +Status'; } },
];

let GEOS = null;
function itemGeo(kind) {
  GEOS ||= {
    club: mergeParts([[GEO.cyl, '#bfc5ca', mat4(0, 0.35, 0, 0, 0.012, 0.8, 0.012, 1.3)], [GEO.box, '#aeb6be', mat4(0.38, 0.12, 0, 0, 0.1, 0.06, 0.02, 0, 0.3)]]),
    box: mergeParts([[GEO.box, '#b08654', mat4(0, 0.12, 0, 0, 0.45, 0.24, 0.32)], [GEO.box, '#ff6fa8', mat4(0, 0.25, 0, 0, 0.35, 0.03, 0.25)]]),
    cans: mergeParts([0, 1, 2, 3, 4, 5].map((i) => [GEO.cyl, i % 2 ? '#c9d3db' : '#d9a520', mat4((i % 3) * 0.08 - 0.08, 0.07, Math.floor(i / 3) * 0.08, 0, 0.035, 0.12, 0.035)])),
    vhs: mergeParts([0, 1, 2].map((i) => [GEO.box, ['#222', '#1f4fa8', '#b8323a'][i], mat4(0, 0.02 + i * 0.03, 0, i * 0.2, 0.19, 0.028, 0.1)])),
    jar: mergeParts([[GEO.cyl16, '#cfe8f5', mat4(0, 0.1, 0, 0, 0.08, 0.2, 0.08)], [GEO.cyl16, '#d9a520', mat4(0, 0.09, 0, 0, 0.07, 0.15, 0.07)], [GEO.cyl16, '#c9a66b', mat4(0, 0.21, 0, 0, 0.085, 0.03, 0.085)]]),
    speaker: mergeParts([[GEO.box, '#111', mat4(0, 0.16, 0, 0, 0.26, 0.32, 0.22)], [GEO.cyl16, '#555', mat4(0, 0.16, 0.115, 0, 0.09, 0.01, 0.09, Math.PI / 2)]]),
    detector: mergeParts([[GEO.cyl, '#555', mat4(0, 0.03, 0, 0, 0.012, 0.7, 0.012, Math.PI / 2 - 0.1)], [GEO.cyl16, '#2a2a2a', mat4(0, 0.02, 0.36, 0, 0.12, 0.02, 0.12)]]),
    clown: mergeParts([[GEO.sph, '#f4f1ea', mat4(0, 0.12, 0, 0, 0.09, 0.12, 0.08)], [GEO.sph, '#f4f1ea', mat4(0, 0.3, 0, 0, 0.08, 0.08, 0.08)], [GEO.cone, '#e84a5f', mat4(0, 0.42, 0, 0, 0.05, 0.14, 0.05)], [GEO.sph, '#e84a5f', mat4(0, 0.3, 0.075, 0, 0.02, 0.02, 0.02)]]),
    teeth: mergeParts([[GEO.sph, '#f4f1ea', mat4(0, 0.03, 0, 0, 0.06, 0.03, 0.05)], [GEO.sph, '#e8828a', mat4(0, 0.015, 0, 0, 0.065, 0.02, 0.055)]]),
    lamp: mergeParts([[GEO.cyl, '#d9a520', mat4(0, 0.2, 0, 0, 0.012, 0.4, 0.012)], [GEO.cone, '#ff9ec7', mat4(0, 0.42, 0, 0, 0.12, 0.14, 0.12)], [GEO.cyl16, '#d9a520', mat4(0, 0.01, 0, 0, 0.08, 0.02, 0.08)]]),
    table: mergeParts([[GEO.box, '#e8e0d0', mat4(0, 0.72, 0, 0, 1.8, 0.04, 0.75)], ...[[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]].map(([x, z]) => [GEO.cyl, '#9aa0a6', mat4(x, 0.36, z, 0, 0.02, 0.72, 0.02)])]),
    sign: mergeParts([[GEO.cyl, '#6b4a2a', mat4(0, 0.5, 0, 0, 0.025, 1.0, 0.025)], [GEO.box, '#f2c94c', mat4(0, 1.0, 0, 0, 0.7, 0.45, 0.02)]]),
  };
  return GEOS[kind];
}

export class GarageSales {
  constructor(g) {
    this.g = g;
    this.sales = [];
    this.day = -1;
  }

  update() {
    const g = this.g;
    const s = g.state;
    const h = s.minutes / 60;
    const on = s.dow === 5 && h >= OPEN && h < CLOSE;
    if (on && this.day !== s.day) this.open();
    else if (!on && this.sales.length) this.close();
  }

  open() {
    const g = this.g;
    this.close();
    this.day = g.state.day;
    const rnd = mulberry32(777 + g.state.day);
    if (!g.state.garage || g.state.garage.day !== g.state.day) g.state.garage = { day: g.state.day, sold: [] };
    const soldKeys = g.state.garage.sold;
    const houses = HOUSES.filter((h) => h.owner !== 'player' && h.lawn);
    const picks = [];
    while (picks.length < 4) { const h = houses[Math.floor(rnd() * houses.length)]; if (!picks.includes(h)) picks.push(h); }
    for (const [si, h] of picks.entries()) {
      // table on the lawn between the walk and the street, facing the road
      const f = h.facing;
      const fx = Math.sin(f), fz = Math.cos(f);
      const cx = h.lawn.x + fx * 1.5, cz = h.lawn.z + fz * 1.5;
      const group = new THREE.Group();
      const y = heightAt(cx, cz);
      group.position.set(cx, y, cz);
      group.rotation.y = f;
      const table = new THREE.Mesh(itemGeo('table'), M.vc);
      table.castShadow = true;
      group.add(table);
      const stock = [];
      const pool = [...ITEMS];
      for (let i = 0; i < 4; i++) {
        const it = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
        const m = new THREE.Mesh(itemGeo(it.mesh), M.vc);
        m.position.set(-0.65 + i * 0.43, 0.74, (i % 2) * 0.12 - 0.06);
        m.rotation.y = rnd() * 0.8 - 0.4;
        m.castShadow = true;
        group.add(m);
        const key = `${si}:${i}`, sold = soldKeys.includes(key);
        m.visible = !sold;
        stock.push({ ...it, mesh: m, key, price: Math.max(1, Math.round(it.price * (0.8 + rnd() * 0.5))), sold });
      }
      const sign = new THREE.Mesh(itemGeo('sign'), M.vc);
      sign.position.set(2.2, 0, 2.6);
      group.add(sign);
      SIGN_MAT ||= new THREE.MeshStandardMaterial({ map: makeSignTexture('GARAGE SALE', { bg: '#f2c94c', fg: '#b8323a', font: 'bold 78px "Comic Sans MS", cursive', sub: 'SAT 8-2 • CASH ONLY', subFont: 'bold 30px sans-serif', w: 512, h: 256 }), roughness: 0.8 });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.43), SIGN_MAT);
      face.position.set(2.2, 1.0, 2.612);
      group.add(face);
      g.scene.add(group);
      const sx = cx + fz * -1.3 - fx * 0.9, sz = cz - fx * -1.3 - fz * 0.9;
      const seller = g.spawnNPC({ female: rnd() < 0.6, role: 'seller', x: sx, z: sz, state: 'static', look: { hat: rnd() < 0.5 ? 'visor' : 'sunhat' }, homePt: { x: sx, z: sz } });
      seller.data.face = f;
      seller.data.quiet = true;
      const sale = { house: h, group, stock, seller, face, x: cx, z: cz };
      seller.data.sale = sale;
      this.sales.push(sale);
    }
    g.ui.toast('🏷️ It\'s Saturday: GARAGE SALES on four driveways until 2PM. One man\'s junk is another man\'s... also junk.', 'quest', 7);
  }

  close() {
    const g = this.g;
    for (const s of this.sales) {
      g.scene.remove(s.group);
      s.face.geometry.dispose();
      if (g.npcs.includes(s.seller)) g.removeNPC(s.seller);
    }
    this.sales = [];
  }

  clear() { this.close(); }
}

// the seller's table as a dialogue
export function sellerNode(g, n) {
  const sale = n.data.sale;
  if (!sale) return null;
  const left = sale.stock.filter((i) => !i.sold);
  const take = (it, paid, how) => {
    it.sold = true;
    it.mesh.visible = false;
    if (g.state.garage) g.state.garage.sold.push(it.key);
    const got = it.give(g);
    g.state.counters.garageBuys = (g.state.counters.garageBuys || 0) + 1;
    if (g.state.counters.garageBuys >= 6) g.achievement('picker');
    audio.play(paid ? 'buy' : 'pickup');
    return { name: n.name, title: how, text: `${it.icon} ${it.name}${paid ? ` — ${money(paid)}` : ''}\n\n${got}`, choices: [{ text: 'Keep browsing', action: () => sellerNode(g, n) }, { text: 'Leave', action: () => null }] };
  };
  return {
    name: n.name, title: 'Garage Sale • everything must go (they mean it)',
    text: left.length ? pick(['"Everything\'s priced to move. My kids are putting me in a smaller place."', '"Cash only. No returns. No questions. Especially about the clown."', '"My late husband\'s stuff. He\'d want it to go to a good home. Or yours."']) : '"You cleaned me out! Come back next Saturday. I\'ll find more junk in the attic."',
    choices: [
      ...left.map((it) => ({
        text: `${it.icon} ${it.name}`, tag: money(it.price), disabled: g.state.money < Math.ceil(it.price * 0.6),
        action: () => ({
          name: n.name, title: `${it.icon} ${it.name}`,
          text: `"That's ${money(it.price)}. It's worth twice that. It was my husband's. Or my first husband's. One of them."`,
          choices: [
            { text: `Pay ${money(it.price)}`, disabled: g.state.money < it.price, action: () => { g.spend(it.price); return take(it, it.price, 'Sold!'); } },
            { text: `"How about ${money(Math.ceil(it.price * 0.6))}?"`, check: { label: 'CHA', chance: g.chance('cha', 3) }, disabled: g.state.money < Math.ceil(it.price * 0.6), action: () => {
              if (g.roll('cha', 3)) { const p = Math.ceil(it.price * 0.6); g.spend(p); return take(it, p, 'Haggled!'); }
              return { name: n.name, title: 'Nope', text: '"Absolutely not. Do I look like I was born yesterday? I was born in 1944."', choices: [{ text: 'Back', action: () => sellerNode(g, n) }] };
            } },
            { text: '*Pocket it while they look away*', tag: 'crime', check: { label: 'CHA', chance: g.chance('cha', 4) }, action: () => {
              if (!g.roll('cha', 4)) { // she turned around at exactly the wrong moment
                n.say('THIEF! I SAW THAT!', 2);
                g.addHeat(0.6, 'Garage sale shoplifting');
                g.crime(g.player.x, g.player.z, 0.2, 'Garage sale shoplifting', 14);
              }
              return take(it, 0, 'Five-finger discount');
            } },
            { text: 'Back', action: () => sellerNode(g, n) },
          ],
        }),
      })),
      { text: 'Leave', action: () => null },
    ],
  };
}

export { rand };
