// Procedurally painted canvas textures - no image files needed.
import * as THREE from 'three';
import { mulberry32 } from '../core/utils.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// Grayscale-ish detail noise multiplied over the ground to break up flat colors.
export function makeDetailTexture() {
  const S = 512;
  const c = canvas(S);
  const g = c.getContext('2d');
  const rnd = mulberry32(7);
  g.fillStyle = '#cfcfcf';
  g.fillRect(0, 0, S, S);
  // soft clumps
  for (let i = 0; i < 90; i++) {
    const v = 150 + Math.floor(rnd() * 100);
    g.fillStyle = `rgba(${v},${v},${v},0.22)`;
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, 12 + rnd() * 40, 0, Math.PI * 2);
    g.fill();
  }
  // grass blades
  g.lineCap = 'round';
  for (let i = 0; i < 26000; i++) {
    const v = 110 + Math.floor(rnd() * 145);
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    g.lineWidth = 0.8 + rnd() * 1.2;
    const x = rnd() * S, y = rnd() * S, h = 3 + rnd() * 6, lean = (rnd() - 0.5) * 4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + lean, y - h);
    g.stroke();
  }
  return toTex(c, true, false);
}

export function makeAsphaltTexture() {
  const c = canvas(256);
  const g = c.getContext('2d');
  const rnd = mulberry32(11);
  g.fillStyle = '#56585c';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 14000; i++) {
    const v = 60 + Math.floor(rnd() * 70);
    g.fillStyle = `rgba(${v},${v},${v + 4},0.6)`;
    g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
  }
  // a few tar-sealed cracks
  g.strokeStyle = 'rgba(30,30,32,0.5)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = rnd() * 256, y = rnd() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rnd() - 0.5) * 40;
      y += (rnd() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTex(c);
}

export const SHIRT_PALETTES = [
  { bg: '#1fa39a', flower: '#ff8fb1', leaf: '#0d6b5e', center: '#ffe066' }, // teal / pink
  { bg: '#c9303a', flower: '#ffffff', leaf: '#7a1820', center: '#ffd23f' }, // red hibiscus
  { bg: '#23408e', flower: '#8fd3ff', leaf: '#15285a', center: '#ffffff' }, // navy
  { bg: '#f2c14e', flower: '#f06a2c', leaf: '#3c8d4a', center: '#ffffff' }, // yellow
  { bg: '#f7a1c4', flower: '#ffffff', leaf: '#3aa66b', center: '#f25f5c' }, // pink
  { bg: '#6a4c93', flower: '#f4d35e', leaf: '#3f2b5b', center: '#ee964b' }, // purple
  { bg: '#f4f1de', flower: '#e07a5f', leaf: '#81b29a', center: '#3d405b' }, // cream
  { bg: '#3a86ff', flower: '#ffbe0b', leaf: '#1d4fa0', center: '#fb5607' }, // electric blue
];

const shirtCache = new Map();
export function makeShirtTexture(idx) {
  if (shirtCache.has(idx)) return shirtCache.get(idx);
  const p = SHIRT_PALETTES[idx % SHIRT_PALETTES.length];
  const c = canvas(128);
  const g = c.getContext('2d');
  const rnd = mulberry32(100 + idx);
  g.fillStyle = p.bg;
  g.fillRect(0, 0, 128, 128);
  const drawAt = (fn, x, y) => {
    // draw wrapped so the texture tiles seamlessly
    for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) fn(x + ox, y + oy);
  };
  for (let i = 0; i < 7; i++) {
    const x = rnd() * 128, y = rnd() * 128, a = rnd() * Math.PI;
    drawAt((X, Y) => {
      g.save();
      g.translate(X, Y);
      g.rotate(a);
      g.fillStyle = p.leaf;
      g.beginPath();
      g.ellipse(0, 0, 22, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }, x, y);
  }
  for (let i = 0; i < 6; i++) {
    const x = rnd() * 128, y = rnd() * 128, r = 8 + rnd() * 6;
    drawAt((X, Y) => {
      g.fillStyle = p.flower;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(X + Math.cos(a) * r * 0.6, Y + Math.sin(a) * r * 0.6, r * 0.55, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = p.center;
      g.beginPath();
      g.arc(X, Y, r * 0.3, 0, Math.PI * 2);
      g.fill();
    }, x, y);
  }
  const t = toTex(c);
  t.repeat.set(2, 2);
  shirtCache.set(idx, t);
  return t;
}

// Text signs - big readable lettering on a colored board.
export function makeSignTexture(text, { w = 512, h = 128, bg = '#1d2b53', fg = '#ffffff', font = 'bold 64px "Trebuchet MS", sans-serif', sub = null, subFont = 'bold 28px "Trebuchet MS", sans-serif', border = null, glow = null } = {}) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  } else g.clearRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 10;
    g.strokeRect(6, 6, w - 12, h - 12);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = 18;
  }
  g.fillStyle = fg;
  g.font = font;
  g.fillText(text, w / 2, sub ? h * 0.4 : h / 2, w - 30);
  if (sub) {
    g.font = subFont;
    g.fillText(sub, w / 2, h * 0.78, w - 30);
  }
  const t = toTex(c, false);
  return t;
}

