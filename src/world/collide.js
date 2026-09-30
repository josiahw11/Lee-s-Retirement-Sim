// 2D (XZ-plane) static collision: axis-aligned boxes and circles in a spatial hash.

export class Colliders {
  constructor(cell = 16) {
    this.cell = cell;
    this.grid = new Map();
    this.all = [];
    this._stamp = 0;
  }

  _key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  _insert(o, x0, z0, x1, z1) {
    const c = this.cell;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const k = this._key(ix, iz);
        let l = this.grid.get(k);
        if (!l) this.grid.set(k, (l = []));
        l.push(o);
      }
    }
    this.all.push(o);
    return o;
  }

  addBox(x0, z0, x1, z1, h = 4, tag = null) {
    return this._insert({ t: 'b', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, tag }, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1));
  }

  addBoxC(cx, cz, sx, sz, h = 4, tag = null) {
    return this.addBox(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, h, tag);
  }

  addCircle(x, z, r, h = 4, tag = null) {
    return this._insert({ t: 'c', x, z, r, h, tag }, x - r, z - r, x + r, z + r);
  }

  query(x, z, r) {
    const c = this.cell;
    const out = [];
    const stamp = ++this._stamp;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) {
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const l = this.grid.get(this._key(ix, iz));
        if (!l) continue;
        for (const o of l) {
          if (o._s === stamp) continue;
          o._s = stamp;
          out.push(o);
        }
      }
    }
    return out;
  }

  // Push a circle (p.x, p.z, radius r) out of all colliders. y lets things fly over low stuff.
  // Returns the strongest contact normal or null.
  resolve(p, r, y = 0) {
    let hit = null;
    for (let iter = 0; iter < 2; iter++) {
      const cands = this.query(p.x, p.z, r + 1);
      for (const o of cands) {
        if (o.tag === 'roof' || y > o.h - 0.2) continue;
        let nx = 0, nz = 0, depth = 0;
        if (o.t === 'b') {
          const cx = Math.max(o.x0, Math.min(p.x, o.x1));
          const cz = Math.max(o.z0, Math.min(p.z, o.z1));
          let dx = p.x - cx, dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 > r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            nx = dx / d; nz = dz / d; depth = r - d;
          } else {
            // center inside box: push along least penetration axis
            const l = p.x - o.x0, rr = o.x1 - p.x, t = p.z - o.z0, b = o.z1 - p.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) { nx = -1; depth = l + r; }
            else if (m === rr) { nx = 1; depth = rr + r; }
            else if (m === t) { nz = -1; depth = t + r; }
            else { nz = 1; depth = b + r; }
          }
        } else {
          const dx = p.x - o.x, dz = p.z - o.z;
          const d = Math.hypot(dx, dz);
          const rr = r + o.r;
          if (d >= rr) continue;
          if (d < 1e-6) { nx = 1; nz = 0; } else { nx = dx / d; nz = dz / d; }
          depth = rr - d;
        }
        p.x += nx * depth;
        p.z += nz * depth;
        if (!hit || depth > hit.depth) hit = { nx, nz, depth, o };
      }
    }
    return hit;
  }

  // Simple line-of-sight test against tall boxes (used by witnesses & security).
  blocked(ax, az, bx, bz) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const o of this.query(x, z, 0.1)) {
        if (o.t === 'b' && o.h > 2.5 && o.tag !== 'roof' && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) return true;
      }
    }
    return false;
  }
}
