// THE GOLDEN GARTER — "Boca's Premier Gentlemen's & Gentlewomen's Club, est. 1958", on Beach Rd just
// north of the Rusty Pelican. A pink-stucco box with a neon leg kicking on the roof; inside, a runway and
// a brass pole, tip-rail stools, red vinyl booths, a bar, a DJ booth, a velvet-roped Champagne Room and a
// disco ball. The dancers are 78, 84 and 79. The bouncer is 91. Open 4PM–2AM, $10 cover.
// Tip the dancers, make it rain, buy a "private dance" (it's mostly about her grandkids), or win
// Amateur Night (9PM–1AM) on the pole yourself. Everybody keeps their clothes on. Mostly cardigans.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { heightAt } from '../world/terrain.js';
import { makeSignTexture } from '../gfx/textures.js';
import { audio } from '../core/audio.js';
import { pick, rand, clamp, money, chance } from '../core/utils.js';

export const CLUB = { x: 342, z: 150, hw: 11, hd: 8, h: 5.2 };
const TOP = 0.75; // stage deck height
const POLE = { x: 0, z: 1.0 }; // local coords: x east, z north; the door is in the south wall
const W = (lx, lz) => ({ x: CLUB.x + lx, z: CLUB.z + lz });
const end = (name, text, title = '') => ({ name, title, text, choices: [{ text: 'Leave', action: () => null }] });
const box = () => document.getElementById('mg-box');
let built = null; // the building outlives a New Game (like the dealer's lot); the people don't

export function clubOpen(g) {
  const m = g.state.minutes;
  return m >= 16 * 60 || m < 2 * 60;
}
// a "night" runs 4PM to 2AM, so the cover you paid at 11PM still counts at 1AM
const nightKey = (g) => (g.state.minutes < 4 * 60 ? g.state.day - 1 : g.state.day);
const amateurHours = (g) => { const m = g.state.minutes; return m >= 21 * 60 || m < 60; };
export function insideClub(x, z) {
  return Math.abs(x - CLUB.x) < CLUB.hw - 0.3 && Math.abs(z - CLUB.z) < CLUB.hd - 0.3;
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// casino carpet: plum with gold starbursts and teal squiggles. Hides every stain since 1958.
const carpetTex = () => canvasTex(256, 256, (g) => {
  g.fillStyle = '#3b1240';
  g.fillRect(0, 0, 256, 256);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const x = r() * 256, y = r() * 256;
    g.strokeStyle = '#1f8a8a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + 14, y - 16, x + 22, y + 16, x + 36, y);
    g.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const x = r() * 256, y = r() * 256, rr = 5 + r() * 7;
    g.strokeStyle = i % 3 ? '#d4af37' : '#ff6fb5';
    g.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      g.stroke();
    }
  }
}, [5, 4]);

