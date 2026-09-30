// Terrain height function + the painted ground/minimap canvases.
import { HALF, HOLES, FAIRWAY_W, PONDS, BUNKERS, MOUNDS, RAMPS, BUILDINGS, EDGES, HOUSES, STREETS } from './layout.js';
import { clamp, smooth, mulberry32, distToSegment } from '../core/utils.js';

export const WATER_Y = -0.45;
export const POOL = { x0: 52, z0: -10, x1: 76, z1: 2, y: -0.15 };

// Senior-grade speed bumps across residential streets (cart goes *boing*).
export const SPEED_BUMPS = [];
for (const s of STREETS) {
  SPEED_BUMPS.push({ x: s.x, z: 124, axis: 'z' });
  SPEED_BUMPS.push({ x: s.x, z: 232, axis: 'z' });
}
SPEED_BUMPS.push({ x: -40, z: 20, axis: 'z' }, { x: 0, z: 60, axis: 'x' }, { x: 180, z: 60, axis: 'x' });

export function rampHeight(x, z) {
  let h = -Infinity;
  for (const r of RAMPS) {
    const dx = x - r.x, dz = z - r.z;
    const s = Math.sin(r.a), c = Math.cos(r.a);
    const u = dx * s + dz * c;
    const v = dx * c - dz * s;
    if (u >= 0 && u <= r.len && Math.abs(v) <= r.w / 2) h = Math.max(h, (r.h * u) / r.len);
  }
  return h;
}

// Ground height without ramps (used to displace the ground mesh).
export function baseHeight(x, z) {
  let h = 0;
  for (const m of MOUNDS) {
    const d2 = ((x - m.x) ** 2 + (z - m.z) ** 2) / (m.r * m.r);
    if (d2 < 9) h += m.h * Math.exp(-d2);
  }
  for (const p of PONDS) {
    const d = Math.hypot(x - p.x, z - p.z);
    const R = p.r * 1.25;
    if (d < R) h -= 2.4 * (1 - smooth(d / R));
  }
  for (const b of BUNKERS) {
    const e = ((x - b.x) / b.rx) ** 2 + ((z - b.z) / b.rz) ** 2;
    if (e < 1) h -= 0.45 * smooth(1 - e);
  }
  if (x > POOL.x0 && x < POOL.x1 && z > POOL.z0 && z < POOL.z1) {
    const edge = Math.min(x - POOL.x0, POOL.x1 - x, z - POOL.z0, POOL.z1 - z);
    h -= 1.6 * clamp(edge / 0.8, 0, 1);
  }
  for (const b of SPEED_BUMPS) {
    const along = b.axis === 'z' ? z - b.z : x - b.x;
    const across = b.axis === 'z' ? x - b.x : z - b.z;
    if (Math.abs(along) < 0.9 && Math.abs(across) < 4.5) h += 0.22 * Math.cos((along / 0.9) * Math.PI * 0.5);
  }
  return h;
}

export function heightAt(x, z) {
  return Math.max(baseHeight(x, z), rampHeight(x, z));
}

export function waterAt(x, z) {
  for (const p of PONDS) if (Math.hypot(x - p.x, z - p.z) < p.r * 0.9) return p;
  if (x > POOL.x0 && x < POOL.x1 && z > POOL.z0 && z < POOL.z1) return 'pool';
  return null;
}

// Water surface Y at a point (null if dry).
export function waterLevel(x, z) {
  const w = waterAt(x, z);
  if (!w) return null;
  return w === 'pool' ? POOL.y : WATER_Y;
}

export function onCourse(x, z) {
  return z < -52 && z > -288 && Math.abs(x) < 285;
}

export function onFairway(x, z) {
  for (const h of HOLES) {
    if (distToSegment(x, z, h.tee[0], h.tee[1], h.green[0], h.green[1]) < FAIRWAY_W / 2) return true;
  }
  return false;
}

// ---------------- painting ----------------
function toPx(v, size) {
  return ((v + HALF) / (HALF * 2)) * size;
}

function capsule(g, ax, az, bx, bz, w, size) {
  g.lineCap = 'round';
  g.lineWidth = (w / (HALF * 2)) * size;
  g.beginPath();
  g.moveTo(toPx(ax, size), toPx(az, size));
  g.lineTo(toPx(bx, size), toPx(bz, size));
  g.stroke();
}

function ellipse(g, x, z, rx, rz, size) {
  g.beginPath();
  g.ellipse(toPx(x, size), toPx(z, size), (rx / (HALF * 2)) * size, (rz / (HALF * 2)) * size, 0, 0, Math.PI * 2);
  g.fill();
}

function rect(g, cx, cz, sx, sz, size) {
  const s = size / (HALF * 2);
  g.fillRect(toPx(cx - sx / 2, size), toPx(cz - sz / 2, size), sx * s, sz * s);
}

