// Boca Beach Club: the second map, through the front gate. Sand, ocean, a drivable pier,
// a beach bar, a bait shack, a lifeguard tower, seagulls and buried treasure.
import * as THREE from 'three';
import { mat4, mergeParts } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { makeWaterMaterial } from '../gfx/water.js';
import { makeSignTexture } from '../gfx/textures.js';
import { mulberry32, clamp } from '../core/utils.js';
import { buildBoat, paintBoat, BOAT } from './casinoboat.js';

export const BEACH = {
  x0: 318, x1: 440, z0: -228, z1: 268,
  shore: 424, // where the sand meets the water
  netX: 545,
  pier: { x0: 398, ramp: 14, x1: 525, z: 20, w: 6, h: 2.7 },
  lot: { x: 337, z: 92, sx: 30, sz: 40 },
  bar: { x: 372, z: 132 },
  bait: { x: 368, z: -24 },
  tower: { x: 402, z: 168 },
  volley: { x: 388, z: -92 },
};

export const OCEAN = { name: 'Atlantic Ocean', ocean: true };

// Height contribution of the beach area (added in terrain.heightAt).
export function beachSlope(x) {
  if (x < 330) return 0;
  if (x < BEACH.shore - 6) return 0.25 * Math.sin(((x - 330) / (BEACH.shore - 336)) * Math.PI); // gentle dune
  return -Math.min(7, (x - (BEACH.shore - 6)) * 0.11);
}

export function pierHeight(x, z) {
  const p = BEACH.pier;
  if (Math.abs(z - p.z) > p.w / 2 || x < p.x0 || x > p.x1) return -Infinity;
  if (x < p.x0 + p.ramp) return (p.h * (x - p.x0)) / p.ramp;
  return p.h;
}

export function inOcean(x, z) {
  return x > BEACH.shore + 2 && z > -1200 && z < 1200;
}

export function onSand(x, z) {
  return x > 322 && x < BEACH.shore + 1 && z > BEACH.z0 && z < BEACH.z1;
}

function sandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rnd = mulberry32(99);
  g.fillStyle = '#e8d6a8';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? 'rgba(190,165,115,0.35)' : 'rgba(255,248,225,0.4)';
    g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
  }
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = 'rgba(200,180,130,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    const y = rnd() * 256;
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 4);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Build beach geometry into the world (called from World).
export function buildBeach(world, GEO, heightAt) {
  const b = world.batch;
  const rnd = mulberry32(777);
  const box = (x, y, z, sx, sy, sz, col, ry = 0) => b.add(M.vc, GEO.box, col, mat4(x, y + sy / 2, z, ry, sx, sy, sz));
  const col = world.col;

  // sand: a displaced strip following the dune + underwater slope
  const W = 170, L = 2400;
  const sg = new THREE.PlaneGeometry(W, L, 85, 240);
  sg.rotateX(-Math.PI / 2);
  sg.translate(300 + W / 2, 0, 0);
  const pos = sg.attributes.position;
  const uv = sg.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, beachSlope(x) - (x < 318 ? 0.02 : 0));
    uv.setXY(i, x / 9, z / 9);
  }
  sg.computeVertexNormals();
  const sand = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 }));
  sand.receiveShadow = true;
  world.root.add(sand);

  // ocean + shore foam
  const oceanMat = makeWaterMaterial({ deep: '#0d4a6b', shallow: '#2aa3b3' });
  world.waterMats.push(oceanMat);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2400).rotateX(-Math.PI / 2), oceanMat);
  ocean.position.set(BEACH.shore + 700, -0.3, 0);
  ocean.renderOrder = 2;
  world.root.add(ocean);
  world.foam = new THREE.Mesh(new THREE.PlaneGeometry(4, 2400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
  world.foam.position.set(BEACH.shore + 1, -0.25, 0);
  world.root.add(world.foam);

  // road from the gate + parking lot
  const lot = BEACH.lot;
  b.add(world.roadMat, world.roadQuad(lot.x - lot.sx / 2, lot.z, lot.x + lot.sx / 2, lot.z, lot.sz, 0.035, false), '#fff', null);
  for (let i = 0; i < 8; i++) box(lot.x - 13 + i * 3.6, 0.036, lot.z + 12, 0.14, 0.01, 5, '#f4f4f4');
  for (let i = 0; i < 8; i++) box(lot.x - 13 + i * 3.6, 0.036, lot.z - 12, 0.14, 0.01, 5, '#f4f4f4');
  world.addSign('BOCA BEACH CLUB', { bg: '#1f8a8a', fg: '#fff', font: 'bold 64px Georgia, serif', sub: 'Seniors Swim Free • No Lifeguard After 4', subFont: 'bold 28px Georgia, serif', border: '#f2c94c', w: 1024, h: 200, emissive: 0.25 }, 318, 3.2, 72, Math.PI / 2, 7, 1.4);
  box(318, 0, 69.5, 0.2, 2.6, 0.2, '#555');
  box(318, 0, 74.5, 0.2, 2.6, 0.2, '#555');

  // boardwalk (flat planks) + dune fences + palms
  for (let z = BEACH.z0 + 6; z < BEACH.z1 - 6; z += 1.4) box(358, 0.02, z, 6, 0.06, 1.2, (Math.round(z / 1.4) % 2) ? '#b08654' : '#a37a4a');
  for (let z = BEACH.z0; z < BEACH.z1; z += 9) {
    if (Math.abs(z - 60) < 12) continue;
    box(326, 0, z, 0.12, 1.1, 0.12, '#8a6a48');
    box(326, 0.8, z + 4.5, 0.06, 0.12, 9, '#9a7a58');
    if (rnd() < 0.7) world.palm(322 - rnd() * 3, z + rnd() * 4, 1 + rnd() * 0.2);
  }

  // edges of the playable area: turtle-nesting fences north/south and a buoy line offshore
  for (const zz of [BEACH.z0 - 2, BEACH.z1 + 2]) {
    col.addBox(292, zz - 1, BEACH.netX, zz + 1, 30, 'wall');
    for (let x = 300; x < BEACH.shore; x += 4) box(x, 0, zz, 0.12, 1.2, 0.12, '#8a6a48');
    box((300 + BEACH.shore) / 2, 0.9, zz, BEACH.shore - 300, 0.1, 0.06, '#ff6b1a');
    world.addSign('SEA TURTLE NESTING — KEEP OUT', { bg: '#f2c94c', fg: '#111', font: 'bold 44px sans-serif', border: '#111', w: 1024, h: 128 }, 380, 1.8, zz + (zz > 0 ? -0.1 : 0.1), zz > 0 ? Math.PI : 0, 4, 0.5);
  }
  col.addBox(BEACH.netX, BEACH.z0 - 2, BEACH.netX + 3, BEACH.z1 + 2, 30, 'wall');
  for (let z = BEACH.z0; z <= BEACH.z1; z += 12) b.add(M.vc, GEO.sph, z % 24 ? '#ff6b1a' : '#ffffff', mat4(BEACH.netX, -0.25, z, 0, 0.45, 0.45, 0.45));

  // ---- the pier (drivable, and you can drive right off the end)
  const p = BEACH.pier;
  const deckTop = p.h;
  const rampLen = Math.hypot(p.ramp, p.h);
  b.add(M.vc, GEO.box, '#9a7450', new THREE.Matrix4().compose(
    new THREE.Vector3(p.x0 + p.ramp / 2, p.h / 2 - 0.1, p.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan2(p.h, p.ramp))),
    new THREE.Vector3(rampLen, 0.2, p.w)));
  for (let x = p.x0 + p.ramp; x < p.x1; x += 1.1) box(x + 0.55, deckTop - 0.2, p.z, 1.0, 0.2, p.w, rnd() < 0.5 ? '#a37a4a' : '#98704a');
  for (let x = p.x0 + p.ramp; x <= p.x1; x += 6) {
    for (const s of [-1, 1]) {
      box(x, -4, p.z + s * (p.w / 2 - 0.2), 0.35, 4 + deckTop - 0.2, 0.35, '#6d5a48');
      if (!(s > 0 && x > BOAT.plank.x0 - 0.2 && x < BOAT.plank.x1 + 0.2)) box(x, deckTop, p.z + s * (p.w / 2 - 0.1), 0.12, 1.1, 0.12, '#6d5a48');
    }
  }
  for (const s of [-1, 1]) {
    // the north rail opens where the Lucky Lady's gangplank meets the pier
    const spans = s > 0 ? [[p.x0 + p.ramp, BOAT.plank.x0], [BOAT.plank.x1, p.x1]] : [[p.x0 + p.ramp, p.x1]];
    for (const [a, c] of spans) {
      box((a + c) / 2, deckTop + 1.0, p.z + s * (p.w / 2 - 0.1), c - a, 0.1, 0.1, '#7a6040');
      col.addBox(a, p.z + s * (p.w / 2) - 0.2, c, p.z + s * (p.w / 2) + 0.2, deckTop + 1.2, 'rail');
    }
  }
  world.addSign('PIER — NO DIVING, NO CARTS, NO FUN', { bg: '#fff', fg: '#b8323a', font: 'bold 44px sans-serif', border: '#b8323a', w: 1024, h: 128 }, p.x0 - 1, 2.2, p.z + p.w / 2 + 1, -Math.PI / 2, 4, 0.5);
  box(p.x0 - 1, 0, p.z + p.w / 2 + 1, 0.1, 2, 0.1, '#555');

  // ---- The Rusty Pelican beach bar (faces the ocean)
  // An open-air tiki bar: kitchen shack at the back, thatched roof on bamboo posts, bar facing the surf.
  const br = BEACH.bar;
  const bx0 = br.x - 6, bx1 = br.x + 6.2, bz0 = br.z - 4.8, bz1 = br.z + 4.8;
  // kitchen shack (weathered planks)
  b.add(M.vc, GEO.box, '#a67c52', mat4(bx0 + 2.5, 1.5, br.z, 0, 5, 3, 9.2));
  for (let z = bz0 + 0.3; z < bz1; z += 0.45) b.add(M.vc, GEO.box, '#7d5a3a', mat4(bx0 + 5.02, 1.5, z, 0, 0.02, 3, 0.05));
  b.add(M.vc, GEO.box, '#2a1d12', mat4(bx0 + 5.03, 1.2, br.z + 2.6, 0, 0.02, 2.2, 1.1)); // kitchen door
  b.add(M.vc, GEO.box, '#fff', mat4(bx0 + 5.03, 1.9, br.z - 1.5, 0, 0.02, 0.9, 2.2)); // order window
  // bamboo posts
  const bamboo = (x, z, h) => {
    b.add(M.vc, GEO.cyl, '#c8a864', mat4(x, h / 2, z, 0, 0.13, h, 0.13));
    for (let y = 0.5; y < h; y += 0.6) b.add(M.vc, GEO.cyl, '#8a6f3a', mat4(x, y, z, 0, 0.145, 0.05, 0.145));
    col.addCircle(x, z, 0.2, 4, 'post');
  };
  for (const x of [br.x - 0.5, br.x + 3, br.x + 5.9]) for (const z of [bz0 + 0.1, bz1 - 0.1]) bamboo(x, z, 3.3);
  bamboo(br.x + 5.9, br.z, 3.3);
  // thatched hip roof with a shaggy straw fringe
  const rf = world.roofGeo(bx1 - bx0 + 1.6, bz1 - bz0 + 1.6, 2.8);
  b.add(M.vc, rf.geo, '#c9a45a', mat4((bx0 + bx1) / 2, 3.3, br.z, rf.ry), (x, y) => Math.max(0, 1.5 - y) * 0.03);
  const fringe = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.22);
    for (let i = 0; i <= n; i++) {
      const t = i / n, l = 0.45 + ((i * 7) % 5) * 0.06;
      b.add(M.vc, GEO.cone, i % 3 ? '#b8923f' : '#d9b56a', mat4(x0 + (x1 - x0) * t, 3.3 - l / 2, z0 + (z1 - z0) * t, 0, 0.13, l, 0.13, Math.PI), 0.04);
    }
  };
  const ex0 = bx0 - 0.8, ex1 = bx1 + 0.8, ez0 = bz0 - 0.8, ez1 = bz1 + 0.8;
  fringe(ex0, ez0, ex1, ez0); fringe(ex1, ez0, ex1, ez1); fringe(ex1, ez1, ex0, ez1); fringe(ex0, ez1, ex0, ez0);
  // the rusty pelican himself, on the ridge
  const px = (bx0 + bx1) / 2, py = 6.2;
  b.add(M.vc, GEO.sph, '#9a5a2a', mat4(px, py, br.z, 0, 0.9, 0.6, 0.55));
  b.add(M.vc, GEO.cyl, '#9a5a2a', mat4(px + 0.6, py + 0.6, br.z, 0, 0.14, 0.7, 0.14, 0, -0.5));
  b.add(M.vc, GEO.sph, '#9a5a2a', mat4(px + 0.85, py + 1.05, br.z, 0, 0.22, 0.2, 0.2));
  b.add(M.vc, GEO.cone, '#d98a2a', mat4(px + 1.4, py + 0.95, br.z, 0, 0.1, 0.9, 0.1, 0, -Math.PI / 2 - 0.25));
  b.add(M.vc, GEO.sph, '#d98a2a', mat4(px + 1.25, py + 0.78, br.z, 0, 0.35, 0.14, 0.12)); // pouch
  b.add(M.vc, GEO.sph, '#111', mat4(px + 0.97, py + 1.12, br.z + 0.14, 0, 0.035, 0.035, 0.035));
  b.add(M.vc, GEO.box, '#7a4420', mat4(px - 0.1, py + 0.1, br.z + 0.55, 0, 1.0, 0.08, 0.5, 0.3)); // wings
  b.add(M.vc, GEO.box, '#7a4420', mat4(px - 0.1, py + 0.1, br.z - 0.55, 0, 1.0, 0.08, 0.5, -0.3));
  // bar counter facing the surf, stools, bottle shelf
  b.add(M.vc, GEO.box, '#6b3a1f', mat4(br.x + 4.6, 0.55, br.z, 0, 0.7, 1.1, 7.2));
  b.add(M.vc, GEO.box, '#3a2412', mat4(br.x + 4.6, 1.13, br.z, 0, 1.0, 0.08, 7.5));
  for (let z = br.z - 3.4; z <= br.z + 3.4; z += 0.5) b.add(M.vc, GEO.box, '#c8a864', mat4(br.x + 4.96, 0.55, z, 0, 0.02, 1.05, 0.12)); // bamboo facing
  for (let i = 0; i < 6; i++) {
    const z = br.z - 3 + i * 1.2;
    b.add(M.vc, GEO.cyl, '#3a2412', mat4(br.x + 5.6, 0.4, z, 0, 0.04, 0.8, 0.04));
    b.add(M.vc, GEO.cyl, i % 2 ? '#e84a5f' : '#1f8a8a', mat4(br.x + 5.6, 0.82, z, 0, 0.22, 0.08, 0.22));
  }
  col.addBox(br.x + 4.2, br.z - 3.7, br.x + 5, br.z + 3.7, 1.3, 'bar');
  b.add(M.vc, GEO.box, '#5a3a22', mat4(bx0 + 5.3, 1.6, br.z, 0, 0.3, 0.06, 6));
  for (let i = 0; i < 14; i++) b.add(M.vc, GEO.cyl, ['#2e7d4f', '#8a4a1f', '#d9a520', '#b8323a', '#e8e0d0'][i % 5], mat4(bx0 + 5.3, 1.8, br.z - 2.8 + i * 0.42, 0, 0.05, 0.32, 0.05));
  col.addBox(bx0, bz0, bx0 + 5, bz1, 4, 'building');
  // lanterns under the eaves, tiki torches out front, a surfboard
  for (let i = 0; i < 6; i++) {
    const z = bz0 + 0.8 + i * ((bz1 - bz0 - 1.6) / 5);
    b.add(M.vc, GEO.cyl, '#333', mat4(br.x + 5.2, 2.95, z, 0, 0.01, 0.5, 0.01));
    b.add(M.lamp, GEO.sph, '#ffcf6b', mat4(br.x + 5.2, 2.6, z, 0, 0.16, 0.2, 0.16));
  }
  for (const z of [bz0 - 1.2, bz1 + 1.2]) {
    b.add(M.vc, GEO.cyl, '#6b4a2a', mat4(br.x + 7.5, 1.1, z, 0, 0.06, 2.2, 0.06));
    b.add(M.vc, GEO.cyl, '#3a2412', mat4(br.x + 7.5, 2.3, z, 0, 0.12, 0.3, 0.12));
    b.add(M.lamp, GEO.cone, '#ff8c2a', mat4(br.x + 7.5, 2.62, z, 0, 0.11, 0.38, 0.11)); // flame
  }
  b.add(M.vc, GEO.sph, '#3a86ff', mat4(bx0 - 0.4, 1.3, bz1 - 1.5, 0, 0.12, 1.3, 0.3, 0, 0.25));
  b.add(M.vc, GEO.box, '#fff', mat4(bx0 - 0.39, 1.3, bz1 - 1.5, 0, 0.13, 2.2, 0.04, 0, 0.25));
  world.addSign('THE RUSTY PELICAN', { bg: '#3a2a1a', fg: '#ffd166', font: 'bold 70px "Comic Sans MS", cursive', sub: 'COLD BEER • BUSHWACKERS • BAD DECISIONS', subFont: 'bold 24px sans-serif', emissive: 0.45, w: 1024, h: 200 }, bx1 + 0.85, 3.05, br.z, Math.PI / 2, 5.5, 1.1);
  world.poi('pelican', br.x + 6.6, br.z, 'The Rusty Pelican', 3.2);

  // ---- bait & tackle shack
  const bt = BEACH.bait;
  box(bt.x, 0, bt.z, 8, 3, 6, '#6fa6b8');
  for (let y = 0.25; y < 3; y += 0.32) { // weathered clapboard
    box(bt.x, y, bt.z + 3.01, 8.02, 0.04, 0.02, '#4f8193');
    box(bt.x, y, bt.z - 3.01, 8.02, 0.04, 0.02, '#4f8193');
    box(bt.x + 4.01, y, bt.z, 0.02, 0.04, 6.02, '#4f8193');
  }
  // corrugated tin roof
  for (let i = 0; i < 18; i++) box(bt.x - 4.3 + i * 0.5, 3 + (i % 2) * 0.05, bt.z, 0.26, 0.12, 7.2, i % 2 ? '#b7bcc0' : '#9ea4a8');
  box(bt.x + 4.02, 0, bt.z - 1.6, 0.04, 2.2, 1.1, '#3a2a1a'); // door
  // buoys, a rack of rods, a LIVE BAIT cooler, an old dinghy on the sand
  for (let i = 0; i < 5; i++) b.add(M.vc, GEO.sph, ['#ff6b1a', '#fff', '#e84a5f', '#f2c94c', '#fff'][i], mat4(bt.x + 4.1, 2.4 - (i % 2) * 0.35, bt.z + 0.3 + i * 0.5, 0, 0.14, 0.2, 0.14));
  for (let i = 0; i < 6; i++) b.add(M.vc, GEO.cyl, '#2a2a2a', mat4(bt.x + 4.3, 1.4, bt.z + 2.8 - i * 0.12, 0, 0.012, 2.6, 0.012, 0, 0.12));
  box(bt.x + 5.2, 0, bt.z + 2.2, 0.9, 0.6, 0.6, '#f4f4f4');
  box(bt.x + 5.2, 0.6, bt.z + 2.2, 0.94, 0.08, 0.64, '#1f5fb0');
  b.add(M.vc, GEO.sph, '#b8323a', mat4(bt.x - 1, 0.3, bt.z + 5.5, 0.6, 0.9, 0.35, 2.4));
  b.add(M.vc, GEO.sph, '#e8e0d0', mat4(bt.x - 1, 0.42, bt.z + 5.5, 0.6, 0.78, 0.2, 2.2));
  col.addBoxC(bt.x, bt.z, 8, 6, 4, 'building');
  world.addSign('BAIT • TACKLE • DETECTORS', { bg: '#23408e', fg: '#fff', font: 'bold 52px sans-serif', sub: '"We Sell Everything Except Bait"', subFont: 'italic 26px sans-serif', w: 1024, h: 180 }, bt.x + 4.05, 2.2, bt.z, Math.PI / 2, 5, 0.9);
  world.poi('bait', bt.x + 5.5, bt.z, 'Bait & Tackle Shack', 3);

  // ---- lifeguard tower
  const tw = BEACH.tower;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(tw.x + dx, 0, tw.z + dz, 0.2, 3, 0.2, '#f4f0e8');
  box(tw.x, 3, tw.z, 3, 2, 3, '#e84a5f');
  b.add(M.vc, GEO.pyr, '#f4f0e8', mat4(tw.x, 5.5, tw.z, 0, 4, 1, 4));
  col.addBoxC(tw.x, tw.z, 2.4, 2.4, 6, 'building');

  // ---- volleyball net
  const vb = BEACH.volley;
  box(vb.x, 0, vb.z - 5, 0.12, 2.6, 0.12, '#ddd');
  box(vb.x, 0, vb.z + 5, 0.12, 2.6, 0.12, '#ddd');
  box(vb.x, 1.7, vb.z, 0.04, 0.9, 10, '#f4f4f4');

  // ---- umbrellas and towels
  world.beachSpots = [];
  for (let i = 0; i < 16; i++) {
    const x = 372 + rnd() * 44, z = BEACH.z0 + 20 + rnd() * (BEACH.z1 - BEACH.z0 - 40);
    if (Math.abs(z - p.z) < 8 || Math.hypot(x - br.x, z - br.z) < 12 || Math.hypot(x - tw.x, z - tw.z) < 6 || Math.hypot(x - vb.x, z - vb.z) < 9) continue;
    const y = heightAt(x, z);
    const c1 = ['#e84a5f', '#1f8a8a', '#f2c94c', '#23408e', '#ff6fa8'][i % 5];
    b.add(M.vc, GEO.cyl, '#eee', mat4(x, y + 1.2, z, 0, 0.04, 2.4, 0.04));
    b.add(M.vc, new THREE.ConeGeometry(1.8, 0.7, 8, 1, true), c1, mat4(x, y + 2.5, z));
    b.add(M.vc, new THREE.ConeGeometry(1.8, 0.7, 8, 1, true), '#f4f0e8', mat4(x, y + 2.48, z, 0, 1, -1, 1));
    b.add(M.vc, GEO.box, ['#ffffff', '#f2c94c', '#8fd3ff', '#ff9ec7'][i % 4], mat4(x + 1.4, y + 0.03, z + 0.6, 0.3, 1, 0.02, 2));
    world.beachSpots.push({ x: x + 1.4, z: z + 0.6 });
    // a pair of low beach chairs facing the water, and usually a cooler
    for (const dz of [-0.8, 0.5]) beachChair(b, GEO, x + 0.9, y, z + dz - 1.4, -Math.PI / 2 + (rnd() - 0.5) * 0.4, ['#e84a5f', '#1f8a8a', '#23408e', '#f2c94c'][(i + (dz > 0 ? 1 : 0)) % 4]);
    if (rnd() < 0.7) {
      box(x - 0.9, y, z - 0.6, 0.6, 0.42, 0.4, rnd() < 0.5 ? '#e84a5f' : '#1f6fb5');
      box(x - 0.9, y + 0.42, z - 0.6, 0.64, 0.07, 0.44, '#f4f4f4');
    }
  }

  // ---- beach life: sea oats on the dune, sandcastles, driftwood, shells, kayaks, a rinse-off shower
  const oat = new THREE.ConeGeometry(0.045, 1, 4);
  for (let i = 0; i < 220; i++) {
    const x = 327 + rnd() * 20, z = BEACH.z0 + 6 + rnd() * (BEACH.z1 - BEACH.z0 - 12);
    if (Math.abs(x - 358) < 4.5 || Math.abs(z - 60) < 14 || Math.hypot(x - BEACH.lot.x, z - BEACH.lot.z) < 26) continue;
    if (Math.abs(x - 342) < 13 && z > 133 && z < 160) continue; // the Golden Garter and its rope line (game/stripclub.js)
    const y = heightAt(x, z);
    const n = 7 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const h = 0.6 + rnd() * 0.7, lean = (rnd() - 0.5) * 0.5, ry = rnd() * 6.28;
      b.add(M.vc, oat, k % 2 ? '#b9ae6e' : '#9fa45e', mat4(x + (rnd() - 0.5) * 0.4, y + h / 2, z + (rnd() - 0.5) * 0.4, ry, 1, h, 1, lean, lean * 0.5), (px, py) => Math.max(0, py + 0.5) * 0.18);
      if (k === 0) b.add(M.vc, GEO.sph, '#d8c38a', mat4(x, y + h, z, 0, 0.05, 0.12, 0.05), 0.2); // seed head
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = 400 + rnd() * 18, z = BEACH.z0 + 30 + rnd() * (BEACH.z1 - BEACH.z0 - 60);
    if (Math.abs(z - p.z) < 10) continue;
    const y = heightAt(x, z);
    b.add(M.vc, GEO.cyl16, '#d9bf86', mat4(x, y + 0.2, z, 0, 0.7, 0.4, 0.7));
    b.add(M.vc, GEO.cyl16, '#d4b97f', mat4(x, y + 0.55, z, 0, 0.45, 0.3, 0.45));
    for (const [dx, dz] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) {
      b.add(M.vc, GEO.cyl, '#d9bf86', mat4(x + dx, y + 0.35, z + dz, 0, 0.16, 0.7, 0.16));
      b.add(M.vc, GEO.cone, '#cfb277', mat4(x + dx, y + 0.8, z + dz, 0, 0.18, 0.22, 0.18));
    }
    b.add(M.vc, GEO.cone, '#cfb277', mat4(x, y + 0.9, z, 0, 0.3, 0.4, 0.3));
    b.add(M.vc, GEO.cyl, '#ff6fa8', mat4(x, y + 1.25, z, 0, 0.012, 0.35, 0.012)); // a little flag
    box(x + 0.08, y + 1.3, z, 0.16, 0.1, 0.01, '#ff6fa8');
  }
  for (let i = 0; i < 10; i++) {
    const x = BEACH.shore - 6 + rnd() * 5, z = BEACH.z0 + 15 + rnd() * (BEACH.z1 - BEACH.z0 - 30);
    if (Math.abs(z - p.z) < 10) continue;
    const y = heightAt(x, z), len = 1.5 + rnd() * 2.5;
    b.add(M.vc, GEO.cyl6, '#a89a86', mat4(x, y + 0.1, z, rnd() * 3, 0.12 + rnd() * 0.08, len, 0.12 + rnd() * 0.08, 0, Math.PI / 2));
  }
  for (let i = 0; i < 140; i++) {
    const x = BEACH.shore - 9 + rnd() * 8, z = BEACH.z0 + 5 + rnd() * (BEACH.z1 - BEACH.z0 - 10);
    b.add(M.vc, GEO.sph, ['#fbe3e8', '#f7d9c4', '#ffffff', '#e8c9a0'][i % 4], mat4(x, heightAt(x, z) + 0.01, z, rnd() * 6, 0.06, 0.025, 0.05));
  }
  for (let i = 0; i < 4; i++) {
    const x = BEACH.shore - 5 - rnd() * 3, z = -120 + i * 70 + rnd() * 20;
    const y = heightAt(x, z), c1 = ['#f2c94c', '#e84a5f', '#1f8a8a', '#ff8c42'][i];
    b.add(M.vc, GEO.sph, c1, mat4(x, y + 0.15, z, 0.2, 0.32, 0.14, 1.8));
    b.add(M.vc, GEO.sph, '#222', mat4(x, y + 0.26, z + 0.1, 0.2, 0.2, 0.05, 0.35)); // cockpit
    b.add(M.vc, GEO.cyl, '#333', mat4(x + 0.5, y + 0.05, z, 0.2, 0.02, 2.2, 0.02, 0, Math.PI / 2 - 0.1)); // paddle
  }
  box(361.8, 0, 60, 0.12, 2.6, 0.12, '#bbb');
  b.add(M.vc, GEO.cyl, '#bbb', mat4(361.4, 2.55, 60, 0, 0.04, 0.8, 0.04, 0, Math.PI / 2));
  b.add(M.vc, GEO.cone, '#9a9a9a', mat4(361.05, 2.42, 60, 0, 0.12, 0.12, 0.12, Math.PI));
  box(361.4, 0, 60, 1.4, 0.06, 1.4, '#c9c3b5');

  // ---- the Lucky Lady casino boat, moored off the end of the pier
  buildBoat(world, GEO);

  // ---- seagulls
  world.gulls = [];
  const gullGeo = mergeParts([
    [GEO.sph, '#f4f4f4', mat4(0, 0, 0, 0, 0.18, 0.14, 0.4)],
    [GEO.box, '#e8e8e8', mat4(0.45, 0.05, 0, 0, 0.8, 0.03, 0.25, 0, 0.3)],
    [GEO.box, '#e8e8e8', mat4(-0.45, 0.05, 0, 0, 0.8, 0.03, 0.25, 0, -0.3)],
    [GEO.box, '#f2a33a', mat4(0, 0, 0.42, 0, 0.05, 0.04, 0.15)],
  ]);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(gullGeo, M.vc);
    world.root.add(m);
    world.gulls.push({ m, cx: 380 + rnd() * 50, cz: -100 + rnd() * 250, r: 10 + rnd() * 25, h: 10 + rnd() * 10, ph: rnd() * 6.28, w: (0.25 + rnd() * 0.2) * (rnd() < 0.5 ? -1 : 1) });
  }
}

