// Boca Beach Club: the second map, through the front gate. Sand, ocean, a drivable pier,
// a beach bar, a bait shack, a lifeguard tower, seagulls and buried treasure.
import * as THREE from 'three';
import { mat4, mergeParts } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { makeWaterMaterial } from '../gfx/water.js';
import { makeSignTexture } from '../gfx/textures.js';
import { mulberry32, clamp } from '../core/utils.js';

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
      box(x, deckTop, p.z + s * (p.w / 2 - 0.1), 0.12, 1.1, 0.12, '#6d5a48');
    }
  }
  for (const s of [-1, 1]) {
    box((p.x0 + p.ramp + p.x1) / 2, deckTop + 1.0, p.z + s * (p.w / 2 - 0.1), p.x1 - p.x0 - p.ramp, 0.1, 0.1, '#7a6040');
    col.addBox(p.x0 + p.ramp, p.z + s * (p.w / 2) - 0.2, p.x1, p.z + s * (p.w / 2) + 0.2, deckTop + 1.2, 'rail');
  }
  world.addSign('PIER — NO DIVING, NO CARTS, NO FUN', { bg: '#fff', fg: '#b8323a', font: 'bold 44px sans-serif', border: '#b8323a', w: 1024, h: 128 }, p.x0 - 1, 2.2, p.z + p.w / 2 + 1, -Math.PI / 2, 4, 0.5);
  box(p.x0 - 1, 0, p.z + p.w / 2 + 1, 0.1, 2, 0.1, '#555');

  // ---- The Rusty Pelican beach bar (faces the ocean)
  const br = BEACH.bar;
  box(br.x, 0, br.z, 12, 3.2, 9, '#c9955f');
  b.add(M.vc, GEO.pyr, '#c9a45a', mat4(br.x, 4.3, br.z, 0, 15, 2.4, 12), (x, y) => Math.max(0, -y) * 0.04);
  box(br.x + 6.6, 0, br.z, 1.2, 1.1, 7, '#8a5a3b');
  for (let i = 0; i < 4; i++) b.add(M.vc, GEO.cyl, '#6d5a48', mat4(br.x + 8, 0.4, br.z - 3 + i * 2, 0, 0.25, 0.08, 0.25));
  col.addBoxC(br.x, br.z, 12, 9, 5, 'building');
  world.addSign('THE RUSTY PELICAN', { bg: '#3a2a1a', fg: '#ffd166', font: 'bold 70px "Comic Sans MS", cursive', sub: 'COLD BEER • BUSHWACKERS • BAD DECISIONS', subFont: 'bold 24px sans-serif', emissive: 0.45, w: 1024, h: 200 }, br.x + 6.05, 3.4, br.z, Math.PI / 2, 6, 1.2);
  world.poi('pelican', br.x + 8.5, br.z, 'The Rusty Pelican', 3.4);

  // ---- bait & tackle shack
  const bt = BEACH.bait;
  box(bt.x, 0, bt.z, 8, 3, 6, '#7fb7c9');
  box(bt.x, 3, bt.z, 9, 0.3, 7, '#f4f0e8');
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
  }

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
  g.fillStyle = '#c9955f';
  for (const bl of [BEACH.bar, BEACH.bait]) {
    [ax, az] = P(bl.x - 5, bl.z - 4);
    g.fillRect(ax, az, 10 * ppm, 8 * ppm);
  }
  return c;
}

export { clamp };
