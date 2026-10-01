// Hair that reads as hair. Each style is a shaped shell around the skull wearing a hand-painted strand
// texture: hundreds of individual strands with light/dark variation and a sheen band, painted in grey so
// one texture tints to any colour. The texture's alpha carves the hairline and breaks the ends into
// wisps (alphaTest), and a darker inner layer sits just underneath to give the hair depth.
//
// Styles: 'bob' (jaw-length set, bangs, ends turned under), 'perm' (the tight grandma curls),
// 'fringe' (horseshoe around the back and sides, thinning on top), 'full' (combed back, suspiciously dark).
import * as THREE from 'three';

// ---------------------------------------------------------------- seeded noise
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// smooth 1D value noise over a wrapping period (so locks of hair line up across the texture seam)
function wrapNoise(r, n) {
  const k = Array.from({ length: n }, r);
  return (u) => {
    const x = (((u % 1) + 1) % 1) * n, i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
    return k[i % n] * (1 - s) + k[(i + 1) % n] * s;
  };
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- strand textures (u wraps around the head with the
// back at u=0 and the face at u=0.5; v runs from the crown at the top of the canvas to the ends at the bottom)
const W = 512, H = 256;
const texCache = new Map();
function canvasTex(key, draw) {
  if (!texCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    draw(x, rng(key.length * 7919 + key.charCodeAt(0)));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return texCache.get(key);
}
const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

// long strands flowing down from the crown, with gentle waves, a sheen band and darker roots
function strands(x, r, { count, from = 0, to = H, wave = 2, wl = 0.05, sheen = 0.3, base = 225 }) {
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, grey(base - 45)); g.addColorStop(0.12, grey(base - 10)); g.addColorStop(1, grey(base - 25));
  x.fillStyle = g;
  x.fillRect(0, from, W, to - from);
  for (let i = 0; i < count; i++) {
    const x0 = r() * W, ph = r() * 6.28, v = 150 + r() * 105;
    x.strokeStyle = grey(v, 0.25 + r() * 0.45);
    x.lineWidth = 0.6 + r() * 1.4;
    x.beginPath();
    for (let y = from; y <= to; y += 4) {
      const px = x0 + Math.sin(y * wl + ph) * wave + (r() - 0.5) * 0.6;
      if (y === from) x.moveTo(px, y); else x.lineTo(px, y);
    }
    x.stroke();
  }
  // sheen: a soft bright band broken up into strands
  for (let i = 0; i < count * 0.6; i++) {
    const x0 = r() * W, y0 = H * sheen + (r() - 0.5) * H * 0.12, len = 6 + r() * 18;
    x.strokeStyle = grey(255, 0.12 + r() * 0.25);
    x.lineWidth = 1 + r();
    x.beginPath(); x.moveTo(x0, y0 - len / 2); x.lineTo(x0 + (r() - 0.5) * 2, y0 + len / 2); x.stroke();
  }
}
// cut alpha below `edge(u)` for every texture column (ragged per strand, smooth per lock)
function cutBelow(x, edge) {
  for (let px = 0; px < W; px++) {
    const y = Math.max(0, Math.min(H, edge(px / W, px)));
    if (y < H) x.clearRect(px, y, 1, H - y);
  }
}
function cutAbove(x, edge) {
  for (let px = 0; px < W; px++) {
    const y = Math.max(0, Math.min(H, edge(px / W, px)));
    if (y > 0) x.clearRect(px, 0, 1, y);
  }
}
const faceDist = (u) => Math.abs(u - 0.5); // 0 at the middle of the face

const TEX = {
  bob: () => canvasTex('bob', (x, r) => {
    strands(x, r, { count: 1500, wave: 1.6, wl: 0.045, sheen: 0.3 });
    const locks = wrapNoise(r, 22), fine = () => r();
    // the face: bangs end raggedly above the brows, the sides frame the cheeks
    cutBelow(x, (u) => {
      const d = faceDist(u);
      if (d > 0.15) return H + 1;
      const bangs = H * (0.42 + 0.05 * locks(u * 3) + 0.02 * fine());
      return bangs + H * 0.6 * Math.pow(d / 0.15, 6); // rounded corners down into the sides
    });
    // ends: locks of slightly different length, each breaking into wisps
    cutBelow(x, (u) => H * (0.86 + 0.09 * locks(u)) + fine() * H * 0.05);
  }),
  perm: () => canvasTex('perm', (x, r) => {
    x.fillStyle = grey(200);
    x.fillRect(0, 0, W, H);
    // hundreds of tight curls: dark ring, lighter rim, a highlight
    for (let i = 0; i < 2600; i++) {
      const cx = r() * W, cy = r() * H, rad = 2.5 + r() * 4.5, v = 160 + r() * 90;
      x.strokeStyle = grey(v * 0.62, 0.8);
      x.lineWidth = 1.4;
      x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = grey(Math.min(255, v + 20), 0.7);
      x.lineWidth = 1;
      x.beginPath(); x.arc(cx, cy, rad * 0.65, r() * 6, r() * 6 + 3.5); x.stroke();
    }
    const scal = (u, n, a) => Math.abs(Math.sin(u * Math.PI * n)) * a; // curly, scalloped edges
    cutBelow(x, (u) => {
      const d = faceDist(u);
      if (d > 0.16) return H + 1;
      return H * (0.4 - scal(u, 40, 0.03)) + H * 0.65 * Math.pow(d / 0.16, 5);
    });
    cutBelow(x, (u) => H * (0.9 - scal(u, 34, 0.05)));
  }),
  fringe: () => canvasTex('fringe', (x, r) => {
    // a short, dense crop: lots of little dashes
    x.fillStyle = grey(205);
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) {
      const px = r() * W, py = r() * H, len = 3 + r() * 7, v = 150 + r() * 105;
      x.strokeStyle = grey(v, 0.55);
      x.lineWidth = 0.8 + r() * 0.8;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py + len); x.stroke();
    }
    const n = wrapNoise(r, 30);
    // bald on top, thinning toward it: a ragged upper edge with stray wisps above it
    cutAbove(x, (u) => {
      const d = faceDist(u);
      // the band rides a little higher at the back of the skull; nothing across the forehead
      const top = H * (0.47 + 0.06 * n(u * 2) + 0.06 * sm(0.4, 0.15, d)) + (d < 0.13 ? H * 0.6 : 0);
      return top + (r() < 0.25 ? -r() * H * 0.08 : r() * H * 0.03);
    });
    // in front of the ears: sideburns, then the face
    cutBelow(x, (u) => {
      const d = faceDist(u);
      if (d > 0.21) return H * (0.93 + 0.04 * n(u)) + r() * 4; // nape and over the ears
      if (d > 0.13) return H * (0.8 + 0.25 * sm(0.13, 0.21, d)) + r() * 5; // temples down into sideburns
      return 0;
    });
  }),
  full: () => canvasTex('full', (x, r) => {
    strands(x, r, { count: 1700, wave: 0.8, wl: 0.03, sheen: 0.22, base: 215 });
    // a side part, combed away on both sides
    const part = 0.5 - 0.07;
    x.strokeStyle = grey(70, 0.9);
    x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(part * W, H * 0.3); x.lineTo(part * W + 4, 0); x.stroke();
    const n = wrapNoise(r, 26);
    cutBelow(x, (u) => {
      const d = faceDist(u);
      if (d > 0.21) return H * (0.93 + 0.04 * n(u)) + r() * 4;
      if (d > 0.17) return H * 0.84 + r() * 4; // sideburns
      // receding at the temples (the classic M), a little peak in the middle
      return H * (0.36 + 0.03 * n(u * 3) - 0.04 * Math.exp(-((d / 0.03) ** 2)) - 0.1 * sm(0.07, 0.15, d)) + r() * 3;
    });
  }),
};

