// Road-graph navigation for AI-driven carts: random cruising, A* routes, chases, loops.
import { NODES, EDGES } from '../world/layout.js';
import { clamp, wrapAngle, pick, dist2 } from '../core/utils.js';

const nodeList = Object.values(NODES);

export function nearestNode(x, z, filter = null) {
  let best = null, bd = Infinity;
  for (const n of nodeList) {
    if (filter && !filter(n)) continue;
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

export function astar(start, goal) {
  if (start === goal) return [start];
  const open = new Set([start]);
  const came = new Map();
  const g = new Map([[start, 0]]);
  const f = new Map([[start, dist2(start.x, start.z, goal.x, goal.z)]]);
  while (open.size) {
    let cur = null, cf = Infinity;
    for (const n of open) if (f.get(n) < cf) { cf = f.get(n); cur = n; }
    if (cur === goal) {
      const path = [cur];
      while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); }
      return path;
    }
    open.delete(cur);
    for (const { to } of cur.edges) {
      const ng = g.get(cur) + dist2(cur.x, cur.z, to.x, to.z);
      if (ng < (g.get(to) ?? Infinity)) {
        came.set(to, cur);
        g.set(to, ng);
        f.set(to, ng + dist2(to.x, to.z, goal.x, goal.z));
        open.add(to);
      }
    }
  }
  return [start, goal];
}

function edgeBetween(a, b) {
  return a.edges.find((e) => e.to === b)?.e;
}

// Concession cart loops around the course paths
export const COURSE_LOOPS = [
  ['F0', 'M0', 'B0', 'B7', 'M7', 'F7', 'F5', 'F3', 'F1'],
  ['M0', 'M7', 'B7', 'B0'],
  ['F3', 'F5', 'F7', 'M7', 'M0', 'F0', 'F1'],
];
export const PATROL_LOOP = ['P7', 'P5', 'P3', 'P1', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'P6', 'P7', 'F7', 'F5', 'F3', 'P3', 'P4', 'C4', 'S4', 'S3', 'S2', 'C2', 'P2'];

export class Driver {
  constructor(cart, mode = 'cruise', opts = {}) {
    this.cart = cart;
    this.mode = mode;
    this.speed = opts.speed || 6.5;
    this.loop = opts.loop ? opts.loop.map((id) => NODES[id]) : null;
    this.loopIdx = -1;
    this.path = [];
    this.prev = null;
    this.next = null;
    this.stuckT = 0;
    this.reverseT = 0;
    this.honkT = 0;
    this.blockedT = 0;
    this.repathT = 0;
    this.stopT = 0;
    const n = nearestNode(cart.x, cart.z);
    this.prev = n;
    this.next = n;
    this.pickNext();
  }

  pickNext() {
    const at = this.next;
    // a planned route always wins (chases, returning to a patrol loop)
    if (this.path.length) {
      this.prev = at;
      this.next = this.path.shift();
      return;
    }
    if (this.mode === 'loop' && this.loop) {
      let idx = this.loop[this.loopIdx] === at ? this.loopIdx : this.loop.indexOf(at);
      if (idx < 0) {
        // off the loop: drive back to the nearest loop node along the roads
        let bi = 0, bd = Infinity;
        this.loop.forEach((ln, i) => { const d = (ln.x - at.x) ** 2 + (ln.z - at.z) ** 2; if (d < bd) { bd = d; bi = i; } });
        this.path = astar(at, this.loop[bi]).slice(1);
        this.loopIdx = bi;
        this.prev = at;
        this.next = this.path.shift() || this.loop[bi];
        return;
      }
      this.loopIdx = (idx + 1) % this.loop.length;
      this.prev = at;
      this.next = this.loop[this.loopIdx];
      return;
    }
    const options = at.edges.filter((e) => e.to !== this.prev && e.to.id !== 'GATE');
    const choice = options.length ? pick(options) : at.edges[0];
    this.prev = at;
    this.next = choice ? choice.to : at;
  }

  routeTo(x, z) {
    const goal = nearestNode(x, z);
    const start = nearestNode(this.cart.x, this.cart.z);
    const p = astar(start, goal);
    this.path = p.slice(1);
    this.prev = start;
    this.next = this.path.shift() || start;
  }

  // world-space lane target
  laneTarget() {
    const a = this.prev, b = this.next;
    const e = edgeBetween(a, b);
    const w = e ? e.width : 9;
    const off = e && e.type === 'path' ? 1.0 : w * 0.25;
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    const rx = -uz, rz = ux; // right-hand side
    // project cart onto the edge and look ahead
    const c = this.cart;
    let t = ((c.x - a.x) * ux + (c.z - a.z) * uz);
    const ahead = Math.min(L, Math.max(0, t) + 7);
    return { x: a.x + ux * ahead + rx * off, z: a.z + uz * ahead + rz * off, remain: L - t, ux, uz };
  }

  // returns control input for the cart; `obstacles` = [{x,z}] to avoid rear-ending
  control(dt, obstacles = [], chaseTarget = null) {
    const c = this.cart;
    let tx, tz, desired = this.speed;
    if (chaseTarget) {
      tx = chaseTarget.x;
      tz = chaseTarget.z;
      desired = this.speed;
    } else {
      const lt = this.laneTarget();
      tx = lt.x;
      tz = lt.z;
      if (lt.remain < 6) this.pickNext();
      if (lt.remain < 14) desired = Math.min(desired, 4.2);
    }
    const want = Math.atan2(tx - c.x, tz - c.z);
    const diff = wrapAngle(want - c.heading);
    let steer = clamp(diff * 2.2, -1, 1);
    let throttle = c.forwardSpeed < desired ? 1 : 0;
    if (Math.abs(diff) > 1.2 && c.forwardSpeed > 3) throttle = -0.5;

    // avoid obstacles ahead
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    let blocked = false;
    for (const o of obstacles) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < 7 && side < 1.6) { blocked = true; break; }
    }
    this.ignoreT = Math.max(0, (this.ignoreT || 0) - dt);
    this.honkNow = false;
    if (blocked && !chaseTarget && this.ignoreT <= 0) {
      throttle = c.forwardSpeed > 0.5 ? -1 : 0;
      const before = this.blockedT;
      this.blockedT += dt;
      if (before < 2.5 && this.blockedT >= 2.5) this.honkNow = true;
      // break deadlocks: after a while, stop waiting and just go (seniors do this in real life too)
      if (this.blockedT > (this.patience ||= 3 + Math.random() * 3)) {
        this.ignoreT = 2.5;
        this.blockedT = 0;
        this.patience = 0;
      }
    } else if (!blocked) this.blockedT = 0;

    // unstick
    if (throttle > 0 && c.speed < 0.4) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.6) {
      this.reverseT = 1.2;
      this.stuckT = 0;
    }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      throttle = -1;
      steer = -steer;
    }
    if (this.stopT > 0) {
      this.stopT -= dt;
      throttle = c.forwardSpeed > 0.3 ? -1 : 0;
    }
    return { throttle, steer, handbrake: false, onRoad: true };
  }
}