// gold tinsel curtain behind the stage
const tinselTex = () => canvasTex(256, 128, (g, w, h) => {
  for (let x = 0; x < w; x += 2) {
    const v = 0.55 + Math.random() * 0.45;
    g.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(200 * v)},${Math.round(60 * v)})`;
    g.fillRect(x, 0, 2, h);
  }
  for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(255,255,230,0.9)'; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); }
}, [6, 1]);

// the neon leg on the roof: a can-can kick in pink tube, fishnet, gold garter, red heel
const legTex = () => canvasTex(256, 512, (g) => {
  g.lineCap = g.lineJoin = 'round';
  const leg = () => {
    g.beginPath();
    g.moveTo(96, 500); // hip (pivot, bottom of the sign)
    g.bezierCurveTo(70, 380, 92, 300, 118, 230); // back of the thigh to the knee
    g.bezierCurveTo(132, 180, 140, 120, 150, 70); // calf
    g.lineTo(176, 40); // ankle, up into the heel
    g.lineTo(200, 34);
    g.lineTo(186, 70);
    g.bezierCurveTo(176, 140, 168, 200, 160, 240); // shin
    g.bezierCurveTo(150, 300, 168, 400, 160, 500); // front of the thigh
  };
  g.save();
  leg();
  g.clip();
  g.strokeStyle = 'rgba(255,79,163,0.55)'; // fishnet
  g.lineWidth = 2;
  for (let d = -600; d < 600; d += 16) {
    g.beginPath(); g.moveTo(d, 0); g.lineTo(d + 512, 512); g.stroke();
    g.beginPath(); g.moveTo(d + 512, 0); g.lineTo(d, 512); g.stroke();
  }
  g.restore();
  g.shadowColor = '#ff4fa3';
  g.shadowBlur = 18;
  g.strokeStyle = '#ffd0e8';
  g.lineWidth = 9;
  leg();
  g.stroke();
  g.strokeStyle = '#ff4fa3';
  g.lineWidth = 5;
  g.stroke();
  // the garter
  g.shadowColor = '#ffb000';
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 12;
  g.beginPath(); g.moveTo(82, 400); g.quadraticCurveTo(122, 388, 166, 404); g.stroke();
  // the heel
  g.shadowColor = '#ff2a2a';
  g.fillStyle = '#ff3b3b';
  g.beginPath(); g.moveTo(150, 70); g.lineTo(178, 36); g.lineTo(214, 28); g.lineTo(200, 66); g.lineTo(186, 74); g.closePath(); g.fill();
  g.fillRect(208, 20, 6, 30);
});

// ---------------------------------------------------------------- the building (once)
function build(g) {
  if (built) return built;
  const { hw, hd, h: H } = CLUB;
  const y0 = heightAt(CLUB.x, CLUB.z);
  const col = g.world.col;
  const matte = [], shiny = [], gold = [], roof = [], neon = [];
  const B = (list, x0, ya, z0, x1, yb, z1, c) => list.push([GEO.box, c, mat4(CLUB.x + (x0 + x1) / 2, y0 + (ya + yb) / 2, CLUB.z + (z0 + z1) / 2, 0, x1 - x0, yb - ya, z1 - z0)]);
  const C = (list, geo, c, lx, y, lz, sx, sy, sz, ry = 0, rx = 0, rz = 0) => list.push([geo, c, mat4(CLUB.x + lx, y0 + y, CLUB.z + lz, ry, sx, sy, sz, rx, rz)]);
  const PINK = '#e0679f', PLUM = '#3a1030', BLACK = '#141014', GOLD = '#d4af37', RED = '#9b1b30';

  // ---- shell: pink stucco outside, plum inside, a doorway just too narrow for a golf cart
  B(matte, -hw, -0.5, -hd, -hw + 0.3, H, hd, PINK);
  B(matte, hw - 0.3, -0.5, -hd, hw, H, hd, PINK);
  B(matte, -hw, -0.5, hd - 0.3, hw, H, hd, PINK);
  B(matte, -hw, -0.5, -hd, -1.1, H, -hd + 0.3, PINK);
  B(matte, 1.1, -0.5, -hd, hw, H, -hd + 0.3, PINK);
  B(matte, -1.1, 2.7, -hd, 1.1, H, -hd + 0.3, PINK);
  for (const [x0, z0, x1, z1] of [[-hw, -hd, -hw + 0.3, hd], [hw - 0.3, -hd, hw, hd], [-hw, hd - 0.3, hw, hd], [-hw, -hd, -1.1, -hd + 0.3], [1.1, -hd, hw, -hd + 0.3]]) {
    col.addBox(CLUB.x + x0, CLUB.z + z0, CLUB.x + x1, CLUB.z + z1, H + 0.7, 'building');
  }
  B(matte, -hw + 0.3, -0.1, -hd + 0.3, -hw + 0.36, H, hd - 0.3, PLUM);
  B(matte, hw - 0.36, -0.1, -hd + 0.3, hw - 0.3, H, hd - 0.3, PLUM);
  B(matte, -hw + 0.3, -0.1, hd - 0.36, hw - 0.3, H, hd - 0.3, PLUM);
  B(matte, -hw + 0.3, -0.1, -hd + 0.3, -1.1, H, -hd + 0.36, PLUM);
  B(matte, 1.1, -0.1, -hd + 0.3, hw - 0.3, H, -hd + 0.36, PLUM);
  B(matte, -1.1, 2.7, -hd + 0.3, 1.1, H, -hd + 0.36, PLUM);
  // black base + gold cornice outside
  for (const [x0, z0, x1, z1] of [[-hw - 0.06, -hd - 0.06, hw + 0.06, -hd + 0.01], [-hw - 0.06, hd - 0.01, hw + 0.06, hd + 0.06], [-hw - 0.06, -hd, -hw + 0.01, hd], [hw - 0.01, -hd, hw + 0.06, hd]]) {
    B(gold, x0, H - 0.28, z0, x1, H - 0.12, z1, GOLD);
    if (z1 - z0 < 1 && z0 < 0) { // the front: base strip either side of the door
      B(matte, x0, -0.3, z0, -1.1, 0.45, z1, BLACK);
      B(matte, 1.1, -0.3, z0, x1, 0.45, z1, BLACK);
    } else B(matte, x0, -0.3, z0, x1, 0.45, z1, BLACK);
  }
  // pink neon tubing: along the base and the cornice of the front, and up the front corners
  for (const yy of [0.62, H - 0.42]) { B(neon, -hw - 0.1, yy, -hd - 0.1, -1.4, yy + 0.07, -hd - 0.04, '#fff'); B(neon, 1.4, yy, -hd - 0.1, hw + 0.1, yy + 0.07, -hd - 0.04, '#fff'); }
  for (const x of [-hw - 0.1, hw + 0.03]) B(neon, x, 0.62, -hd - 0.1, x + 0.07, H - 0.35, -hd - 0.04, '#fff');
  for (const z of [-hd - 0.1, hd + 0.03]) for (const x of [-hw - 0.1, hw + 0.03]) if (z > 0) B(neon, x, 0.62, z, x + 0.07, H - 0.35, z + 0.07, '#fff');
  // gold door frame, velvet curtains tied back inside, striped awning outside
  B(gold, -1.28, 0, -hd - 0.08, -1.08, 2.85, -hd + 0.04, GOLD);
  B(gold, 1.08, 0, -hd - 0.08, 1.28, 2.85, -hd + 0.04, GOLD);
  B(gold, -1.28, 2.68, -hd - 0.08, 1.28, 2.88, -hd + 0.04, GOLD);
  B(matte, -1.08, 0, -hd + 0.36, -0.82, 2.65, -hd + 0.6, RED);
  B(matte, 0.82, 0, -hd + 0.36, 1.08, 2.65, -hd + 0.6, RED);
  for (let i = 0; i < 8; i++) C(matte, GEO.box, i % 2 ? '#ffffff' : '#ff6fb5', -2.1 + i * 0.6 + 0.3, 3.15, -hd - 0.85, 0.6, 0.06, 1.8, 0, -0.32);
  // roof: flat, with a pink parapet. Its underside is the ceiling (the camera stays under it indoors).
  B(roof, -hw, H, -hd, hw, H + 0.22, hd, '#1a0a18');
  B(roof, -hw, H + 0.22, -hd, hw, H + 0.7, -hd + 0.25, PINK);
  B(roof, -hw, H + 0.22, hd - 0.25, hw, H + 0.7, hd, PINK);
  B(roof, -hw, H + 0.22, -hd, -hw + 0.25, H + 0.7, hd, PINK);
  B(roof, hw - 0.25, H + 0.22, -hd, hw, H + 0.7, hd, PINK);
  C(roof, GEO.box, '#666', 5, H + 0.75, 3, 2.2, 1.1, 1.6); // AC unit, held together by prayer

  // ---- the stage: main deck, runway, round pole platform, gold edge lights
  B(shiny, -7, -0.4, 4.6, 7, TOP, hd - 0.36, BLACK);
  B(shiny, -1.0, -0.4, 1.0, 1.0, TOP, 4.6, BLACK);
  C(shiny, GEO.cyl16, BLACK, POLE.x, (TOP - 0.4) / 2, POLE.z, 1.6, TOP + 0.4, 1.6);
  for (const [x0, x1] of [[-7, -1.0], [1.0, 7]]) B(gold, x0, TOP - 0.1, 4.56, x1, TOP - 0.02, 4.62, '#ffd23f');
  for (const x of [-1.02, 1.0]) B(gold, x, TOP - 0.1, 2.5, x + 0.04, TOP - 0.02, 4.6, '#ffd23f');
  gold.push([new THREE.TorusGeometry(1.6, 0.035, 6, 40).rotateX(Math.PI / 2), '#ffd23f', mat4(CLUB.x + POLE.x, y0 + TOP - 0.06, CLUB.z + POLE.z)]);
  // tip-rail stools round the platform and along the runway
  const stools = [];
  for (const a of [Math.PI - 1.1, Math.PI - 0.55, Math.PI, Math.PI + 0.55, Math.PI + 1.1]) stools.push([POLE.x + Math.sin(a) * 2.4, POLE.z + Math.cos(a) * 2.4]);
  for (const x of [-1.8, 1.8]) for (const z of [2.9, 4.0]) stools.push([x, z]);
  // bar stools
  for (const z of [-5.6, -3.8, -2.0, -0.2]) stools.push([7.0, z]);
  for (const [x, z] of stools) {
    C(shiny, GEO.cyl16, RED, x, 0.63, z, 0.24, 0.09, 0.24);
    C(shiny, GEO.cyl, '#c9ced1', x, 0.32, z, 0.035, 0.6, 0.035);
    C(shiny, GEO.cyl16, '#c9ced1', x, 0.02, z, 0.2, 0.04, 0.2);
    col.addCircle(CLUB.x + x, CLUB.z + z, 0.26, 0.7, 'stool');
  }
  // the bar: dark wood, black top, brass foot rail, a wall of bottles
  B(matte, 7.6, -0.3, -6.6, 8.4, 1.04, 1.2, '#4a2614');
  B(shiny, 7.5, 1.04, -6.7, 8.5, 1.12, 1.3, '#1d1d1d');
  B(gold, 7.42, 0.18, -6.6, 7.47, 0.24, 1.2, GOLD);
  B(matte, 10.3, -0.1, -6.2, 10.64, 2.5, 0.8, '#3a1d0e');
  for (const yy of [1.15, 1.85]) {
    B(matte, 10.0, yy - 0.06, -6.2, 10.64, yy, 0.8, '#2a140a');
    for (let z = -6.0; z < 0.6; z += 0.32) C(shiny, GEO.cyl, pick(['#2f7a3a', '#7a2f2f', '#c9a227', '#e8e0c8', '#3a6fb0', '#5a3a1a']), 10.25, yy + 0.18, z, 0.05, 0.36, 0.05);
  }
  col.addBox(CLUB.x + 7.5, CLUB.z - 6.7, CLUB.x + 8.5, CLUB.z + 1.3, 1.3, 'bar');
  // the DJ booth, east of the stage
  B(matte, 8.4, -0.1, 3.0, 9.5, 1.1, 4.4, BLACK);
  B(shiny, 8.35, 1.1, 2.95, 9.55, 1.16, 4.45, '#2a2a2a');
  C(shiny, GEO.cyl16, '#111', 8.95, 1.2, 3.4, 0.22, 0.04, 0.22); // turntables
  C(shiny, GEO.cyl16, '#111', 8.95, 1.2, 4.0, 0.22, 0.04, 0.22);
  col.addBox(CLUB.x + 8.35, CLUB.z + 2.95, CLUB.x + 9.55, CLUB.z + 4.45, 1.3, 'dj');
  // booths along the west wall
  for (const zc of [-0.8, 2.8]) {
    B(matte, -10.64, -0.1, zc - 1.15, -9.8, 0.48, zc + 1.15, RED);
    B(matte, -10.64, 0.48, zc - 1.15, -10.4, 1.3, zc + 1.15, RED);
    B(matte, -10.64, -0.1, zc - 1.3, -9.4, 0.8, zc - 1.1, RED);
    B(matte, -10.64, -0.1, zc + 1.1, -9.4, 0.8, zc + 1.3, RED);
    C(shiny, GEO.cyl16, BLACK, -8.9, 0.74, zc, 0.55, 0.05, 0.55);
    C(shiny, GEO.cyl, '#c9ced1', -8.9, 0.37, zc, 0.05, 0.72, 0.05);
    col.addBox(CLUB.x - 10.7, CLUB.z + zc - 1.3, CLUB.x - 9.4, CLUB.z + zc + 1.3, 1.3, 'booth');
    col.addCircle(CLUB.x - 8.9, CLUB.z + zc, 0.55, 0.8, 'table');
  }
  // two cocktail tables in the middle of the room
  for (const [x, z] of [[-4.2, -3.6], [3.6, -4.6]]) {
    C(shiny, GEO.cyl16, BLACK, x, 0.74, z, 0.5, 0.05, 0.5);
    C(shiny, GEO.cyl, '#c9ced1', x, 0.37, z, 0.05, 0.72, 0.05);
    col.addCircle(CLUB.x + x, CLUB.z + z, 0.5, 0.8, 'table');
  }
  // the Champagne Room: a plum partition, a velvet curtain and a roped gap in the SW corner
  B(matte, -10.64, -0.1, -3.7, -6.8, 3.4, -3.55, PLUM);
  B(matte, -6.95, -0.1, -7.64, -6.8, 3.3, -5.3, RED);
  B(matte, -10.6, -0.1, -7.6, -9.0, 0.5, -6.6, '#e05a9a'); // a heart-shaped loveseat (it's heart-shaped in spirit)
  B(matte, -10.6, 0.5, -7.6, -10.35, 1.25, -6.6, '#e05a9a');
  col.addBox(CLUB.x - 10.7, CLUB.z - 3.75, CLUB.x - 6.8, CLUB.z - 3.5, 3.4, 'vip');
  col.addBox(CLUB.x - 7.0, CLUB.z - 7.7, CLUB.x - 6.75, CLUB.z - 5.3, 3.3, 'vip');
  for (const z of [-5.2, -3.85]) { C(gold, GEO.cyl, GOLD, -6.85, 0.45, z, 0.04, 0.9, 0.04); C(gold, GEO.sph, GOLD, -6.85, 0.93, z, 0.06, 0.06, 0.06); }
  C(matte, GEO.cyl, RED, -6.85, 0.82, -4.52, 0.035, 1.3, 0.035, 0, Math.PI / 2);
  col.addBox(CLUB.x - 6.95, CLUB.z - 5.3, CLUB.x - 6.75, CLUB.z - 3.75, 1.0, 'rope');
  // the velvet rope line out front (and Moose's spot beside it)
  for (const x of [2.0, 4.6]) {
    C(gold, GEO.cyl, GOLD, x, 0.45, -hd - 1.3, 0.045, 0.9, 0.045);
    C(gold, GEO.sph, GOLD, x, 0.93, -hd - 1.3, 0.07, 0.07, 0.07);
    col.addCircle(CLUB.x + x, CLUB.z - hd - 1.3, 0.12, 1.2, 'post');
  }
  C(matte, GEO.cyl, RED, 3.3, 0.8, -hd - 1.3, 0.04, 2.6, 0.04, 0, 0, Math.PI / 2);

  const add = (parts, mat, cast = true) => {
    const m = new THREE.Mesh(mergeParts(parts), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    g.scene.add(m);
    return m;
  };
  add(matte, M.vc);
  add(shiny, M.vcShiny);
  const goldMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, emissive: 0xffb000, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.6 });
  add(gold, goldMat, false);
  const roofMesh = add(roof, M.vc);
  add(neon, M.neon, false);

  // carpet that follows the (gently sloping) sand underneath
  const fw = hw * 2 - 0.6, fd = hd * 2 - 0.6;
  const fg = new THREE.PlaneGeometry(fw, fd, 22, 16).rotateX(-Math.PI / 2);
  const pos = fg.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(CLUB.x + pos.getX(i), CLUB.z + pos.getZ(i)) + 0.03);
  fg.computeVertexNormals();
  const floor = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: 0.95 }));
  floor.position.set(CLUB.x, 0, CLUB.z);
  floor.receiveShadow = true;
  g.scene.add(floor);
  // the pole, the tinsel curtain, signs
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, H - TOP, 12), M.chrome);
  pole.position.set(CLUB.x + POLE.x, y0 + TOP + (H - TOP) / 2, CLUB.z + POLE.z);
  g.scene.add(pole);
  const tinsel = new THREE.Mesh(new THREE.PlaneGeometry(13.8, H - TOP), new THREE.MeshStandardMaterial({ map: tinselTex(), emissive: 0x6a4a00, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.7 }));
  tinsel.position.set(CLUB.x, y0 + TOP + (H - TOP) / 2, CLUB.z + hd - 0.38);
  tinsel.rotation.y = Math.PI;
  g.scene.add(tinsel);
  const glowSign = (text, opts, w, h, x, y, z, ry, k = 1) => {
    const t = makeSignTexture(text, opts);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.5 }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.userData.k = k;
    g.scene.add(m);
    return m;
  };
  const signs = [
    glowSign('THE GOLDEN GARTER', { w: 1024, h: 180, bg: '#14061a', fg: '#ffd23f', border: '#ff4fa3', font: 'bold 92px Georgia, serif', sub: "GENTLEMEN'S & GENTLEWOMEN'S CLUB • EST. 1958", subFont: 'bold 32px sans-serif', glow: '#ffb000' }, 12, 2.1, CLUB.x, y0 + 4.05, CLUB.z - hd - 0.04, Math.PI),
    glowSign('★ THE GARTER GIRLS (AND REX) ★', { w: 1024, h: 128, bg: '#14061a', fg: '#ff6fb5', border: '#ffd23f', font: 'bold 64px Georgia, serif', glow: '#ff4fa3' }, 7, 0.9, CLUB.x, y0 + H - 0.75, CLUB.z + hd - 0.42, Math.PI),
    glowSign('BAR', { w: 256, h: 128, bg: null, fg: '#7cf7ff', font: 'bold 96px "Trebuchet MS", sans-serif', glow: '#1fd1e0' }, 1.6, 0.8, CLUB.x + hw - 0.4, y0 + 3.2, CLUB.z - 2.6, -Math.PI / 2),
    glowSign('CHAMPAGNE ROOM', { w: 512, h: 96, bg: null, fg: '#ff6fb5', font: 'bold 64px Georgia, serif', glow: '#ff4fa3' }, 3.2, 0.6, CLUB.x - 8.7, y0 + 3.0, CLUB.z - 3.5, 0),
  ];
  // the marquee on two posts out by the lot
  const mq = glowSign('EARLY BIRD SHOW 4:30 • AMATEUR NIGHT 9PM', { w: 1024, h: 160, bg: '#fff8e6', fg: '#b8323a', border: '#d4af37', font: 'bold 54px Impact, sans-serif', sub: "SENIOR DISCOUNT ALL NIGHT • NO TOUCHING (YOU'LL BREAK SOMETHING)", subFont: 'bold 30px sans-serif' }, 6.4, 1.0, CLUB.x - 6, y0 + 2.2, CLUB.z - hd - 4.04, Math.PI, 0.35);
  signs.push(mq);
  for (const dx of [-3, 3]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.9, 0.14), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    p.position.set(CLUB.x - 6 + dx, y0 + 1.45, CLUB.z - hd - 4.0);
    g.scene.add(p);
    col.addCircle(CLUB.x - 6 + dx, CLUB.z - hd - 4.0, 0.15, 3, 'post');
  }
  // the kicking neon leg on the roof (pivots at the hip)
  const legMat = new THREE.MeshBasicMaterial({ map: legTex(), transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const legPivot = new THREE.Group();
  legPivot.position.set(CLUB.x - 6.5, y0 + H + 0.6, CLUB.z - hd + 1.2);
  const leg = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 4.0), legMat);
  leg.position.set(0.35, 1.95, 0);
  leg.rotation.y = Math.PI;
  legPivot.add(leg);
  g.scene.add(legPivot);
  // the disco ball
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1, flatShading: true, emissive: 0x332233 }));
  ball.position.set(CLUB.x, y0 + H - 0.75, CLUB.z + 2.6);
  g.scene.add(ball);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), M.chrome);
  rod.position.set(CLUB.x, y0 + H - 0.35, CLUB.z + 2.6);
  g.scene.add(rod);
  // lights: a pink wash, a purple wash and a spot on the pole. Kept in the scene at 0 so shaders never recompile.
  const pink = new THREE.PointLight(0xff3fa0, 0, 15, 1.4);
  pink.position.set(CLUB.x - 4, y0 + 3.6, CLUB.z - 2);
  const purple = new THREE.PointLight(0x7b5cff, 0, 15, 1.4);
  purple.position.set(CLUB.x + 4, y0 + 3.6, CLUB.z + 2.5);
  const spot = new THREE.SpotLight(0xffd6ec, 0, 14, 0.42, 0.55, 1.2);
  spot.position.set(CLUB.x, y0 + H - 0.2, CLUB.z - 2.6);
  spot.target.position.set(CLUB.x + POLE.x, y0 + TOP + 0.8, CLUB.z + POLE.z);
  // and a pink wash on the facade so the place reads from the lot at night
  const wash = new THREE.PointLight(0xff5fae, 0, 16, 1.5);
  wash.position.set(CLUB.x, y0 + 2.6, CLUB.z - hd - 3.2);
  g.scene.add(pink, purple, spot, spot.target, wash);
  // the doorway "collider" Moose controls: on until you've paid (and while it's closed)
  const door = col.addBox(CLUB.x - 1.1, CLUB.z - hd - 0.05, CLUB.x + 1.1, CLUB.z - hd + 0.4, 3, 'door');
  g.world.poi('garter', CLUB.x, CLUB.z - hd - 1, 'The Golden Garter', 0); // map icon only
  g.world.poi('gg_vip', CLUB.x - 6.2, CLUB.z - 4.5, 'Champagne Room (VIP)', 1.4);
  built = { y0, roofMesh, door, pink, purple, spot, wash, ball, legPivot, legMat, signs, goldMat };
  return built;
}

// ---------------------------------------------------------------- the people
const DANCERS = [
  { key: 'dolores', name: 'Dolores "Hip Replacement" Fontaine', short: 'Dolores', age: 78, female: true, spot: [POLE.x - 0.32, POLE.z, Math.PI], act: 'pole', look: { shirt: 9, hair: '#f4f1de', sweater: '#ff8fc8', glasses: 'big', hat: 'none', skin: '#f1c7a5', belly: 0.92, shoe: '#ff4fa3', sock: '#ffffff' },
    bio: '"Forty-one years on this pole, sugar. Two new hips, both titanium. I set off the metal detector at the airport and I make it LOOK GOOD."',
    vip: 'Three songs. She talked about her grandson\'s divorce for two of them. During the third her hip locked, and you held her up like a ballroom partner while Moose found the WD-40. Somehow it was the most intimate moment of your life.' },
  { key: 'bunny', name: 'Bunny Kowalski', short: 'Bunny', age: 84, female: true, spot: [-3.8, 6.1, Math.PI], act: 'shimmy', look: { shirt: 8, hair: '#c0392b', sweater: '#fff3f8', glasses: 'none', hat: 'none', skin: '#e8b996', belly: 0.95, shoe: '#d4af37', sock: '#ffffff' },
    bio: '"Rockette, 1962. Dental hygienist, 1963 to 2001. Widowed twice. This is my third career and honey, it\'s the only one with tips."',
    vip: 'She did the Rockettes high kick, for old times\' sake. It connected with the ceiling fan. Nobody was hurt. The fan has been retired with full honors. She charged you for the fan.' },
  { key: 'rex', name: 'Rex "The Silver Stallion" Delgado', short: 'Rex', age: 79, female: false, spot: [3.8, 6.1, Math.PI], act: 'thrust', look: { shirt: 10, hair: '#dcdcdc', mustache: true, glasses: 'aviator', hat: 'fedora', hatColor: '#111111', skin: '#c68863', belly: 1.05, height: 1.03, shorts: '#111111', shoe: '#111111', sock: '#111111' },
    bio: '"Tuesdays I dance for the ladies. The other six nights I dance for whoever\'s tipping. My doctor says no more splits. My doctor doesn\'t tip."',
    vip: 'He leaned in close, whispered "you remind me of my third wife," and then did forty-five seconds of the Macarena with the conviction of a man defusing a bomb. You tipped him extra. You don\'t know why.' },
];
const PATRONS = [[-1.0, -1.25], [1.3, -0.95], [-1.8, 2.9], [1.8, 4.0], [7.0, -2.0]];
const CROWD_BARKS = ['TAKE IT OFF! ...THE CARDIGAN, I MEAN!', 'WORK IT, DOLORES!', 'Somebody check Bunny\'s pulse! ...She\'s fine! She\'s FINE!', 'I came for the buffet. There\'s no buffet. I stayed anyway.', 'Don\'t sit in the front row. Bunny\'s kicks have RANGE.', 'My wife thinks I\'m at bridge. My wife is at bridge. With REX.', 'Is it hot in here or is it my hot flashes?', 'ENCORE! ...but slower!'];
const DANCER_BARKS = { dolores: ['Tip your dancers! We\'re on a FIXED INCOME!', 'Careful, sugar, that\'s my good hip.', 'Forty-one years and I still got it. I just can\'t find it.'], bunny: ['Eyes up here, Herbert.', 'Five, six, seven, eight — oh, my BACK!', 'Singles, honey. Not coupons.'], rex: ['¡Ay, mamacitas! Also papacitos!', 'The Stallion is IN THE BUILDING.', 'Who wants to see the hip? You don\'t. You do.'] };

export class StripClub {
  constructor(g) {
    this.g = g;
    this.b = build(g);
    this.t = 0;
    this.inside = false;
    this.barkT = rand(4, 9);
    g.state.club ||= { tips: 0, paid: -99, amateur: -99, wins: 0 };
    const y0 = this.b.y0;
    this.dancers = DANCERS.map((d) => {
      const [lx, lz] = d.spot;
      const p = W(lx, lz);
      const n = g.spawnNPC({ name: d.name, female: d.female, role: 'dancer', x: p.x, z: p.z, state: 'static', look: { female: d.female, ...d.look }, homePt: { x: p.x, z: p.z } });
      n.data.dancer = d;
      n.data.quiet = true;
      this.pose(n, lx, lz, d.spot[2], { y: y0 + TOP, act: d.act, actDur: 4 });
      return n;
    });
    const staff = (name, female, role, lx, lz, ry, look) => {
      const p = W(lx, lz);
      const n = g.spawnNPC({ name, female, role, x: p.x, z: p.z, state: 'static', hp: role === 'bouncer' ? 260 : undefined, dmg: role === 'bouncer' ? 22 : undefined, look: { female, ...look }, homePt: { x: p.x, z: p.z } });
      n.data.quiet = true;
      this.pose(n, lx, lz, ry);
      return n;
    };
    this.moose = staff('Moose Malone', false, 'bouncer', 1.7, -CLUB.hd - 0.9, Math.PI, { shirt: 2, glasses: 'aviator', hat: 'none', hair: '#dcdcdc', belly: 1.55, height: 1.09, skin: '#8d5a3b', mustache: true, shorts: '#1d1d1d', sweater: '#111111' });
    this.lorraine = staff('Lorraine', true, 'clubbar', 9.3, -2.6, -Math.PI / 2, { shirt: 11, hair: '#1c1c1c', glasses: 'readers', hat: 'none', skin: '#f1c7a5', belly: 1.05 });
    this.dj = staff('DJ Arthur Itis', false, 'clubdj', 10.0, 3.7, -Math.PI / 2, { shirt: 5, hat: 'cap', hatColor: '#111111', glasses: 'aviator', hair: '#9a9a9a', belly: 1.15 });
    this.dj.data.stand.act = 'dance';
    this.patrons = PATRONS.map(([lx, lz], i) => {
      const p = W(lx, lz);
      const n = g.spawnNPC({ female: i === 2, role: 'clubber', x: p.x, z: p.z, state: 'static', homePt: { x: p.x, z: p.z } });
      n.data.quiet = true;
      const ry = i === 4 ? Math.PI / 2 : Math.atan2(POLE.x - lx, POLE.z - lz);
      this.pose(n, lx, lz, ry, { y: y0 + 0.67 - 0.86, mode: 'sit' });
      return n;
    });
    this.all = [...this.dancers, this.moose, this.lorraine, this.dj, ...this.patrons];
  }

  // park someone on a spot: on the stage, a stool, behind the bar
  pose(n, lx, lz, ry, o = {}) {
    const p = W(lx, lz);
    n.x = p.x; n.z = p.z;
    n.y = o.y ?? heightAt(p.x, p.z);
    n.heading = ry;
    n.data.stand = { t: Infinity, y: n.y, ry, mode: o.mode || 'idle', act: o.act || null, actDur: o.actDur || 3 };
    n.data.spot = [lx, lz, ry, o];
    n.char.root.position.set(n.x, n.y, n.z);
    n.char.root.rotation.y = ry;
  }

  // every frame, even with a dialogue or Amateur Night open: lights, the leg, the ball
  animate(dt) {
    const g = this.g, b = this.b, p = g.player;
    this.t += dt;
    const night = g.sky ? g.sky.night : 0;
    const open = clubOpen(g);
    const d = Math.hypot(p.x - CLUB.x, p.z - CLUB.z);
    b.legPivot.rotation.z = open ? -0.15 + Math.max(0, Math.sin(this.t * 2.4)) * 0.75 : -0.15;
    b.legMat.color.setScalar(open ? 0.55 + night * 0.65 : 0.25);
    for (const s of b.signs) s.material.emissiveIntensity = (open ? 0.2 + night * 0.55 : 0.06) * s.userData.k;
    b.wash.intensity = open && d < 80 ? night * 14 : 0;
    b.goldMat.emissiveIntensity = open ? 0.3 + night * 0.4 : 0.05;
    b.ball.rotation.y += dt * 0.6;
    const lit = open && d < 34;
    const pulse = 0.75 + Math.sin(this.t * 3.1) * 0.25;
    b.pink.intensity = lit ? 26 * pulse : 0;
    b.purple.intensity = lit ? 26 * (1.5 - pulse) : 0;
    b.spot.intensity = lit ? 32 : 0;
    g.camRig.ceiling = this.inside && !g.camRig.cinematic ? b.y0 + CLUB.h - 0.35 : null;
    // keep the dancers dancing (actions run out; the show must go on)
    for (const n of this.all) {
      const st = n.data.stand;
      if (st && st.act && !n.char.action && open) n.char.play(st.act, st.actDur);
    }
  }

  update(dt) {
    const g = this.g, p = g.player, s = g.state.club;
    const open = clubOpen(g);
    const paid = s.paid === nightKey(g);
    this.b.door.h = open && paid ? -1 : 3;
    const was = this.inside;
    this.inside = insideClub(p.x, p.z);
    if (this.inside && !was) this.enter();
    if (!this.inside && was) this.leave();
    if (this.inside && (!open || !paid) && !g.cut) {
      // last call (or somehow in without paying): Moose walks you out
      g.fadeOut(() => {
        const o = W(0, -CLUB.hd - 2.2);
        p.x = o.x; p.z = o.z; p.heading = Math.PI;
      }, 1.2, open ? 'NICE TRY' : 'LAST CALL', open ? 'Moose carries you out under one arm. "Ten bucks, sweetheart. Everybody pays."' : 'The lights come up. Everybody looks worse. Moose walks you to the curb.');
    }
    // dancers re-take their marks after any... incident
    for (const n of this.all) {
      if (n.data.stand || n.state === 'ko' || n.air || n.hostile || !n.data.spot) continue;
      const [lx, lz, ry, o] = n.data.spot;
      this.pose(n, lx, lz, ry, o);
    }
    // the room talks
    if (this.inside && open) {
      this.barkT -= dt;
      if (this.barkT <= 0) {
        this.barkT = rand(5, 10);
        if (chance(0.5)) { const n = pick(this.patrons); n.say(pick(CROWD_BARKS), 3); n.char.play('cheer', 1.2); } else { const n = pick(this.dancers); n.say(pick(DANCER_BARKS[n.data.dancer.key]), 3); }
      }
      if (Math.random() < dt * 0.6) for (const n of this.patrons) if (chance(0.3)) n.char.play('cheer', 1);
    }
  }

  enter() {
    this.prevStation = audio.station;
    audio.setStation(2); // Smooth Sax After Dark. Obviously.
    const g = this.g;
    if (!g.state.flags.ggVisited) {
      g.state.flags.ggVisited = true;
      g.ui.splash('THE GOLDEN GARTER', 'Est. 1958. The carpet has seen things.', 3, '#ff6fb5');
      g.ui.hint('Talk to the dancers to tip them • DJ Arthur runs Amateur Night (9PM–1AM) • Lorraine pours at the bar', 7);
    }
  }

  leave() {
    if (this.prevStation !== undefined) audio.setStation(this.prevStation);
    this.prevStation = undefined;
  }

  clear() {
    const g = this.g;
    for (const n of this.all) if (g.npcs.includes(n)) g.removeNPC(n);
    this.leave();
  }
}

// ---------------------------------------------------------------- dialogue
function tip(g, n, amt) {
  const s = g.state, d = n.data.dancer;
  g.spend(amt);
  s.club.tips += amt;
  s.counters.clubTips = (s.counters.clubTips || 0) + amt;
  if (s.club.tips >= 100) g.achievement('regular');
  audio.play('cash');
  g.particles.burst('cash', n.x, n.y + 1.4, n.z, Math.min(30, 2 + amt), { speed: 2.4, up: 2.5, life: 1.4, size: 0.28, gravity: 5 });
  n.char.play('cheer', 1.2);
  if (amt >= 50) {
    g.achievement('makeitrain');
    g.xp('stat', 2);
    g.celebrate?.(3, CLUB.x, CLUB.z);
    for (const pn of g.club.patrons) pn.char.play('cheer', 1.5);
  } else g.xp('stat', amt >= 5 ? 0.4 : 0.1);
  const lines = {
    dolores: amt >= 50 ? '"FIFTY SINGLES? Sugar, I haven\'t seen this much paper since my divorce settlement!" *She does a slow spin that ends, carefully, in a seated position.*' : pick(['"Thank you, sugar. That\'s my Metamucil money for the week."', '*She tucks it into her garter, next to a Werther\'s and a backup hearing aid.*', '"Ooh, a big spender. Don\'t tell Moose, he gets jealous."']),
    bunny: amt >= 50 ? '"MAKE IT RAIN!" *Bunny high-kicks through the falling bills like it\'s Radio City, 1962. Her hip pops audibly. She does not stop.*' : pick(['"Bless you, Herbert. ...You\'re not Herbert? Bless you anyway."', '*She catches it in her cardigan pocket without looking. Sixty years of practice.*', '"That\'s going straight to my grandson\'s college fund. He\'s 47."']),
    rex: amt >= 50 ? '"¡DIOS MÍO!" *Rex rips off his tearaway slacks to reveal... a second, identical pair of slacks. The crowd loses its mind.*' : pick(['*Rex winks so hard his toupee shifts.*', '"Gracias, amigo. The Stallion remembers his friends."', '*He tucks it into his sock. Black dress sock. Pulled up to the knee.*']),
  };
  return { name: n.name, title: `${d.age} years young`, text: lines[d.key], choices: tipChoices(g, n) };
}

function tipChoices(g, n) {
  const m = g.state.money;
  return [
    { text: 'Tip a single', tag: money(1), disabled: m < 1, action: () => tip(g, n, 1) },
    { text: 'Tip a fiver', tag: money(5), disabled: m < 5, action: () => tip(g, n, 5) },
    { text: '💸 MAKE IT RAIN', tag: money(50), disabled: m < 50, action: () => tip(g, n, 50) },
    { text: 'Walk away', action: () => null },
  ];
}

export function talkDancer(g, n) {
  const d = n.data.dancer;
  if (!clubOpen(g)) return end(n.name, '"We\'re closed, sugar. Even legends need their beauty sleep. Come back at four."');
  return { name: n.name, title: `${d.age} years young • Golden Garter headliner`, text: d.bio, choices: tipChoices(g, n) };
}

export function talkBouncer(g) {
  const s = g.state.club;
  const name = 'Moose Malone';
  if (!clubOpen(g)) return end(name, '"We open at four. Early bird show\'s at four-thirty. Come back with singles and clean thoughts. Singles, mostly."', 'Bouncer, 91');
  if (s.paid === nightKey(g)) return end(name, pick(['"You\'re good, sweetheart. Hands where I can see \'em. My cataracts are bad but my right hook ain\'t."', '"Rule one: no touching. Rule two: no touching. Rule three: tip Bunny, she\'s saving for a hip."', '"I been working this door since Eisenhower. You\'re fine. Go on in."']), 'Bouncer, 91');
  const letIn = (line) => { s.paid = nightKey(g); audio.play('click'); return end(name, line, 'Bouncer, 91'); };
  return {
    name, title: 'Bouncer, 91 • built like a refrigerator that served in Korea',
    text: '*He\'s six-foot-five, ninety-one years old, and has a neck you could land a plane on.*\n\n"Ten bucks cover. Senior discount? Pal, everybody here\'s a senior. It\'s ten bucks."',
    choices: [
      { text: 'Pay the cover', tag: money(10), disabled: g.state.money < 10, action: () => { g.spend(10); return letIn('*He stamps your hand with a little pink garter.* "Enjoy the show. Tip the girls. Tip Rex. Rex has a mortgage."'); } },
      { text: '"I\'m on the list."', check: { label: 'CHA', chance: g.chance('cha', 4) }, action: () => {
        if (g.roll('cha', 4)) return letIn('*He squints at a clipboard with nothing on it.* "...Yeah. Yeah, there you are. Go on."');
        return end(name, '"There ain\'t a list. There\'s never been a list. Ten bucks."', 'Bouncer, 91');
      } },
      { text: '"Do you know who I am?"', check: { label: 'INT', chance: g.chance('intim', 6) }, action: () => {
        if (g.roll('intim', 6)) return letIn('*He looks you up and down. Something in your eyes tells him you once owned a bowling alley.* "...My apologies, sir. Go right in."');
        return end(name, '"Nope. And I don\'t care. I didn\'t care in 1958 neither. Ten. Bucks."', 'Bouncer, 91');
      } },
      { text: 'Leave', action: () => null },
    ],
  };
}

export function talkClubBar(g) {
  const s = g.state;
  const drink = (name, cost, buzz, text, extra) => ({ text: name, tag: money(cost), disabled: s.money < cost, action: () => {
    g.spend(cost);
    s.buzz = Math.min(100, s.buzz + buzz);
    s.counters.beers++;
    audio.play('drink');
    if (extra) extra();
    return { name: 'Lorraine', title: 'Bartender since the Nixon administration', text, choices: barChoices() };
  } });
  const barChoices = () => [
    drink('A Blue Boy Martini', 12, 18, '*Gin, a splash of blue curaçao and, Lorraine swears, "nothing else." It glows faintly.* (+buzz)'),
    drink('Prune Daiquiri', 8, 12, '*It tastes like a fruit cup that\'s been through a divorce. You will be seeing the restroom shortly.* (+buzz, +bladder)', () => { s.bladder = Math.min(100, s.bladder + 30); }),
    drink('Ensure & Rum', 10, 14, '*Vanilla. Fortified. Twelve vitamins and one bad decision.* (+buzz, +health)', () => { g.player.hp = Math.min(g.maxHp(), g.player.hp + 25); }),
    { text: 'A bottle of the house champagne for the room', tag: money(60), disabled: s.money < 60, action: () => {
      g.spend(60);
      s.buzz = Math.min(100, s.buzz + 10);
      g.xp('stat', 2);
      g.xp('cha', 1);
      audio.play('canOpen');
      for (const n of g.club.all) if (n.role !== 'bouncer') n.char.play('cheer', 1.6);
      return { name: 'Lorraine', title: '"To the big spender!"', text: '*POP.* The whole room raises a glass to you. Dolores blows you a kiss. Rex blows you a kiss. Moose, from the door, blows you a kiss, and it\'s somehow the most sincere one. (+STATUS, +CHA)', choices: barChoices() };
    } },
    { text: '"Heard any good gossip?"', action: () => ({ name: 'Lorraine', title: 'She leans in', text: gossip(g), choices: barChoices() }) },
    { text: 'Leave', action: () => null },
  ];
  if (!clubOpen(g)) return end('Lorraine', '"Bar opens at four, hon. Even I\'m not drinking yet. ...Okay, I am. But YOU\'RE not."');
  return { name: 'Lorraine', title: 'Bartender since the Nixon administration', text: pick(['"What\'ll it be, hon? And don\'t say water. Water\'s for the dancers."', '"Two-drink minimum. Three if you\'re gonna sit near Bunny."', '"I\'ve poured for Sinatra, Dean Martin, and a guy who SAID he was Dean Martin. What\'s your poison?"']), choices: barChoices() };
}

function gossip(g) {
  const qid = g.quests.current()?.id || '';
  if (qid.startsWith('c5_')) return pick([
    '"That developer, Trip Vandermeer? In here every night throwing hundreds at Rex. Says he\'s about to be \'Boca rich.\' Says Karen is \'taken care of.\' Taken care of how, I\'d like to know."',
    '"Trip keeps his books in the sales trailer by the 3rd tee. Brags about the safe. Brags about the rent-a-cop too. Says the guy\'s asleep by ten. Every night. Like clockwork."',
  ]);
  return pick([
    '"Rex and Bunny used to be an item. Then Rex and Dolores. Then Rex and Bunny AGAIN. Rex gets around for a man with two fake knees."',
    '"Moose was a boxer. Fought Rocky Marciano in \'54. Lost, but Rocky said it was the hardest he\'d ever been hit. By a bouncer."',
    '"Amateur Night\'s at nine. Last week a retired dentist won it doing the Sprinkler. Six minutes. Nobody could stop him."',
    '"Karen from the HOA came in once to \'shut us down.\' Stayed till close. Tipped Rex forty bucks. We don\'t talk about it."',
  ]);
}

export function talkDJ(g) {
  const s = g.state.club;
  const done = s.amateur === nightKey(g);
  const hours = amateurHours(g);
  if (!clubOpen(g)) return end('DJ Arthur Itis', '"Club\'s closed, daddy-o. The turntables need their rest. So do I. Mostly I do."');
  return {
    name: 'DJ Arthur Itis', title: 'Spinning since vinyl was new the first time',
    text: done ? '"You already had your shot tonight, champ. The pole needs to cool down. So does the crowd. So does your hip."' : hours ? '"AMATEUR NIIIIGHT! You got moves, daddy-o? Sprinkler, Cardigan Twirl, Drop It — slowly — and the Hip Thrust, carefully. Crowd decides the winner. Two hundred bucks and your name on the Wall of Fame."' : '"Amateur Night starts at nine, daddy-o. Nine till one. Stretch first. Stretch a LOT."',
    choices: [
      ...(!done && hours ? [{ text: '💃 Sign up for Amateur Night', tag: '$200 prize', action: () => { g.startMinigame('amateur'); g.ui.closeDialogue(); return 'keep'; } }] : []),
      { text: '"Play something with a beat."', action: () => end('DJ Arthur Itis', pick(['*He plays "Pour Some Sugar on Me" at 64 BPM. Dolores nods approvingly. Bunny does a kick that registers on a seismograph.*', '*He puts on Tom Jones. Three women in the back row throw their reading glasses at the stage.*', '*He plays the Macarena. Rex comes out of retirement mid-song, which is impressive because he was already performing.*'])) },
      { text: 'Leave', action: () => null },
    ],
  };
}

export function talkClubber(g, n) {
  return end(n.name, pick([
    '"I\'ve been coming here since 1971. The dancers are the same. So am I. We\'ve all just... softened."',
    '"Dolores did a split in 1979 and I\'ve been coming back every night to see if she\'ll do it again."',
    '"Don\'t tell my daughter. She thinks I\'m at water aerobics. Technically there\'s water. In the drinks."',
    '"Rex did the hip thing at me and I think my pacemaker skipped. Best night of my life."',
    '"The trick is singles. Bunny can smell a five from across the room and she gets EXCITED."',
  ]), 'Regular');
}

export function vipNode(g) {
  if (!clubOpen(g)) return end('Champagne Room', '*The velvet rope is up and the room is dark. A sign says: "CLOSED. NO, REX, NOT EVEN FOR YOU."*');
  const price = 100;
  return {
    name: 'The Champagne Room', title: `Private dance • ${money(price)} • "No touching. We mean it. We have osteoporosis."`,
    text: '*A heart-shaped loveseat (heart-shaped in spirit), a bucket of something sparkling, and a lamp with a pink scarf over it that is definitely a fire hazard.*\n\nWho\'s it going to be?',
    choices: [
      ...g.club.dancers.map((n) => ({ text: `A private dance with ${n.data.dancer.short}`, tag: money(price), disabled: g.state.money < price, action: () => {
        g.spend(price);
        const d = n.data.dancer;
        g.fadeOut(() => {
          g.advanceTime(20);
          g.state.buzz = Math.min(100, g.state.buzz + 8);
          g.xp('cha', 1.5);
          g.xp('stat', 1);
          g.state.counters.vipDances = (g.state.counters.vipDances || 0) + 1;
          g.achievement('champagne');
          audio.play('bedsprings', { vol: 0.25 });
        }, 2.6, 'THE CHAMPAGNE ROOM', d.vip, '#ff6fb5');
        return null;
      } })),
      { text: 'Maybe later', action: () => null },
    ],
  };
}

// ---------------------------------------------------------------- AMATEUR NIGHT (mini-game)
const MOVES = [
  { glyph: '◀', name: 'THE SPRINKLER', act: 'sprinkler', codes: ['ArrowLeft', 'KeyA', 'PadLeft'] },
  { glyph: '▲', name: 'CARDIGAN TWIRL', act: 'twirl', codes: ['ArrowUp', 'KeyW', 'PadUp'] },
  { glyph: '▼', name: 'DROP IT (SLOWLY)', act: 'dropit', codes: ['ArrowDown', 'KeyS', 'PadDown'] },
  { glyph: '▶', name: 'HIP THRUST', act: 'thrust', codes: ['ArrowRight', 'KeyD', 'PadRight'] },
];
const BPM = 100, BEAT = 60 / BPM, LEAD = 2.0, HIT = 10; // HIT: the ring's left %, LEAD: seconds a move is on screen
const AN_BARKS = ['GO GRANDPA GO!', 'TAKE IT OFF! ...THE CARDIGAN!', 'My hip hurts just WATCHING!', 'Somebody check his pulse!', 'THAT\'S MY HUSBAND! ...I\'m leaving him for that hip thrust.', 'He\'s better than Rex!', 'NOBODY tell Rex!', 'I need a cigarette and I quit in 1974!'];

export class AmateurNight {
  constructor(g) {
    this.g = g;
    this.fullSpeed = true;
    const club = g.club;
    this.club = club;
    this.y0 = club.b.y0;
    this.t = -BEAT * 4; // count-in: five, six, seven, eight
    this.hype = 30;
    this.tips = 0;
    this.streak = 0;
    this.nextBeat = -4;
    this.phase = 'dance';
    this.msg = 'DJ Arthur: "Put your hands together for... the new guy! Five! Six! Seven! Eight!"';
    g.state.club.amateur = nightKey(g);
    // the song: every other beat to start, then every beat, then a big finish
    this.notes = [];
    let last = -1, rep = 0;
    for (let b = 0; b < 44; b++) {
      const on = b < 16 ? b % 2 === 0 : b < 36 ? (b % 8 !== 7) : true;
      if (!on) continue;
      let m = Math.floor(Math.random() * 4);
      if (m === last && ++rep >= 2) m = (m + 1 + Math.floor(Math.random() * 3)) % 4;
      else if (m !== last) rep = 0;
      last = m;
      this.notes.push({ t: b * BEAT, m, state: 0, el: null });
    }
    this.endT = 46 * BEAT;
    // Dolores steps aside to cheer you on from the main stage
    this.dolores = club.dancers[0];
    club.pose(this.dolores, 0, 6.2, Math.PI, { y: this.y0 + TOP, act: 'cheer', actDur: 1.2 });
    const p = g.player;
    this.prevHeld = p.char.heldType;
    p.char.setHeld(null);
    p.char.action = null;
    this.spin = 0;
    box().onclick = null;
    box().innerHTML = `
      <div class="sb-head"><span class="mg-title">💃 AMATEUR NIGHT</span><span class="gf-info">Tips <b id="an-tips">$0</b></span><span class="pb-score" id="an-hype">HYPE 30%</span></div>
      <div class="an-track" id="an-track"><i class="an-hit"></i></div>
      <div class="an-meter"><b id="an-meter"></b></div>
      <div class="mg-msg" id="an-msg"></div>
      <div class="sb-btns">${MOVES.map((m, i) => `<button class="btn" data-k="${i}">${m.glyph}</button>`).join('')}</div>
      <div class="mg-hint">Arrow keys / WASD as each move hits the ring • ESC to chicken out • the crowd decides</div>`;
    document.getElementById('minigame').classList.add('mg-3d');
    for (const b of box().querySelectorAll('[data-k]')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.press(+b.dataset.k); });
    const track = document.getElementById('an-track');
    for (const n of this.notes) {
      const el = document.createElement('div');
      el.className = 'an-note';
      el.innerHTML = `<b>${MOVES[n.m].glyph}</b><small>${MOVES[n.m].name}</small>`;
      el.style.display = 'none';
      track.appendChild(el);
      n.el = el;
    }
    this.render();
  }

  update(dt, input) {
    const g = this.g;
    this.cam(dt);
    this.poseLee(dt);
    if (this.phase === 'done') {
      this.doneT -= dt;
      if (this.doneT <= 0) this.cleanup();
      return;
    }
    if (input.rawHit('Escape') || input.rawHit('PadB')) return this.finish(true);
    this.t += dt;
    // the band: kick on the beat, a hat on the "and", a walking bass, a sax stab every bar
    while (this.nextBeat * BEAT <= this.t) {
      const b = this.nextBeat++;
      if (b < 0) {
        audio.tone({ freq: 880, type: 'square', dur: 0.06, vol: 0.06 });
        g.club.dj.say(['FIVE!', 'SIX!', 'SEVEN!', 'EIGHT!'][b + 4], 0.5);
        continue;
      }
      const root = [0, 0, 5, 7][Math.floor(b / 4) % 4];
      audio.tone({ freq: 110, to: 42, type: 'sine', dur: 0.2, vol: 0.45 });
      audio.tone({ freq: 55 * 2 ** ((root + [0, 7, 12, 7][b % 4]) / 12), type: 'sawtooth', dur: BEAT * 0.8, vol: 0.07 });
      audio.tone({ freq: 6000, type: 'square', dur: 0.02, vol: 0.02, at: BEAT / 2 });
      if (b % 4 === 0) for (const k of [12, 16, 19]) audio.tone({ freq: 220 * 2 ** ((root + k) / 12), type: 'triangle', dur: BEAT * 1.4, vol: 0.035, attack: 0.04 });
    }
    for (let i = 0; i < MOVES.length; i++) if (MOVES[i].codes.some((c) => input.rawHit(c))) this.press(i);
    // anything that slid past the ring is a miss
    for (const n of this.notes) if (n.state === 0 && this.t - n.t > 0.22) this.judge(n, 'miss');
    if (this.t >= this.endT) return this.finish(false);
    this.renderTrack();
  }

  press(m) {
    if (this.phase !== 'dance') return;
    let best = null, bd = 0.3;
    for (const n of this.notes) {
      if (n.state !== 0) continue;
      const d = Math.abs(n.t - this.t);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) return; // pressing in the gaps is just enthusiasm
    if (best.m !== m) return this.judge(best, 'miss');
    this.judge(best, bd < 0.09 ? 'perfect' : bd < 0.2 ? 'good' : 'miss');
  }

  judge(n, how) {
    const g = this.g, p = g.player;
    n.state = how === 'miss' ? 2 : 1;
    if (n.el) n.el.classList.add(how === 'miss' ? 'miss' : 'hit');
    const pole = W(POLE.x, POLE.z);
    if (how === 'miss') {
      this.streak = 0;
      this.hype = Math.max(0, this.hype - 9);
      p.char.play('flinch', 0.5);
      audio.play('oof', { vol: 0.6 });
      g.ui.float(pole.x - 0.3, this.y0 + TOP + 2.4, pole.z, pick(['*CRACK*', '*POP*', 'OW, MY HIP', 'WRONG WAY!']), '#e84a5f', 1);
      this.msg = pick(['*Something in your lower back makes a noise like a dropped tray.*', 'Bunny winces in solidarity.', 'A man in the front row looks away out of respect.']);
    } else {
      this.streak++;
      const perfect = how === 'perfect';
      this.hype = Math.min(100, this.hype + (perfect ? 7 : 3.5) + Math.min(4, this.streak * 0.4));
      const cash = perfect ? 4 + Math.floor(Math.random() * 5) : 1 + Math.floor(Math.random() * 3);
      this.tips += cash;
      const mv = MOVES[n.m];
      p.char.play(mv.act, mv.act === 'dropit' ? 0.9 : 0.55);
      if (mv.act === 'twirl') this.spin = Math.PI * 2;
      g.particles.burst('cash', pole.x, this.y0 + TOP + 1.8, pole.z - 1.2, perfect ? 6 : 3, { speed: 2.2, up: 2.6, life: 1.2, size: 0.26, gravity: 6 });
      g.ui.float(pole.x - 0.3, this.y0 + TOP + 2.4, pole.z, perfect ? `${mv.name}! +$${cash}` : `+$${cash}`, perfect ? '#ffd23f' : '#ffffff', 0.9);
      if (perfect) audio.tone({ freq: 1320, type: 'square', dur: 0.05, vol: 0.05 });
      for (const pn of g.club.patrons) if (Math.random() < (perfect ? 0.6 : 0.3)) pn.char.play('cheer', 0.9);
      if (this.streak % 6 === 0) { const pn = pick(g.club.patrons); pn.say(pick(AN_BARKS), 1.6); }
      this.msg = this.streak >= 8 ? `🔥 ${this.streak} IN A ROW! The crowd is on its feet (the ones who can stand).` : perfect ? `PERFECT ${mv.name}!` : `${mv.name}. Not bad.`;
    }
    this.render();
  }

  poseLee(dt) {
    const p = this.g.player;
    const pole = W(POLE.x - 0.34, POLE.z);
    const r = p.char.root;
    if (this.spin > 0) this.spin = Math.max(0, this.spin - dt * 12);
    r.position.set(pole.x, this.y0 + TOP, pole.z);
    r.rotation.set(0, Math.PI + this.spin, 0);
    p.char.mode = 'idle';
    p.char.speed = 0;
    if (!p.char.action && this.phase === 'dance' && this.t > 0) p.char.play('pole', 2.4);
    if (this.phase === 'done' && this.won && !p.char.action) p.char.play('cheer', 1);
  }

  cam(dt) {
    const rig = this.g.camRig;
    const V = THREE.Vector3;
    const a = W(1.7, -3.4), l = W(POLE.x, POLE.z);
    const pos = new V(a.x, this.y0 + 1.8, a.z), look = new V(l.x, this.y0 + TOP + 1.1, l.z);
    if (!rig.cinematic) rig.cinematic = { pos: pos.clone(), look: look.clone() };
    rig.cinematic.pos.lerp(pos, 1 - Math.exp(-4 * dt));
    rig.cinematic.look.lerp(look, 1 - Math.exp(-4 * dt));
  }

  renderTrack() {
    for (const n of this.notes) {
      if (!n.el) continue;
      const u = (n.t - this.t) / LEAD;
      if (u > 1.05 || u < -0.15) { n.el.style.display = 'none'; continue; }
      n.el.style.display = '';
      n.el.style.left = `${HIT + u * (100 - HIT)}%`;
    }
  }

  render() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('an-tips', money(this.tips));
    set('an-hype', `HYPE ${Math.round(this.hype)}%`);
    set('an-msg', this.msg);
    const m = document.getElementById('an-meter');
    if (m) m.style.width = `${this.hype}%`;
    this.renderTrack();
  }

  finish(quit) {
    if (this.phase === 'done') return;
    const g = this.g, s = g.state;
    this.phase = 'done';
    this.doneT = 3.6;
    this.won = !quit && this.hype >= 70;
    g.addMoney(this.tips, 'Amateur Night tips');
    s.counters.amateurNights = (s.counters.amateurNights || 0) + 1;
    if (this.won) {
      s.club.wins++;
      s.counters.amateurWins = (s.counters.amateurWins || 0) + 1;
      g.addMoney(200, 'Amateur Night prize');
      g.achievement('amateur');
      g.xp('stat', 4);
      g.xp('cha', 2);
      audio.play('levelup');
      g.celebrate?.(5, CLUB.x, CLUB.z);
      for (const n of g.club.all) n.char.play('cheer', 2);
      g.club.dancers[2].say('The student has become the STALLION.', 3);
      this.msg = `🏆 AMATEUR NIGHT CHAMPION! $200 prize + ${money(this.tips)} in tips. Your name goes on the Wall of Fame, under "Sprinkler Steve, 1987."`;
    } else {
      audio.play(quit ? 'sadTrombone' : 'success');
      this.msg = quit ? `You hobble off mid-song. Moose helps you down the steps. You keep the ${money(this.tips)} in tips. The crowd claps, mostly from pity.` : `The crowd's verdict: ${Math.round(this.hype)}% hype. Respectable! Not a winner (you need 70%), but you made ${money(this.tips)} in tips and Bunny gave you a thumbs-up.`;
    }
    this.render();
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    const g = this.g, p = g.player;
    const [lx, lz, ry, o] = this.dolores.data.spot && this.dolores.data.dancer ? [...this.dolores.data.dancer.spot, { y: this.y0 + TOP, act: 'pole', actDur: 4 }] : [];
    if (lx !== undefined) g.club.pose(this.dolores, lx, lz, ry, o);
    const out = W(POLE.x, POLE.z - 3.2);
    p.x = out.x; p.z = out.z; p.y = heightAt(p.x, p.z); p.heading = 0;
    p.char.root.position.set(p.x, p.y, p.z);
    p.char.root.rotation.set(0, 0, 0);
    p.char.action = null;
    p.char.setHeld(this.prevHeld && this.prevHeld !== 'fists' ? this.prevHeld : (g.state.weapon === 'fists' ? null : g.state.weapon));
    g.camRig.cinematic = null;
    document.getElementById('minigame').classList.remove('mg-3d');
    g.endMinigame();
  }
}
