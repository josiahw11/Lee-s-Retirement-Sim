// The Lucky Lady: a paddle-wheel casino riverboat moored alongside the end of the Boca pier.
// Walkable (and drivable) main deck, a casino saloon, pilothouse, twin stacks, a turning paddle wheel,
// and enough neon and bulb lights to be seen from space. Chapter 3 happens here.
import * as THREE from 'three';
import { mat4, mergeParts } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';

export const BOAT = {
  x0: 474, x1: 520, z0: 25, z1: 37, h: 2.7, // main deck rectangle + height (same as the pier deck)
  bow: 3.3, // rounded bow beyond x1
  plank: { x0: 495.6, x1: 500.4, z0: 22.9 }, // gangplank from the pier's north edge
  saloon: { x0: 480, x1: 512, z0: 27.5, z1: 34.5 },
  door: { x: 496, z: 26.3 },
  captain: { x: 517, z: 31 },
  stern: { x: 476.5, z: 35.3 },
};
const ZC = (BOAT.z0 + BOAT.z1) / 2, HW = (BOAT.z1 - BOAT.z0) / 2;

// Deck height where the boat (or its gangplank) is underfoot, -Infinity elsewhere.
export function boatHeight(x, z) {
  const b = BOAT;
  if (x >= b.plank.x0 && x <= b.plank.x1 && z >= b.plank.z0 && z <= b.z0 + 0.5) return b.h;
  if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b.h;
  if (x > b.x1) {
    const u = (x - b.x1) / b.bow, v = (z - ZC) / HW;
    if (u * u + v * v < 1) return b.h;
  }
  return -Infinity;
}

export function onBoat(x, z) {
  return boatHeight(x, z) > -Infinity && z > BOAT.z0 - 0.2;
}