// Low-slung aluminum beach chair: webbed seat and back in one color.
function beachChair(b, GEO, x, y, z, ry, color) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const part = (geo, col, lx, ly, lz, sx, sy, sz, rx = 0) => { const [px, py, pz] = at(lx, ly, lz); b.add(M.vc, geo, col, mat4(px, py, pz, ry, sx, sy, sz, rx)); };
  part(GEO.box, color, 0, 0.22, 0.05, 0.55, 0.04, 0.55);
  part(GEO.box, color, 0, 0.5, -0.28, 0.55, 0.6, 0.04, -0.45);
  for (const sx of [-0.28, 0.28]) {
    part(GEO.box, '#d9d9d9', sx, 0.11, 0.25, 0.03, 0.22, 0.03);
    part(GEO.box, '#d9d9d9', sx, 0.11, -0.2, 0.03, 0.22, 0.03);
    part(GEO.box, '#d9d9d9', sx, 0.34, 0.02, 0.03, 0.03, 0.5); // arm rest
  }
}

export function updateBeach(world, t) {
  for (const g of world.gulls || []) {
    const a = g.ph + t * g.w;
    g.m.position.set(g.cx + Math.cos(a) * g.r, g.h + Math.sin(t * 1.3 + g.ph) * 1.5, g.cz + Math.sin(a) * g.r);
    g.m.rotation.y = Math.atan2(-Math.sin(a) * g.w, Math.cos(a) * g.w);
    g.m.rotation.z = Math.sin(t * 9 + g.ph) * 0.35;
  }
  if (world.foam) {
    world.foam.material.opacity = 0.35 + Math.sin(t * 0.9) * 0.2;
    world.foam.position.x = BEACH.shore + 1 + Math.sin(t * 0.9) * 1.2;
  }
}