// ---------------------------------------------------------------- shells
// unit-sphere shells (back at u=0, face at u=0.5), shaped per style
const geoCache = new Map();
function shell(key, lod, thetaLen, shape) {
  const k = `${key}:${lod}`;
  if (!geoCache.has(k)) {
    const g = new THREE.SphereGeometry(1, lod ? 18 : 56, lod ? 10 : 30, -Math.PI / 2, Math.PI * 2, 0, thetaLen);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = shape(p.getX(i), p.getY(i), p.getZ(i));
      p.setXYZ(i, v[0], v[1], v[2]);
    }
    g.computeVertexNormals();
    g.userData.shared = true;
    geoCache.set(k, g);
  }
  return geoCache.get(k);
}
const curl = (x, y, z) => Math.sin(x * 23 + y * 7) * Math.sin(y * 21 - z * 9) * Math.sin(z * 22 + x * 8);

const SHAPES = {
  // jaw-length bob: full crown, sides fall straight past the ears, ends turn under
  bob: (lod, vol) => shell(`bob:${vol}`, lod, 2.32, (x, y, z) => {
    const ring = Math.max(0.42, Math.sqrt(1 - y * y));
    let s = 1;
    if (y < 0.15) s = (1 / ring) * (1 - 0.05 * Math.max(0, -y)) * (0.95 + 0.05 * Math.min(1, ring / 0.98)); // straight sides
    s *= 1 - 0.07 * sm(-0.55, -0.72, y); // ends turn under
    const lift = 0.02 * sm(-0.55, -0.72, y);
    return [x * s * 0.19 * vol, (y > 0 ? y * 1.06 : y * 1.32) * 0.198 + lift, z * s * 0.183 * (z < 0 ? 1.04 : 1)];
  }),
  // short tight perm: a curly cap with lots of volume on top
  perm: (lod, vol) => shell(`perm:${vol}`, lod, 2.0, (x, y, z) => {
    // clumps of curls in the silhouette (two scales of bumps), lots of lift on top
    const clump = Math.sin(x * 11 + y * 4) * Math.sin(y * 10 - z * 5) * Math.sin(z * 11 + x * 3);
    const m = 1 + (lod ? 0 : 0.05 * clump + 0.025 * curl(x, y, z)) + 0.09 * sm(0.3, 0.95, y) * vol;
    return [x * 0.184 * m, y * 0.198 * m, z * 0.18 * m];
  }),
  // short crop hugging the skull (the alpha decides where the hair actually is)
  fringe: (lod) => shell('fringe', lod, 2.02, (x, y, z) => {
    // a bit of body: puffier over the ears and at the back, where the hair actually grows
    const m = 1.012 + (lod ? 0 : 0.014 * curl(x, y, z)) + 0.03 * sm(0.45, -0.1, y) * sm(0.35, 0.8, Math.abs(x) + Math.max(0, -z) * 0.6);
    return [x * 0.162 * m, y * 0.181 * m, z * 0.17 * m];
  }),
  full: (lod) => shell('full', lod, 2.02, (x, y, z) => {
    // combed up and back: lift on top, most of all just behind the hairline
    const m = 1.02 + 0.035 * sm(0.2, 0.9, y) + 0.05 * sm(0.45, 0.85, y) * sm(0.0, 0.6, z) + (lod ? 0 : 0.008 * curl(x, y, z));
    return [x * 0.163 * m, y * 0.183 * m, z * 0.171 * m];
  }),
};