export function buildBoat(world, GEO) {
  const b = world.batch;
  const col = world.col;
  const B = BOAT, H = B.h;
  const box = (x0, y0, z0, x1, y1, z1, color, mat = M.vc) => b.add(mat, GEO.box, color, mat4((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, x1 - x0, y1 - y0, z1 - z0));
  const L = B.x1 - B.x0;

  // ---- hull: white, red boot stripe, gold pinstripe, rounded bow
  box(B.x0, -1.6, B.z0, B.x1, H - 0.15, B.z1, '#f4f4ee');
  b.add(M.vc, GEO.cyl16, '#f4f4ee', mat4(B.x1, (H - 1.75) / 2, ZC, 0, B.bow, H + 1.45, HW));
  box(B.x0 - 0.05, 1.45, B.z0 - 0.05, B.x1, 1.85, B.z1 + 0.05, '#b8323a');
  b.add(M.vc, GEO.cyl16, '#b8323a', mat4(B.x1, 1.65, ZC, 0, B.bow + 0.05, 0.4, HW + 0.05));
  box(B.x0 - 0.05, 2.2, B.z0 - 0.06, B.x1, 2.3, B.z1 + 0.06, '#d4af37');
  b.add(M.vc, GEO.cyl16, '#d4af37', mat4(B.x1, 2.25, ZC, 0, B.bow + 0.06, 0.1, HW + 0.06));
  // deck planks
  box(B.x0, H - 0.15, B.z0, B.x1, H, B.z1, '#b58a5a');
  b.add(M.vc, GEO.cyl16, '#b58a5a', mat4(B.x1, H - 0.075, ZC, 0, B.bow, 0.15, HW));
  for (let z = B.z0 + 0.5; z < B.z1; z += 0.5) box(B.x0, H, z - 0.02, B.x1, H + 0.005, z + 0.02, '#8f6a44');
  // red carpet from the gangplank to the saloon doors
  box(B.plank.x0 + 0.9, H + 0.01, B.z0, B.plank.x1 - 0.9, H + 0.03, B.saloon.z0, '#9b1b30');

  // ---- gangplank with rope rails
  box(B.plank.x0, H - 0.1, B.plank.z0, B.plank.x1, H, B.z0 + 0.2, '#a37a4a');
  for (const x of [B.plank.x0 + 0.1, B.plank.x1 - 0.1]) {
    for (const z of [B.plank.z0 + 0.1, B.z0 + 0.1]) box(x - 0.05, H, z - 0.05, x + 0.05, H + 1.0, z + 0.05, '#d4af37');
    box(x - 0.02, H + 0.9, B.plank.z0 + 0.1, x + 0.02, H + 0.94, B.z0 + 0.1, '#c9a66b');
  }

  // ---- deck railing (visual) + colliders; a gap on the pier side for the gangplank
  const railH = H + 1.2;
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
    b.add(M.vc, GEO.box, '#ffffff', mat4((x0 + x1) / 2, H + 1.0, (z0 + z1) / 2, ry, 0.08, 0.08, len));
    b.add(M.vc, GEO.box, '#ffffff', mat4((x0 + x1) / 2, H + 0.5, (z0 + z1) / 2, ry, 0.04, 0.04, len));
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b.add(M.vc, GEO.cyl, '#ffffff', mat4(x0 + (x1 - x0) * t, H + 0.5, z0 + (z1 - z0) * t, 0, 0.04, 1.0, 0.04));
    }
    col.addBox(Math.min(x0, x1) - 0.15, Math.min(z0, z1) - 0.15, Math.max(x0, x1) + 0.15, Math.max(z0, z1) + 0.15, railH, 'rail');
  };
  rail(B.x0 + 0.1, B.z0 + 0.1, B.plank.x0, B.z0 + 0.1);
  rail(B.plank.x1, B.z0 + 0.1, B.x1, B.z0 + 0.1);
  rail(B.x0 + 0.1, B.z1 - 0.1, B.x1, B.z1 - 0.1);
  rail(B.x0 + 0.1, B.z0 + 0.1, B.x0 + 0.1, B.z1 - 0.1);
  // rounded bow rail as short chords
  const arc = [];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    arc.push([B.x1 + Math.cos(a) * (B.bow - 0.1), ZC + Math.sin(a) * (HW - 0.1)]);
  }
  for (let i = 0; i < 8; i++) rail(arc[i][0], arc[i][1], arc[i + 1][0], arc[i + 1][1]);

  // ---- casino saloon
  const S = B.saloon, sy1 = H + 3.6;
  box(S.x0, H, S.z0, S.x1, sy1, S.z1, '#f4ead5');
  box(S.x0 - 0.05, sy1 - 0.45, S.z0 - 0.05, S.x1 + 0.05, sy1 - 0.25, S.z1 + 0.05, '#d4af37');
  box(S.x0 - 0.8, sy1, S.z0 - 0.8, S.x1 + 0.8, sy1 + 0.22, S.z1 + 0.8, '#ffffff');
  box(S.x0 - 0.8, sy1 + 0.22, S.z0 - 0.8, S.x1 + 0.8, sy1 + 0.34, S.z1 + 0.8, '#b8323a');
  // porch posts under the overhang
  for (let x = S.x0; x <= S.x1 + 0.01; x += 4) for (const z of [S.z0 - 0.7, S.z1 + 0.7]) b.add(M.vc, GEO.cyl, '#ffffff', mat4(x, H + 1.8, z, 0, 0.07, 3.6, 0.07));
  // arched windows (glow at night) with red frames, both long sides
  for (let x = S.x0 + 2; x < S.x1 - 1; x += 3.2) {
    if (Math.abs(x - B.door.x) < 2.2) continue;
    for (const [z, dz] of [[S.z0, -1], [S.z1, 1]]) {
      box(x - 0.9, H + 1.0, z + dz * 0.03 - 0.04, x + 0.9, H + 2.8, z + dz * 0.03 + 0.04, '#fff', M.glass);
      box(x - 1.0, H + 2.8, z + dz * 0.06 - 0.05, x + 1.0, H + 3.0, z + dz * 0.06 + 0.05, '#7a1f2b');
      box(x - 1.0, H + 0.9, z + dz * 0.06 - 0.05, x + 1.0, H + 1.0, z + dz * 0.06 + 0.05, '#7a1f2b');
      box(x - 0.03, H + 1.0, z + dz * 0.07 - 0.03, x + 0.03, H + 2.8, z + dz * 0.07 + 0.03, '#7a1f2b');
    }
  }
  // double doors, gold handles, striped awning
  box(B.door.x - 1.4, H, S.z0 - 0.08, B.door.x + 1.4, H + 2.7, S.z0 - 0.02, '#7a1f2b');
  box(B.door.x - 0.05, H, S.z0 - 0.1, B.door.x + 0.05, H + 2.7, S.z0 - 0.06, '#3a0d14');
  for (const s of [-1, 1]) b.add(M.vc, GEO.sph, '#d4af37', mat4(B.door.x + s * 0.25, H + 1.3, S.z0 - 0.12, 0, 0.06, 0.06, 0.06));
  for (let i = 0; i < 8; i++) box(B.door.x - 2 + i * 0.5, H + 2.9, S.z0 - 1.3, B.door.x - 1.5 + i * 0.5, H + 3.0, S.z0, i % 2 ? '#ffffff' : '#b8323a');
  col.addBox(S.x0, S.z0, S.x1, S.z1, H + 5, 'building');

  // ---- upper deck + pilothouse
  const uy0 = sy1 + 0.34, uy1 = uy0 + 2.3;
  box(S.x0 + 4, uy0, S.z0 + 1, S.x1 - 4, uy1, S.z1 - 1, '#f4ead5');
  box(S.x0 + 3.6, uy1, S.z0 + 0.6, S.x1 - 3.6, uy1 + 0.18, S.z1 - 0.6, '#ffffff');
  for (let x = S.x0 + 5.5; x < S.x1 - 5; x += 2.4) for (const z of [S.z0 + 1, S.z1 - 1]) box(x - 0.7, uy0 + 0.8, z - 0.05, x + 0.7, uy0 + 1.8, z + 0.05, '#fff', M.glass);
  for (let x = S.x0 - 0.6; x <= S.x1 + 0.6; x += 1.4) for (const z of [S.z0 - 0.6, S.z1 + 0.6]) b.add(M.vc, GEO.cyl, '#ffffff', mat4(x, uy0 + 0.45, z, 0, 0.03, 0.9, 0.03));
  for (const z of [S.z0 - 0.6, S.z1 + 0.6]) box(S.x0 - 0.6, uy0 + 0.88, z - 0.04, S.x1 + 0.6, uy0 + 0.94, z + 0.04, '#ffffff');
  const px0 = S.x1 - 4, px1 = S.x1 + 0.5;
  box(px0, uy1, ZC - 1.6, px1, uy1 + 2.2, ZC + 1.6, '#f4ead5');
  for (const z of [ZC - 1.62, ZC + 1.62]) box(px0 + 0.4, uy1 + 0.9, z - 0.04, px1 - 0.4, uy1 + 1.8, z + 0.04, '#fff', M.glass);
  box(px1 + 0.02, uy1 + 0.9, ZC - 1.2, px1 + 0.08, uy1 + 1.8, ZC + 1.2, '#fff', M.glass);
  box(px0 - 0.3, uy1 + 2.2, ZC - 1.9, px1 + 0.3, uy1 + 2.4, ZC + 1.9, '#b8323a');
  b.add(M.vc, GEO.cyl, '#d4af37', mat4(px1 - 1, uy1 + 2.9, ZC, 0, 0.05, 1.0, 0.05)); // horn
  // lifeboat on the upper deck
  b.add(M.vc, GEO.sph, '#ff7a1a', mat4(S.x0 + 6, uy1 + 0.55, ZC, 0, 2.2, 0.45, 0.8));

  // ---- twin smokestacks with gold feathered crowns
  const stackTop = uy1 + 6.2;
  for (const z of [ZC - 1.5, ZC + 1.5]) {
    b.add(M.vc, GEO.cyl16, '#1a1a1a', mat4(S.x0 + 14, (uy1 + stackTop) / 2, z, 0, 0.55, stackTop - uy1, 0.55));
    b.add(M.vc, GEO.cyl16, '#d4af37', mat4(S.x0 + 14, stackTop - 0.6, z, 0, 0.62, 0.18, 0.62));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add(M.vc, GEO.cone, '#d4af37', mat4(S.x0 + 14 + Math.cos(a) * 0.55, stackTop + 0.25, z + Math.sin(a) * 0.55, 0, 0.16, 0.6, 0.16, Math.sin(a) * 0.35, -Math.cos(a) * 0.35));
    }
  }

  // ---- bulb lights along the saloon roof edge, strings of lights stack-to-bow and stack-to-stern
  for (let x = S.x0 - 0.7; x <= S.x1 + 0.7; x += 0.9) for (const z of [S.z0 - 0.85, S.z1 + 0.85]) b.add(M.lamp, GEO.sph, '#fff', mat4(x, sy1 + 0.05, z, 0, 0.07, 0.07, 0.07));
  const string = (ax, ay, az, bx, by, bz, n, sag) => {
    for (let i = 1; i < n; i++) {
      const t = i / n;
      b.add(M.lamp, GEO.sph, '#fff', mat4(ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t, 0, 0.09, 0.09, 0.09));
    }
  };
  string(S.x0 + 14, stackTop - 1, ZC, B.x1 + B.bow - 0.5, H + 1.3, ZC, 26, 1.2);
  string(S.x0 + 14, stackTop - 1, ZC, B.x0 + 0.5, H + 1.3, ZC, 20, 1.0);
  b.add(M.vc, GEO.cyl, '#dddddd', mat4(B.x1 + B.bow - 0.5, H + 0.7, ZC, 0, 0.04, 1.4, 0.04)); // bow jack staff

  // ---- signs: roof marquee + hull name
  world.addSign('LUCKY LADY', { bg: '#1d0a2e', fg: '#ffd166', font: 'bold 96px Georgia, serif', sub: '★ CASINO • SLOTS • BLACKJACK • OPEN 6PM–2AM ★', subFont: 'bold 30px Georgia, serif', border: '#ff4fa3', emissive: 0.85, w: 1024, h: 240 }, B.door.x, uy0 + 1.2, S.z0 - 0.66, Math.PI, 8, 1.9, true);
  world.addSign('LUCKY LADY • BOCA RATON', { bg: '#f4f4ee', fg: '#1d2b53', font: 'bold 60px Georgia, serif', w: 1024, h: 110 }, B.x0 + 9, 0.8, B.z0 - 0.02, Math.PI, 7, 0.75);

  // ---- the paddle wheel (animated)
  const wheel = new THREE.Group();
  wheel.position.set(B.x0 - 3.1, 1.4, ZC);
  const wm = [];
  const addW = (geo, color, m) => { wm.push([geo, color, m]); };
  const R = 3.1;
  for (const z of [-4.2, 4.2]) addW(new THREE.TorusGeometry(R, 0.12, 6, 32), '#b8323a', mat4(0, 0, z));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (const z of [-4.2, 4.2]) addW(GEO.box, '#e8e0d0', new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * R / 2, Math.sin(a) * R / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)), new THREE.Vector3(R, 0.14, 0.14)));
    addW(GEO.box, '#b8323a', new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * (R - 0.35), Math.sin(a) * (R - 0.35), 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)), new THREE.Vector3(0.8, 0.12, 8.6)));
  }
  addW(GEO.cyl16, '#333333', mat4(0, 0, 0, 0, 0.3, 9.2, 0.3, Math.PI / 2));
  const wmesh = new THREE.Mesh(mergeParts(wm), M.vc);
  wmesh.castShadow = true;
  wheel.add(wmesh);
  world.root.add(wheel);
  world.paddleWheel = wheel;
  // wheel housing (half drum) + stern flag
  const hous = new THREE.CylinderGeometry(R + 0.5, R + 0.5, 9.2, 20, 1, true, -Math.PI / 2, Math.PI);
  b.add(M.vc, hous, '#f4ead5', mat4(B.x0 - 3.1, 1.6, ZC, 0, 1, 1, 1, -Math.PI / 2)); // axis along z, arc over the top
  box(B.x0 - 6.4, 1.5, ZC - 4.7, B.x0 - 0.1, 1.7, ZC + 4.7, '#b8323a');
  b.add(M.vc, GEO.cyl, '#dddddd', mat4(B.x0 + 0.6, H + 2, ZC, 0, 0.04, 4, 0.04));
  box(B.x0 + 0.6, H + 3.2, ZC - 0.02, B.x0 + 0.62, H + 3.9, ZC + 1.1, '#b8323a');
  box(B.x0 + 0.6, H + 3.55, ZC - 0.02, B.x0 + 0.63, H + 3.9, ZC + 0.5, '#23408e');

  world.poi('casino', B.door.x, B.door.z, 'Lucky Lady Casino', 2.6);
  // the Captain's cabin door on the bow end of the saloon
  box(S.x1 + 0.02, H, ZC - 0.7, S.x1 + 0.1, H + 2.4, ZC + 0.7, '#5a2a1a');
  box(S.x1 + 0.05, H + 2.4, ZC - 0.85, S.x1 + 0.14, H + 2.55, ZC + 0.85, '#d4af37');
  b.add(M.vc, GEO.sph, '#d4af37', mat4(S.x1 + 0.14, H + 1.2, ZC + 0.45, 0, 0.06, 0.06, 0.06));
  world.addSign('CAPTAIN — PRIVATE', { bg: '#1d2b53', fg: '#ffd166', font: 'bold 48px Georgia, serif', w: 512, h: 96 }, S.x1 + 0.12, H + 2.1, ZC, Math.PI / 2, 1.2, 0.22);
  world.poi('cabin', S.x1 + 1.1, ZC, "Captain's Cabin", 1.8);
}

export function updateBoat(world, dt) {
  if (world.paddleWheel) world.paddleWheel.rotation.z += dt * 0.35;
}

// Minimap silhouette for the beach overlay.
export function paintBoat(g, P, ppm) {
  const [x0, z0] = P(BOAT.x0, BOAT.z0);
  g.fillStyle = '#f4f4ee';
  g.fillRect(x0, z0, (BOAT.x1 - BOAT.x0 + BOAT.bow) * ppm, (BOAT.z1 - BOAT.z0) * ppm);
  g.fillStyle = '#b8323a';
  const [sx, sz] = P(BOAT.saloon.x0, BOAT.saloon.z0);
  g.fillRect(sx, sz, (BOAT.saloon.x1 - BOAT.saloon.x0) * ppm, (BOAT.saloon.z1 - BOAT.saloon.z0) * ppm);
}