// Minimap overlay for the beach (same pixels-per-meter as the main map).
export function paintBeachMap(ppm, x0, z0, W, H) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * ppm);
  c.height = Math.round(H * ppm);
  const g = c.getContext('2d');
  const P = (x, z) => [(x - x0) * ppm, (z - z0) * ppm];
  g.fillStyle = '#5f9e45';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#e8d6a8';
  let [ax, az] = P(322, BEACH.z0);
  g.fillRect(ax, az, (BEACH.shore - 322) * ppm, (BEACH.z1 - BEACH.z0) * ppm);
  g.fillStyle = '#3d8fc4';
  [ax] = P(BEACH.shore, 0);
  g.fillRect(ax, 0, c.width - ax, c.height);
  g.fillStyle = '#6b7079';
  [ax, az] = P(288, 55);
  g.fillRect(ax, az, 48 * ppm, 10 * ppm);
  const l = BEACH.lot;
  [ax, az] = P(l.x - l.sx / 2, l.z - l.sz / 2);
  g.fillRect(ax, az, l.sx * ppm, l.sz * ppm);
  g.fillStyle = '#9a7450';
  const p = BEACH.pier;
  [ax, az] = P(p.x0, p.z - p.w / 2);
  g.fillRect(ax, az, (p.x1 - p.x0) * ppm, p.w * ppm);
  paintBoat(g, P, ppm);
  g.fillStyle = '#c9955f';
  for (const bl of [BEACH.bar, BEACH.bait]) {
    [ax, az] = P(bl.x - 5, bl.z - 4);
    g.fillRect(ax, az, 10 * ppm, 8 * ppm);
  }
  return c;
}

export { clamp };
