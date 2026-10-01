// HONEST ABE'S PRE-OWNED CARTS, next to Sal's. Three showroom models on the lot (test drives welcome —
// they're club carts, nobody calls Security): the Stretch, the Beach Buggy and the Hearse. Buy one and it
// becomes your cart (Sal's mods carry over); swap between the ones you own for free.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { heightAt } from '../world/terrain.js';
import { makeSignTexture } from '../gfx/textures.js';
import { audio } from '../core/audio.js';
import { pick, money } from '../core/utils.js';

export const MODELS = {
  classic: { name: 'Club Car Classic', price: 0, color: '#ffffff', blurb: 'The one you came with. Reliable. Beige at heart.' },
  buggy: { name: 'Beach Buggy', price: 1800, color: '#ff6b1a', blurb: 'Roll cage, fat tires, no roof. Sand, grass, Karen\'s petunias — it doesn\'t care.' },
  stretch: { name: 'The Stretch', price: 2500, color: '#f4f4f4', blurb: 'Seats the whole bridge club. Turns like a cruise ship. Shuttle passengers tip 50% more.' },
  hearse: { name: 'The Hearse', price: 3200, color: '#111111', blurb: '"Pre-owned. Previous owner no longer needs it." Fastest thing on the lot. Nobody tailgates a hearse.' },
};
const LOT = { x: -214, z: 42 };
const SPOTS = { buggy: -219, stretch: -214, hearse: -209 };
const ABE = { x: -212, z: 49.5 };
const NEW_SPOT = { x: -208.2, z: 50.8, ry: Math.PI / 2 }; // the curb beside Abe, nose toward Pelican Way
let lotBuilt = false;

export class Dealership {
  constructor(g) {
    this.g = g;
    this.buildLot();
    this.abe = g.spawnNPC({ name: 'Honest Abe Lindqvist', female: false, role: 'dealer', x: ABE.x, z: ABE.z, state: 'static', look: { hat: 'fedora', hatColor: '#6b3a1f', shirt: 4, glasses: 'aviator', mustache: true, belly: 1.3, hair: '#dcdcdc' }, homePt: { x: ABE.x, z: ABE.z } });
    this.abe.data.face = 0;
    this.abe.data.quiet = true;
    this.display = {};
    for (const [m, x] of Object.entries(SPOTS)) {
      const c = g.addCart({ x, z: LOT.z, ry: 0, kind: 'club', model: m, color: MODELS[m].color, upgrades: m === 'hearse' ? { rims: true } : {} });
      c.home = { x, z: LOT.z };
      this.display[m] = c;
    }
    const st = g.state.cart;
    st.model ||= 'classic';
    st.owned ||= ['classic'];
  }

