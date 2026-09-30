// Crushed beer cans: every finished beer gets crushed and flung. Cans tumble, bounce and clatter,
// bonk anyone in the way, stay where they land, and can be kicked or run over later.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { heightAt, waterLevel } from '../world/terrain.js';
import { rand, chance, pick } from '../core/utils.js';
import { audio } from '../core/audio.js';

const MAX_CANS = 40;
const LABELS = ['#1f4fa8', '#c9303a', '#d9a520', '#2f7d4a'];
const GEOS = LABELS.map((label) => mergeParts([
  [GEO.cyl, '#c9ced3', mat4(0, 0, 0, 0, 0.033, 0.12, 0.033)],
  [GEO.cyl, label, mat4(0, -0.006, 0, 0, 0.0336, 0.07, 0.0336)],
  [GEO.cyl, '#eeeeee', mat4(0, 0.061, 0, 0, 0.027, 0.004, 0.027)],
]));
const BONKS = ['OW! My hip!', 'Was that a BUD LIGHT?!', 'HEY! I just had my hair set!', 'Litterbug!', "I'm telling the newsletter!"];

export class Litter {
  constructor(game) {
    this.game = game;
    this.cans = [];
    this.ticketCd = 0; // one littering write-up per half minute, tops
  }

  // Fling the can over the driver's-side shoulder, carrying the cart's momentum.
  toss() {
    const g = this.game;
    const p = g.player;
    const c = p.cart;
    const h = c ? c.heading : p.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const lx = fz, lz = -fx; // character's left
    const side = c || chance(0.5) ? 1 : -1;
    const x0 = (c ? c.x : p.x) + lx * side * 0.45;
    const z0 = (c ? c.z : p.z) + lz * side * 0.45;
    const y0 = (c ? c.y : p.y) + 1.45;
    const mesh = new THREE.Mesh(GEOS[Math.floor(Math.random() * GEOS.length)], M.vc);
    mesh.scale.set(1.6, 0.68, 1.6); // crushed (and a bit oversized so it reads from the chase cam)
    mesh.castShadow = true;
    mesh.position.set(x0, y0, z0);
    g.scene.add(mesh);
    const power = rand(2.6, 3.6);
    const can = {
      mesh, rest: false, age: 0,
      vx: lx * side * power - fx * 0.8 + (c ? c.vx * 0.9 : 0),
      vy: rand(3.2, 4.2),
      vz: lz * side * power - fz * 0.8 + (c ? c.vz * 0.9 : 0),
      sx: rand(-14, 14), sy: rand(-6, 6), sz: rand(-14, 14),
      hit: new Set(),
    };
    this.cans.push(can);
    audio.play('crush');
    if (this.cans.length > MAX_CANS) this.remove(this.cans[0]);
    g.state.counters.cans = (g.state.counters.cans || 0) + 1;
    if (g.state.counters.cans >= 24) g.achievement('litterbug');
    if (this.ticketCd <= 0 && g.crime(x0, z0, 0.15, 'Littering', 12, true)) this.ticketCd = 30;
  }

  remove(can) {
    this.game.scene.remove(can.mesh);
    this.cans = this.cans.filter((c) => c !== can);
  }

  kick(can, vx, vz, up = 1.6) {
    can.rest = false;
    can.age = 0;
    can.vx = vx; can.vz = vz; can.vy = up;
    can.sx = rand(-10, 10); can.sy = rand(-8, 8); can.sz = rand(-10, 10);
    audio.play('clink', { vol: 0.8 });
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const pc = p.cart;
    this.ticketCd -= dt;
    for (let i = this.cans.length - 1; i >= 0; i--) {
      const can = this.cans[i];
      const m = can.mesh;
      can.age += dt;
      if (can.rest) {
        // kicked by Lee on foot, or run over by his cart
        const kx = pc ? pc.x : p.x, kz = pc ? pc.z : p.z;
        const kr = pc ? 0.95 : 0.45;
        const dx = m.position.x - kx, dz = m.position.z - kz;
        const d = Math.hypot(dx, dz);
        const sp = pc ? pc.speed : p.speed;
        if (d < kr && sp > 1.2) {
          // on foot the player's velocity isn't stored (vx/vz is knockback only): use heading * speed
          const vx = pc ? pc.vx : Math.sin(p.heading) * p.speed, vz = pc ? pc.vz : Math.cos(p.heading) * p.speed;
          this.kick(can, vx * 0.9 + (dx / (d || 1)) * 1.5, vz * 0.9 + (dz / (d || 1)) * 1.5, pc ? 2.2 + sp * 0.12 : 1.4);
        }
        continue;
      }
      can.vy -= 9.8 * dt;
      m.position.x += can.vx * dt;
      m.position.y += can.vy * dt;
      m.position.z += can.vz * dt;
      m.rotation.x += can.sx * dt;
      m.rotation.y += can.sy * dt;
      m.rotation.z += can.sz * dt;
      // bonk bystanders on the way down
      for (const n of g.npcs) {
        if (can.hit.has(n) || n.state === 'ko' || n.role === 'gang') continue;
        if (Math.abs(n.x - m.position.x) > 0.5 || Math.abs(n.z - m.position.z) > 0.5) continue;
        const hy = m.position.y - (n.y ?? heightAt(n.x, n.z));
        if (hy < 0.4 || hy > 1.9) continue;
        can.hit.add(n);
        n.char.play?.('flinch', 0.5);
        n.say?.(pick(BONKS), 2.2);
        audio.play('bonk', { vol: 0.5 });
        can.vx *= -0.3; can.vz *= -0.3;
        g.crime(n.x, n.z, 0.3, 'Assault with a beer can', 8, true);
      }
      const gy = g.surfaceY(m.position.x, m.position.z); // terrain or the road / driveway on top of it
      const wl = waterLevel(m.position.x, m.position.z);
      if (wl !== null && m.position.y < wl + 0.02) {
        g.particles.burst('drop', m.position.x, wl, m.position.z, 8, { speed: 1.2, up: 2.5, life: 0.6, size: 0.14, gravity: 9 });
        audio.play('splash', { vol: 0.25 });
        this.remove(can);
        continue;
      }
      if (m.position.y <= gy + 0.055) {
        m.position.y = gy + 0.055;
        if (can.vy < -1.4) {
          can.vy = -can.vy * 0.38;
          can.vx *= 0.62; can.vz *= 0.62;
          can.sx *= 0.5; can.sz *= 0.5;
          const dist = Math.hypot(m.position.x - p.x, m.position.z - p.z);
          audio.play('clink', { vol: Math.max(0.1, 1 - dist / 30) });
        } else {
          // settle on its side, pointing wherever it rolled
          can.rest = true;
          m.rotation.order = 'YXZ';
          m.rotation.set(Math.PI / 2, Math.atan2(can.vx, can.vz) + rand(-0.4, 0.4), 0);
        }
      }
      if (can.age > 20) this.remove(can); // lost in a bush
    }
  }

  clear() {
    for (const c of this.cans) this.game.scene.remove(c.mesh);
    this.cans = [];
  }
}