// Particle atlas: 8x2 grid of 64px cells.
export const ATLAS = { heart: 0, star: 1, cash: 2, dust: 3, drop: 4, spark: 5, pill: 6, zzz: 7, smoke: 8, sand: 9, foam: 10, music: 11, anger: 12, leaf: 13, confetti: 14, pee: 15 };
export function makeParticleAtlas() {
  const cell = 64;
  const c = canvas(cell * 8, cell * 2);
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const center = (i) => [(i % 8) * cell + cell / 2, Math.floor(i / 8) * cell + cell / 2];
  const emoji = (i, ch, size = 46) => {
    const [x, y] = center(i);
    g.font = `${size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    g.fillText(ch, x, y + 3);
  };
  const blob = (i, col, soft = true) => {
    const [x, y] = center(i);
    const gr = g.createRadialGradient(x, y, 0, x, y, 30);
    gr.addColorStop(0, col);
    gr.addColorStop(soft ? 1 : 0.7, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - 32, y - 32, 64, 64);
  };
  emoji(0, '❤️');
  emoji(1, '⭐');
  emoji(2, '💵');
  blob(3, 'rgba(222,205,170,0.5)');
  // water drop
  {
    const [x, y] = center(4);
    g.fillStyle = 'rgba(190,230,255,0.95)';
    g.beginPath();
    g.arc(x, y + 6, 12, 0, Math.PI * 2);
    g.fill();
  }
  blob(5, 'rgba(255,240,180,1)');
  emoji(6, '💊');
  {
    const [x, y] = center(7);
    g.font = 'bold 40px sans-serif';
    g.fillStyle = '#fff';
    g.fillText('Z', x, y);
  }
  blob(8, 'rgba(120,120,120,0.8)');
  blob(9, 'rgba(230,205,140,1)', false);
  blob(10, 'rgba(255,255,245,1)');
  emoji(11, '🎵', 40);
  emoji(12, '💢', 42);
  {
    const [x, y] = center(13);
    g.fillStyle = '#3d9a3d';
    g.beginPath();
    g.ellipse(x, y, 20, 8, 0.6, 0, Math.PI * 2);
    g.fill();
  }
  {
    const [x, y] = center(14);
    g.fillStyle = '#fff';
    g.fillRect(x - 10, y - 6, 20, 12);
  }
  {
    const [x, y] = center(15);
    g.fillStyle = 'rgba(255,221,64,0.95)';
    g.beginPath();
    g.arc(x, y + 6, 12, 0, Math.PI * 2);
    g.fill();
  }
  const t = toTex(c, false);
  t.anisotropy = 1;
  return t;
}

export function makeCloudTexture() {
  const c = canvas(256, 128);
  const g = c.getContext('2d');
  const rnd = mulberry32(3);
  for (let i = 0; i < 26; i++) {
    const x = 40 + rnd() * 176, y = 50 + rnd() * 40, r = 18 + rnd() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTex(c, false);
}

export function makeRadialGlow(color = 'rgba(255,220,150,1)') {
  const c = canvas(64);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return toTex(c, false);
}