// Paint the ground texture (mode 'ground') or the minimap (mode 'map').
export function paintGround(size, mode = 'ground') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rnd = mulberry32(42);
  const isMap = mode === 'map';
  const s = size / (HALF * 2);

  // base lawn
  g.fillStyle = isMap ? '#5f9e45' : '#6aa845';
  g.fillRect(0, 0, size, size);
  if (!isMap) {
    for (let i = 0; i < 2600; i++) {
      const v = rnd();
      g.fillStyle = v < 0.5 ? 'rgba(80,140,50,0.18)' : 'rgba(140,190,80,0.14)';
      const r = (2 + rnd() * 10) * s;
      g.beginPath();
      g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  // course rough
  g.fillStyle = isMap ? '#4e8f3a' : '#5a9a3c';
  rect(g, 0, -170, 570, 236, size);

  // house lawns (slightly different shades) - ground only
  if (!isMap) {
    for (const h of HOUSES) {
      g.fillStyle = `hsl(${95 + rnd() * 20}, ${40 + rnd() * 15}%, ${38 + rnd() * 8}%)`;
      rect(g, h.x, h.z, 30, 22, size);
    }
  }

  // fairways with mowing stripes
  for (const h of HOLES) {
    const [tx, tz] = h.tee, [gx, gz] = h.green;
    g.strokeStyle = isMap ? '#7ec85a' : '#79c254';
    capsule(g, tx, tz, gx, gz, FAIRWAY_W, size);
    if (!isMap) {
      const L = Math.hypot(gx - tx, gz - tz);
      const ux = (gx - tx) / L, uz = (gz - tz) / L;
      g.strokeStyle = 'rgba(160,230,120,0.28)';
      g.lineCap = 'butt';
      for (let d = 6; d < L - 6; d += 12) {
        const cx = tx + ux * d, cz = tz + uz * d;
        g.lineWidth = 6 * s;
        g.beginPath();
        g.moveTo(toPx(cx - uz * 13, size), toPx(cz + ux * 13, size));
        g.lineTo(toPx(cx + uz * 13, size), toPx(cz - ux * 13, size));
        g.stroke();
      }
    }
    // tee box
    g.fillStyle = '#8fd966';
    rect(g, tx, tz, 10, 10, size);
    // green + fringe
    g.fillStyle = isMap ? '#9be27a' : '#8ad463';
    ellipse(g, gx, gz, 15, 15, size);
    g.fillStyle = isMap ? '#b4f090' : '#9ee474';
    ellipse(g, gx, gz, 12.5, 12.5, size);
  }

  // bunkers
  g.fillStyle = isMap ? '#efe0b0' : '#e9d9a6';
  for (const b of BUNKERS) ellipse(g, b.x, b.z, b.rx + 0.8, b.rz + 0.8, size);

  // ponds: muddy shore then water color on map
  for (const p of PONDS) {
    g.fillStyle = isMap ? '#3d8fc4' : '#6c7a4a';
    ellipse(g, p.x, p.z, p.r * 1.08, p.r * 1.08, size);
    if (!isMap) {
      g.fillStyle = '#2c4a3a';
      ellipse(g, p.x, p.z, p.r * 0.85, p.r * 0.85, size);
    }
  }

  // maintenance lot dirt
  g.fillStyle = isMap ? '#a8916a' : '#b39c72';
  rect(g, -238, 5, 52, 84, size);

  // pool deck + pool
  const B = BUILDINGS;
  g.fillStyle = '#e6ddcc';
  rect(g, B.pooldeck.x, B.pooldeck.z, B.pooldeck.sx, B.pooldeck.sz, size);
  g.fillStyle = isMap ? '#58d0f5' : '#3fb8e0';
  rect(g, B.pool.x, B.pool.z, B.pool.sx, B.pool.sz, size);

  if (isMap) {
    // roads
    for (const e of EDGES) {
      g.strokeStyle = e.type === 'path' ? '#d8d2c2' : '#3c3f45';
      capsule(g, e.a.x, e.a.z, e.b.x, e.b.z, e.width + 2, size);
    }
    for (const e of EDGES) {
      if (e.type === 'path') continue;
      g.strokeStyle = '#6b7079';
      capsule(g, e.a.x, e.a.z, e.b.x, e.b.z, e.width - 1, size);
    }
    // lots
    g.fillStyle = '#6b7079';
    rect(g, B.parking.x, B.parking.z, B.parking.sx, B.parking.sz, size);
    rect(g, B.strip.x, B.strip.z, B.strip.sx, B.strip.sz, size);
    // houses
    for (const h of HOUSES) {
      g.fillStyle = h.owner === 'player' ? '#ffd23f' : '#d9c7b0';
      rect(g, h.x, h.z, 12, 14, size);
    }
    // buildings
    g.fillStyle = '#efe3c8';
    for (const k of ['clubhouse', 'proshop', 'liquor', 'buffet', 'hoa', 'sal', 'shed']) {
      const b = B[k];
      rect(g, b.x, b.z, b.sx, b.sz, size);
    }
    // wall
    g.strokeStyle = '#b8a68a';
    g.lineWidth = 3 * s;
    g.strokeRect(toPx(-292, size), toPx(-292, size), 584 * s, 584 * s);
  }
  return c;
}

export { toPx };