// ---------------------------------------------------------------- materials (shared per style + colour)
const matCache = new Map();
function mats(style, color) {
  const k = `${style}:${color}`;
  if (!matCache.has(k)) {
    const map = TEX[style]();
    const c = new THREE.Color(color);
    const outer = new THREE.MeshStandardMaterial({ color: c, map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0 });
    const inner = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.55), map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
    matCache.set(k, { outer, inner });
  }
  return matCache.get(k);
}

export function hairStyle(o) {
  if (o.hairStyle) return o.hairStyle;
  if (o.female) return ['#b9c7f0', '#c9b3e6', '#f2f2f2', '#e2e2e2'].includes(o.hair) ? 'perm' : 'bob'; // blue rinse = perm, obviously
  return o.hair === '#1c1c1c' || o.hair === '#6b4a2a' ? 'full' : 'fringe';
}

// Hair group in head-bone space. `center` is the head centre relative to the head bone.
export function makeHair(o, lod, center) {
  const style = hairStyle(o);
  const vol = o.female && o.hat && o.hat !== 'none' ? 0.94 : 1; // hats flatten the set
  const offset = { bob: [0, 0.022, -0.014], perm: [0, 0.03, -0.01], fringe: [0, 0.012, -0.012], full: [0, 0.014, -0.012] }[style];
  const geo = SHAPES[style](lod, vol);
  const m = mats(style, o.hair);
  const grp = new THREE.Group();
  grp.position.set(center.x + offset[0], center.y + offset[1], center.z + offset[2]);
  const outer = new THREE.Mesh(geo, m.outer);
  outer.castShadow = true;
  grp.add(outer);
  if (!lod) {
    // the darker under-layer: depth behind the wisps and the hairline
    const inner = new THREE.Mesh(geo, m.inner);
    inner.scale.setScalar(style === 'fringe' || style === 'full' ? 0.985 : 0.965);
    grp.add(inner);
  }
  return grp;
}
