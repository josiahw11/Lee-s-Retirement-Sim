// Knockable lawn props (instanced), golf balls (instanced) and cash pickups.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { heightAt, waterLevel } from '../world/terrain.js';
import { rand } from '../core/utils.js';

const PROP_GEO = {
  flamingo: () => mergeParts([
    [GEO.sph, '#ff6fa8', mat4(0, 0.62, 0, 0, 0.13, 0.11, 0.22)],
    [GEO.cyl, '#ff6fa8', mat4(0, 0.82, 0.13, 0, 0.03, 0.3, 0.03, 0.3)],
    [GEO.sph, '#ff6fa8', mat4(0, 0.98, 0.2, 0, 0.06, 0.06, 0.07)],
    [GEO.cone, '#222', mat4(0, 0.96, 0.29, 0, 0.025, 0.09, 0.025, Math.PI / 2 + 0.4)],
    [GEO.cyl, '#333', mat4(0.03, 0.26, 0, 0, 0.012, 0.52, 0.012)],
    [GEO.cyl, '#333', mat4(-0.03, 0.26, 0, 0, 0.012, 0.52, 0.012)],
  ]),
  gnome: () => mergeParts([
    [GEO.cyl, '#2f5fb0', mat4(0, 0.18, 0, 0, 0.13, 0.36, 0.13)],
    [GEO.sph, '#f1c7a5', mat4(0, 0.42, 0, 0, 0.09, 0.09, 0.09)],
    [GEO.cone, '#e63946', mat4(0, 0.6, 0, 0, 0.11, 0.3, 0.11)],
    [GEO.cone, '#ffffff', mat4(0, 0.3, 0.08, 0, 0.08, 0.18, 0.04, Math.PI)],
    [GEO.sph, '#e8a0a0', mat4(0, 0.42, 0.09, 0, 0.03, 0.03, 0.03)],
  ]),
  mailbox: () => mergeParts([
    [GEO.box, '#6b4a2a', mat4(0, 0.5, 0, 0, 0.1, 1.0, 0.1)],
    [GEO.box, '#2b2b2b', mat4(0, 1.08, 0, 0, 0.26, 0.26, 0.5)],
    [GEO.cyl, '#2b2b2b', mat4(0, 1.2, 0, 0, 0.13, 0.5, 0.13, Math.PI / 2)],
    [GEO.box, '#e63946', mat4(0.15, 1.2, 0.05, 0, 0.02, 0.18, 0.05)],
  ]),
  trashcan: () => mergeParts([
    [GEO.cyl, '#2f6b4a', mat4(0, 0.5, 0, 0, 0.32, 1.0, 0.32)],
    [GEO.cyl, '#24533a', mat4(0, 1.03, 0, 0, 0.35, 0.08, 0.35)],
  ]),
};