  buildLot() {
    if (lotBuilt) return;
    lotBuilt = true;
    const g = this.g, y = heightAt(LOT.x, LOT.z);
    const parts = [];
    // a patch of asphalt, bunting on two poles, and a price sign per cart
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(17, 13).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95 }));
    pad.position.set(LOT.x, y + 0.035, LOT.z + 1);
    pad.receiveShadow = true;
    g.scene.add(pad);
    for (const x of [LOT.x - 8.2, LOT.x + 8.2]) parts.push([GEO.cyl, '#cfcfcf', mat4(x, y + 2.6, LOT.z - 3.8, 0, 0.07, 5.2, 0.07)]);
    const cols = ['#e84a5f', '#f2c94c', '#23408e', '#ffffff', '#2f9e5b'];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, x = LOT.x - 8.2 + u * 16.4, sag = Math.sin(u * Math.PI) * 0.6;
      parts.push([GEO.cone, cols[i % cols.length], mat4(x, y + 4.8 - sag, LOT.z - 3.8, 0, 0.22, 0.4, 0.02, Math.PI), 0.05]);
    }
    const mesh = new THREE.Mesh(mergeParts(parts), M.vc);
    mesh.castShadow = true;
    g.scene.add(mesh);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.3), new THREE.MeshStandardMaterial({ map: makeSignTexture('HONEST ABE\'S PRE-OWNED CARTS', { bg: '#23408e', fg: '#f2c94c', font: 'bold 44px Impact, sans-serif', sub: 'WE FINANCE (WE DO NOT FINANCE)', subFont: 'bold 24px sans-serif', w: 1024, h: 160 }), roughness: 0.7 }));
    banner.position.set(LOT.x, y + 3.3, LOT.z - 3.85);
    g.scene.add(banner);
    for (const [m, x] of Object.entries(SPOTS)) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.55), new THREE.MeshStandardMaterial({ map: makeSignTexture(money(MODELS[m].price), { bg: '#ffffff', fg: '#b8323a', font: 'bold 70px Impact, sans-serif', sub: MODELS[m].name.toUpperCase(), subFont: 'bold 22px sans-serif', w: 256, h: 96, border: '#b8323a' }), roughness: 0.8 }));
      s.position.set(x + 1.2, y + 1.6, LOT.z + 1.9);
      g.scene.add(s);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.35, 0.06), new THREE.MeshStandardMaterial({ color: 0x777777 }));
      post.position.set(x + 1.2, y + 0.67, LOT.z + 1.88);
      g.scene.add(post);
    }
  }

  // test-drive carts find their way home once nobody's looking
  update() {
    const g = this.g, p = g.player;
    for (const c of Object.values(this.display)) {
      if (c.driver || c.sunk || Math.hypot(c.x - c.home.x, c.z - c.home.z) < 3) continue;
      if (Math.hypot(p.x - c.x, p.z - c.z) > 60 && Math.hypot(p.x - c.home.x, p.z - c.home.z) > 60) {
        c.x = c.home.x; c.z = c.home.z; c.y = heightAt(c.x, c.z); c.heading = 0; c.vx = c.vz = 0; c.syncMesh(0);
      }
    }
  }

  // make `m` the player's cart (bought or swapped): the old one goes back on Abe's lot and a brand-new
  // one rolls out right beside him, with Lee already behind the wheel so there's no mistaking whose it is
  switchTo(m) {
    const g = this.g, st = g.state.cart, old = g.playerCart, p = g.player;
    if (p.cart) p.exitCart();
    st.model = m;
    if (st.color === '#ffffff' || Object.values(MODELS).some((x) => x.color === st.color)) st.color = MODELS[m].color;
    if (old) {
      g.scene.remove(old.group);
      old.paintMat?.dispose();
      old.headMat?.dispose();
      g.carts = g.carts.filter((c) => c !== old);
    }
    const c = g.addCart({ x: NEW_SPOT.x, z: NEW_SPOT.z, ry: NEW_SPOT.ry, kind: 'player', model: m, color: st.color, upgrades: { ...st.upgrades } });
    c.y = heightAt(c.x, c.z);
    c.syncMesh(0);
    g.playerCart = c;
    g.enterCart(c);
    audio.play('buy');
    g.celebrate?.(4, c.x, c.z);
    return c;
  }

  clear() {
    const g = this.g;
    if (this.abe && g.npcs.includes(this.abe)) g.removeNPC(this.abe);
    for (const c of Object.values(this.display || {})) { g.scene.remove(c.group); c.paintMat?.dispose(); }
    g.carts = g.carts.filter((c) => !Object.values(this.display || {}).includes(c));
  }
}

export function abeNode(g) {
  const st = g.state.cart, d = g.dealer;
  const owned = st.owned || ['classic'];
  const choices = Object.entries(MODELS).filter(([m]) => m !== st.model).map(([m, info]) => {
    const has = owned.includes(m);
    return {
      text: `${has ? '🔁 Switch to' : '🚙 Buy'} ${info.name}`, tag: has ? 'owned' : money(info.price),
      disabled: !has && g.state.money < info.price,
      action: () => {
        if (!has) { g.spend(info.price); st.owned = [...owned, m]; g.achievement('dealer'); }
        d.switchTo(m);
        return { name: 'Honest Abe', title: info.name, text: `${has ? '"Back in the saddle. I kept her warm for you."' : pick(['"Pleasure doing business. No refunds. No questions. No, I don\'t know where the previous owner is."', '"She\'s all yours. Runs great. Mostly. Sal\'s mods carry right over."'])}\n\nYour brand-new ${info.name} is right here beside Abe, and you're already in the driver's seat.${m === 'classic' ? '' : ' Your old cart goes back on the lot; swap back any time for free.'}`, choices: [{ text: 'Drive it off the lot', action: () => null }] };
      },
    };
  });
  choices.push({ text: 'Just looking', action: () => null });
  return {
    name: 'Honest Abe Lindqvist', title: 'Pre-Owned Carts • "Honest" is my first name. Legally.',
    text: `"Take any of 'em for a test drive, friend — keys are in 'em, they always are. You're in the ${MODELS[st.model].name} right now."\n\n${Object.entries(MODELS).filter(([m]) => m !== 'classic').map(([, i]) => `• ${i.name} — ${i.blurb}`).join('\n')}`,
    choices,
  };
}