export class Props {
  constructor(scene, spawns) {
    this.list = [];
    this.meshes = {};
    const byType = {};
    for (const s of spawns) (byType[s.type] ||= []).push(s);
    for (const [type, arr] of Object.entries(byType)) {
      const mesh = new THREE.InstancedMesh(PROP_GEO[type](), M.vc, arr.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      this.meshes[type] = mesh;
      arr.forEach((s, i) => {
        const p = {
          type, idx: i, mesh,
          x: s.x, z: s.z, y: heightAt(s.x, s.z), ry: s.ry, rx: 0, rz: 0,
          home: { x: s.x, z: s.z, ry: s.ry },
          vx: 0, vy: 0, vz: 0, av: 0, state: 'idle', t: 0, house: s.house,
        };
        this.list.push(p);
        this.write(p);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    this._dirty = new Set();
    this.grid = new Map();
    for (const p of this.list) {
      const k = this.key(p.home.x, p.home.z);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(p);
    }
  }

  key(x, z) {
    return Math.floor(x / 20) * 1000 + Math.floor(z / 20);
  }

  near(x, z) {
    const out = [];
    const ix = Math.floor(x / 20), iz = Math.floor(z / 20);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = this.grid.get((ix + a) * 1000 + iz + b);
      if (l) out.push(...l);
    }
    // also any currently flying props (they may have left their cell)
    return out;
  }

  write(p) {
    const m = mat4(p.x, p.y, p.z, p.ry, 1, 1, 1, p.rx, p.rz);
    p.mesh.setMatrixAt(p.idx, m);
    p.mesh.instanceMatrix.needsUpdate = true;
  }

  // Launch a prop. Returns true if it was standing (so it "counts").
  hit(p, vx, vz, up = 5) {
    const wasIdle = p.state === 'idle';
    p.state = 'fly';
    p.vx = vx + rand(-1, 1);
    p.vz = vz + rand(-1, 1);
    p.vy = up + rand(0, 2);
    p.av = rand(6, 14) * (Math.random() < 0.5 ? -1 : 1);
    p.t = 0;
    this._dirty.add(p);
    return wasIdle;
  }

  update(dt, playerX, playerZ) {
    for (const p of this._dirty) {
      if (p.state === 'fly') {
        p.vy -= 20 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rx += p.av * dt;
        p.rz += p.av * 0.6 * dt;
        const g = heightAt(p.x, p.z);
        const wl = waterLevel(p.x, p.z);
        if (p.y < g) {
          p.y = g;
          if (Math.abs(p.vy) > 3) {
            p.vy = -p.vy * 0.35;
            p.vx *= 0.6;
            p.vz *= 0.6;
          } else {
            p.state = 'down';
            p.rx = Math.PI / 2;
            p.rz = 0;
            p.t = 0;
          }
        }
        if (wl !== null && p.y < wl) {
          p.state = 'down';
          p.y = wl - 0.3;
          p.t = 0;
        }
        this.write(p);
      } else if (p.state === 'down') {
        p.t += dt;
        // respawn after a while when nobody's looking
        if (p.t > 150 && Math.hypot(playerX - p.home.x, playerZ - p.home.z) > 60) {
          p.x = p.home.x; p.z = p.home.z; p.ry = p.home.ry;
          p.y = heightAt(p.x, p.z);
          p.rx = p.rz = 0;
          p.state = 'idle';
          this.write(p);
          this._dirty.delete(p);
        }
      }
    }
  }
}

// ---------------- golf balls ----------------
export class Balls {
  constructor(scene, max = 500) {
    const g = new THREE.SphereGeometry(0.075, 8, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.4 });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.max = max;
    this.list = [];
    this.flying = [];
    this._m = new THREE.Matrix4();
  }

  add(x, z) {
    if (this.list.length >= this.max) return;
    const wl = waterLevel(x, z);
    const y = heightAt(x, z) + 0.07;
    const b = { x, z, y, wet: wl !== null };
    this.list.push(b);
    this._sync();
    return b;
  }

  // A golfer's shot in flight: arcs from (x0,z0) to (x1,z1).
  launch(x0, z0, x1, z1) {
    this.flying.push({ x0, z0, x1, z1, t: 0, dur: 2.2 + Math.random(), mesh: null });
  }

  removeAt(i) {
    this.list[i] = this.list[this.list.length - 1];
    this.list.pop();
    this._sync();
  }

  _sync() {
    const m = this._m;
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      m.makeTranslation(b.x, b.y, b.z);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, scene, onLand) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      if (!f.mesh) {
        f.mesh = new THREE.Mesh(this.mesh.geometry, this.mesh.material);
        scene.add(f.mesh);
      }
      f.t += dt;
      const t = Math.min(1, f.t / f.dur);
      const x = f.x0 + (f.x1 - f.x0) * t, z = f.z0 + (f.z1 - f.z0) * t;
      const y = heightAt(x, z) + Math.sin(t * Math.PI) * 35 + 0.1;
      f.mesh.position.set(x, y, z);
      if (t >= 1) {
        scene.remove(f.mesh);
        this.flying.splice(i, 1);
        const b = this.add(f.x1, f.z1);
        if (onLand) onLand(b);
      }
    }
  }
}

// ---------------- cash pickups ----------------
export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = mergeParts([
      [GEO.box, '#3f9a4a', mat4(0, 0, 0, 0, 0.36, 0.04, 0.18)],
      [GEO.box, '#e7f5d0', mat4(0, 0.025, 0, 0, 0.12, 0.01, 0.1)],
    ]);
    this.t = 0;
  }

  drop(x, z, amount, kind = 'cash') {
    const mesh = new THREE.Mesh(this.geo, M.vc);
    mesh.castShadow = true;
    const p = { x: x + rand(-0.6, 0.6), z: z + rand(-0.6, 0.6), y: heightAt(x, z) + 1.2, vy: 4, amount, kind, mesh, life: 60 };
    mesh.position.set(p.x, p.y, p.z);
    this.scene.add(mesh);
    this.list.push(p);
  }

  update(dt, px, pz, onPick) {
    this.t += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const g = heightAt(p.x, p.z) + 0.3;
      p.vy -= 15 * dt;
      p.y = Math.max(g + Math.sin(this.t * 3 + i) * 0.08, p.y + p.vy * dt);
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.rotation.y += dt * 3;
      p.life -= dt;
      const d = Math.hypot(px - p.x, pz - p.z);
      if (d < 3.5 && p.vy < 0) {
        // magnet toward player
        p.x += (px - p.x) * dt * 6;
        p.z += (pz - p.z) * dt * 6;
      }
      if (d < 0.9 || p.life <= 0) {
        if (d < 0.9) onPick(p);
        this.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }
}
