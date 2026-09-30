// Procedural low-poly retirees with a code-driven animation rig.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M, shirtMaterial } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { clamp, lerp, damp, pick } from '../core/utils.js';

export const SKINS = ['#f1c7a5', '#e8b996', '#d9a07c', '#c68863', '#9a6545', '#f5d3b8', '#eab8a0'];
export const HAIR_M = ['#f2f2f2', '#d9d9d9', '#bdbdbd', '#9a9a9a', '#1c1c1c', '#f2f2f2'];
export const HAIR_F = ['#b9c7f0', '#c9b3e6', '#f2f2f2', '#e2e2e2', '#d96d3b', '#f0d7a1', '#8e5a3c', '#ff9ec7'];
const SHORTS = ['#c8b48a', '#e7dfca', '#4a5a7a', '#8a9a6a', '#f2f2f2', '#b0463c', '#6b8fb0'];

const skinMat = () => M.vc;

function headParts(o) {
  const p = [];
  const skin = o.skin;
  p.push([GEO.sph, skin, mat4(0, 0, 0, 0, 0.19, 0.21, 0.19)]);
  p.push([GEO.sph, o.drinker ? '#e58a7a' : skin, mat4(0, -0.02, 0.18, 0, 0.045, 0.055, 0.06)]); // nose
  p.push([GEO.sph, skin, mat4(0.19, 0, 0, 0, 0.03, 0.07, 0.05)]);
  p.push([GEO.sph, skin, mat4(-0.19, 0, 0, 0, 0.03, 0.07, 0.05)]);
  p.push([GEO.sph, '#1a1a1a', mat4(0.07, 0.04, 0.165, 0, 0.022, 0.022, 0.015)]);
  p.push([GEO.sph, '#1a1a1a', mat4(-0.07, 0.04, 0.165, 0, 0.022, 0.022, 0.015)]);
  const brow = o.female ? '#8a6a5a' : o.hair;
  p.push([GEO.box, brow, mat4(0.075, 0.085, 0.17, 0, 0.08, o.female ? 0.015 : 0.03, 0.03, 0, -0.1)]);
  p.push([GEO.box, brow, mat4(-0.075, 0.085, 0.17, 0, 0.08, o.female ? 0.015 : 0.03, 0.03, 0, 0.1)]);
  if (o.female) {
    p.push([GEO.box, '#c2185b', mat4(0, -0.095, 0.17, 0, 0.07, 0.02, 0.02)]);
    p.push([GEO.sph, '#f2c94c', mat4(0.19, -0.07, 0.02, 0, 0.025, 0.025, 0.025)]);
    p.push([GEO.sph, '#f2c94c', mat4(-0.19, -0.07, 0.02, 0, 0.025, 0.025, 0.025)]);
    // bouffant
    const h = o.hair;
    p.push([GEO.ico1, h, mat4(0, 0.1, -0.03, 0, 0.23, 0.2, 0.23)]);
    p.push([GEO.ico1, h, mat4(0.13, 0.03, -0.05, 0, 0.12, 0.15, 0.14)]);
    p.push([GEO.ico1, h, mat4(-0.13, 0.03, -0.05, 0, 0.12, 0.15, 0.14)]);
    p.push([GEO.ico1, h, mat4(0, 0.2, 0, 0, 0.16, 0.12, 0.16)]);
  } else {
    if (o.mustache) p.push([GEO.box, o.hair === '#1c1c1c' ? '#d9d9d9' : o.hair, mat4(0, -0.07, 0.175, 0, 0.15, 0.04, 0.05)]);
    p.push([GEO.sph, o.hair, mat4(0.15, 0.02, -0.04, 0, 0.07, 0.1, 0.12)]);
    p.push([GEO.sph, o.hair, mat4(-0.15, 0.02, -0.04, 0, 0.07, 0.1, 0.12)]);
    p.push([GEO.sph, o.hair, mat4(0, 0.03, -0.15, 0, 0.14, 0.1, 0.07)]);
    if (o.combover) p.push([GEO.box, o.hair, mat4(0, 0.2, 0, 0, 0.26, 0.02, 0.2, 0, 0.2)]);
  }
  if (o.glasses === 'aviator') {
    p.push([GEO.sph, '#1b2a33', mat4(0.075, 0.035, 0.18, 0, 0.065, 0.05, 0.02)]);
    p.push([GEO.sph, '#1b2a33', mat4(-0.075, 0.035, 0.18, 0, 0.065, 0.05, 0.02)]);
    p.push([GEO.box, '#c9a64a', mat4(0, 0.06, 0.19, 0, 0.2, 0.012, 0.012)]);
  } else if (o.glasses === 'big') {
    p.push([GEO.box, '#2a1a2a', mat4(0, 0.04, 0.185, 0, 0.34, 0.1, 0.02)]);
  } else if (o.glasses === 'readers') {
    p.push([GEO.torus, '#6a4a2a', mat4(0.07, 0.035, 0.18, 0, 0.045, 0.045, 0.3)]);
    p.push([GEO.torus, '#6a4a2a', mat4(-0.07, 0.035, 0.18, 0, 0.045, 0.045, 0.3)]);
  }
  const hc = o.hatColor;
  if (o.hat === 'visor') {
    p.push([GEO.cyl, hc, mat4(0, 0.11, 0, 0, 0.2, 0.06, 0.2)]);
    p.push([GEO.box, hc, mat4(0, 0.09, 0.2, 0, 0.3, 0.02, 0.18, 0.15)]);
  } else if (o.hat === 'bucket') {
    p.push([GEO.cyl, hc, mat4(0, 0.15, 0, 0, 0.19, 0.16, 0.19)]);
    p.push([GEO.cyl, hc, mat4(0, 0.08, 0, 0, 0.3, 0.02, 0.3)]);
  } else if (o.hat === 'cap') {
    p.push([GEO.sph, hc, mat4(0, 0.1, 0, 0, 0.2, 0.14, 0.2)]);
    p.push([GEO.box, hc, mat4(0, 0.1, 0.22, 0, 0.22, 0.02, 0.18)]);
  } else if (o.hat === 'sunhat') {
    p.push([GEO.cyl, hc, mat4(0, 0.22, 0, 0, 0.18, 0.12, 0.18)]);
    p.push([GEO.cyl, hc, mat4(0, 0.17, 0, 0, 0.42, 0.02, 0.42)]);
    p.push([GEO.cyl, '#e84a5f', mat4(0, 0.19, 0, 0, 0.19, 0.04, 0.19)]);
  } else if (o.hat === 'fedora') {
    p.push([GEO.cyl, hc, mat4(0, 0.17, 0, 0, 0.17, 0.15, 0.17)]);
    p.push([GEO.cyl, hc, mat4(0, 0.1, 0, 0, 0.3, 0.02, 0.3)]);
    p.push([GEO.cyl, '#222', mat4(0, 0.13, 0, 0, 0.175, 0.04, 0.175)]);
  } else if (o.hat === 'security') {
    p.push([GEO.sph, '#1d2b53', mat4(0, 0.1, 0, 0, 0.2, 0.13, 0.2)]);
    p.push([GEO.box, '#1d2b53', mat4(0, 0.1, 0.21, 0, 0.24, 0.02, 0.16)]);
    p.push([GEO.box, '#f2c94c', mat4(0, 0.17, 0.17, 0, 0.08, 0.05, 0.02)]);
  }
  return p;
}

export function makeHeld(type) {
  const parts = [];
  if (type === 'rod') {
    parts.push([GEO.cyl, '#3a2a1a', mat4(0, -0.9, 0.35, 0, 0.018, 2.0, 0.018, 0.35)]);
    parts.push([GEO.cyl, '#999', mat4(0, -0.1, 0.08, 0, 0.05, 0.12, 0.05, Math.PI / 2)]);
  } else if (type === 'beer') {
    parts.push([GEO.cyl, '#c9d3db', mat4(0, 0, 0, 0, 0.035, 0.12, 0.035)]);
    parts.push([GEO.cyl, '#1f5fb0', mat4(0, 0, 0, 0, 0.036, 0.06, 0.036)]);
  } else if (type === 'fists' || !type) {
    return null;
  } else {
    const shaftLen = type === 'driver' ? 1.05 : type === 'putter' ? 0.85 : 0.95;
    const shaftCol = type === 'titanium' ? '#9fb3c8' : '#bfc5ca';
    parts.push([GEO.cyl, '#222', mat4(0, -0.02, 0, 0, 0.022, 0.2, 0.022)]); // grip
    parts.push([GEO.cyl, shaftCol, mat4(0, -shaftLen / 2, 0, 0, 0.012, shaftLen, 0.012)]);
    const hy = -shaftLen;
    if (type === 'putter') parts.push([GEO.box, '#9aa4ad', mat4(0.05, hy, 0, 0, 0.14, 0.04, 0.04)]);
    else if (type === 'driver' || type === 'titanium') parts.push([GEO.sph, type === 'titanium' ? '#607d9b' : '#1b1b1b', mat4(0.05, hy, 0.02, 0, 0.09, 0.06, 0.07)]);
    else if (type === 'wedge') parts.push([GEO.box, '#c0c6cc', mat4(0.05, hy, 0.02, 0, 0.1, 0.1, 0.02, 0.5)]);
    else parts.push([GEO.box, '#aeb6be', mat4(0.05, hy, 0.01, 0, 0.11, 0.07, 0.02, 0.3)]); // iron
  }
  const g = mergeParts(parts);
  const m = new THREE.Mesh(g, M.vc);
  m.castShadow = true;
  return m;
}

export function randomLook(female, rnd = Math.random) {
  const r = (a) => a[Math.floor(rnd() * a.length)];
  return {
    female,
    skin: r(SKINS),
    hair: female ? r(HAIR_F) : r(HAIR_M),
    shirt: Math.floor(rnd() * 8),
    shorts: r(SHORTS),
    hat: female ? r(['none', 'none', 'visor', 'sunhat']) : r(['none', 'visor', 'bucket', 'cap', 'fedora', 'none']),
    hatColor: r(['#ffffff', '#f2c94c', '#1f8a8a', '#e84a5f', '#23408e', '#c8b48a', '#ff9ec7']),
    glasses: r(female ? ['big', 'none', 'readers', 'big'] : ['aviator', 'none', 'readers', 'aviator']),
    mustache: !female && rnd() < 0.55,
    combover: !female && rnd() < 0.3,
    belly: female ? 0.9 + rnd() * 0.3 : 0.95 + rnd() * 0.55,
    height: 0.92 + rnd() * 0.12,
    sock: female ? '#ffffff' : rnd() < 0.7 ? '#141414' : '#ffffff',
    shoe: female ? r(['#ffffff', '#f7cad0', '#d9c7b0']) : r(['#6b4a2a', '#ffffff', '#3a2a1a']),
    drinker: rnd() < 0.3,
  };
}

export class Character {
  constructor(look) {
    this.look = look;
    const o = look;
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.85;
    this.rig.add(this.pelvis);

    // torso (patterned shirt / dress)
    const tParts = [
      [GEO.cyl, '#fff', mat4(0, 0.33, 0, 0, 0.25, 0.62, 0.21)],
      [GEO.sph, '#fff', mat4(0, 0.2, 0.05, 0, 0.27, 0.3, 0.25 * o.belly)],
      [GEO.sph, '#fff', mat4(0, 0.6, 0, 0, 0.31, 0.12, 0.2)],
    ];
    if (o.female) tParts.push([GEO.cyl, '#fff', mat4(0, -0.2, 0, 0, 0.28, 0.6, 0.28)], [GEO.cone, '#fff', mat4(0, -0.28, 0, 0, 0.44, 0.62, 0.4, Math.PI)]);
    // shirts: use the real UVs from primitives for the pattern
    const tg = mergeTextured(tParts);
    this.torso = new THREE.Mesh(tg, shirtMaterial(o.shirt));
    this.torso.castShadow = true;
    this.pelvis.add(this.torso);

    // body: head + neck + shorts, vertex colored
    const bParts = [[GEO.cyl, o.skin, mat4(0, 0.7, 0.02, 0, 0.08, 0.12, 0.08)]];
    if (!o.female) bParts.push([GEO.cyl, o.shorts, mat4(0, -0.02, 0, 0, 0.29, 0.24, 0.24)]);
    if (o.female && o.pearls !== false) bParts.push([GEO.torus, '#f5f0e6', mat4(0, 0.64, 0.02, 0, 0.15, 0.15, 0.4, Math.PI / 2 - 0.3)]);
    if (o.badge) bParts.push([GEO.box, '#f2c94c', mat4(0.12, 0.5, 0.22, 0, 0.07, 0.08, 0.02)]);
    if (o.sweater) bParts.push([GEO.cyl, o.sweater, mat4(0, 0.6, 0, 0, 0.33, 0.1, 0.24, 0, Math.PI / 2)], [GEO.sph, o.sweater, mat4(0, 0.5, 0.2, 0, 0.1, 0.08, 0.05)]);
    for (const hp of headParts(o)) {
      const m = mat4(0, 0.93, 0.02).multiply(hp[2]);
      bParts.push([hp[0], hp[1], m]);
    }
    this.body = new THREE.Mesh(mergeParts(bParts), skinMat());
    this.body.castShadow = true;
    this.pelvis.add(this.body);

    // arms
    const sleeve = pickSleeveColor(o.shirt);
    const armParts = (side) => [
      [GEO.cyl, sleeve, mat4(0, -0.1, 0, 0, 0.085, 0.22, 0.085)],
      [GEO.cyl, o.skin, mat4(0, -0.36, 0, 0, 0.055, 0.34, 0.055)],
      [GEO.sph, o.skin, mat4(0, -0.57, 0.01, 0, 0.065, 0.075, 0.06)],
      ...(o.female && side > 0 ? [[GEO.torus, '#f2c94c', mat4(0, -0.48, 0, 0, 0.065, 0.065, 0.5, Math.PI / 2)]] : []),
    ];
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(0.3, 0.57, 0);
    this.armR.position.set(-0.3, 0.57, 0);
    const aL = new THREE.Mesh(mergeParts(armParts(1)), M.vc);
    const aR = new THREE.Mesh(mergeParts(armParts(-1)), M.vc);
    aL.castShadow = aR.castShadow = true;
    this.armL.add(aL);
    this.armR.add(aR);
    this.pelvis.add(this.armL, this.armR);
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.58, 0.02);
    this.armR.add(this.hand);

    // legs
    const legParts = () => {
      const p = [];
      if (!o.female) p.push([GEO.cyl, o.shorts, mat4(0, -0.17, 0, 0, 0.12, 0.34, 0.12)]);
      p.push([GEO.cyl, o.skin, mat4(0, -0.5, 0, 0, 0.065, 0.4, 0.065)]);
      p.push([GEO.cyl, o.sock, mat4(0, -0.71, 0, 0, 0.07, o.sock === '#141414' ? 0.18 : 0.1, 0.07)]);
      p.push([GEO.box, o.shoe, mat4(0, -0.81, 0.05, 0, 0.13, 0.08, 0.28)]);
      if (o.shoe === '#6b4a2a') p.push([GEO.box, '#4a3020', mat4(0, -0.76, 0.05, 0, 0.14, 0.02, 0.14)]);
      return p;
    };
    const lg = mergeParts(legParts());
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(0.13, 0.85, 0);
    this.legR.position.set(-0.13, 0.85, 0);
    const lL = new THREE.Mesh(lg, M.vc), lR = new THREE.Mesh(lg, M.vc);
    lL.castShadow = lR.castShadow = true;
    this.legL.add(lL);
    this.legR.add(lR);
    this.rig.add(this.legL, this.legR);

    if (o.walker) {
      const wParts = [];
      for (const [x, z] of [[-0.28, 0], [0.28, 0], [-0.28, 0.4], [0.28, 0.4]]) wParts.push([GEO.cyl, '#c9ced1', mat4(x, 0.45, z + 0.35, 0, 0.018, 0.9, 0.018)]);
      wParts.push([GEO.box, '#c9ced1', mat4(0, 0.88, 0.55, 0, 0.6, 0.03, 0.03)]);
      wParts.push([GEO.box, '#c9ced1', mat4(0.28, 0.88, 0.55, 0, 0.03, 0.03, 0.42)]);
      wParts.push([GEO.box, '#c9ced1', mat4(-0.28, 0.88, 0.55, 0, 0.03, 0.03, 0.42)]);
      for (const x of [-0.28, 0.28]) wParts.push([GEO.sph, '#b8e04a', mat4(x, 0.04, 0.35, 0, 0.05, 0.05, 0.05)]); // tennis balls!
      this.walker = new THREE.Mesh(mergeParts(wParts), M.vc);
      this.walker.castShadow = true;
      this.rig.add(this.walker);
    }

    const s = o.height;
    this.root.scale.set(s * (0.95 + (o.belly - 1) * 0.2), s, s);

    this.phase = Math.random() * 10;
    this.speed = 0;
    this.mode = 'idle'; // idle | walk | sit | ko | swim
    this.action = null; // {type, t, dur}
    this.drunk = 0;
    this.t = Math.random() * 10;
    this.koT = 0;
    this.held = null;
    this.heldType = null;
  }

  setHeld(type) {
    if (this.heldType === type) return;
    if (this.held) this.hand.remove(this.held);
    this.heldType = type;
    this.held = makeHeld(type);
    if (this.held) {
      this.held.rotation.x = type === 'beer' ? 0 : 0.2;
      this.hand.add(this.held);
    }
  }

  play(type, dur = 0.5) {
    this.action = { type, t: 0, dur };
  }

  get acting() {
    return !!this.action;
  }

  update(dt) {
    this.t += dt;
    const sp = this.speed;
    const walking = this.mode === 'walk' || this.mode === 'swim';
    const amp = walking ? clamp(sp / 3.2, 0.15, 1.1) * 0.6 : 0;
    if (walking) this.phase += dt * (4 + sp * 2.4);
    const s = Math.sin(this.phase);

    let legL = s * amp, legR = -s * amp;
    let armL = -s * amp * 0.7, armR = s * amp * 0.7;
    let armLz = 0.08, armRz = -0.08;
    let pelY = 0.85 + Math.abs(Math.cos(this.phase)) * 0.035 * amp;
    let lean = 0.1 + sp * 0.025;
    let twist = 0;
    let rigRotX = 0, rigY = 0;
    let legLz = 0, legRz = 0;

    if (this.mode === 'idle') {
      const b = Math.sin(this.t * 1.6) * 0.02;
      armL = b; armR = -b;
      lean = 0.12 + b;
    }
    if (this.look.walker && this.mode !== 'sit' && this.mode !== 'ko') {
      armL = armR = -0.9;
      lean = 0.3;
    }
    if (this.mode === 'sit') {
      legL = legR = -1.45;
      pelY = 0.85;
      armL = armR = -0.95;
      armLz = 0.1; armRz = -0.1;
      lean = -0.05;
    }
    if (this.mode === 'swim') {
      armL = -1.8 + Math.sin(this.phase) * 1.2;
      armR = -1.8 - Math.sin(this.phase) * 1.2;
      lean = 0.9;
    }
    if (this.mode === 'ko' || this.mode === 'lounge') {
      this.koT += dt;
      rigRotX = -Math.PI / 2;
      rigY = 0.28;
      armLz = 1.3; armRz = -1.3; armL = armR = 0;
      legL = legR = 0;
      legLz = 0.25; legRz = -0.25;
      lean = 0;
    } else this.koT = 0;

    // overlay actions
    if (this.action) {
      const a = this.action;
      a.t += dt;
      const p = clamp(a.t / a.dur, 0, 1);
      if (a.type === 'swing') {
        if (p < 0.4) { armR = lerp(0, -2.9, p / 0.4); twist = lerp(0, 0.5, p / 0.4); }
        else if (p < 0.6) { armR = lerp(-2.9, -0.2, (p - 0.4) / 0.2); twist = lerp(0.5, -0.6, (p - 0.4) / 0.2); }
        else { armR = lerp(-0.2, 0, (p - 0.6) / 0.4); twist = lerp(-0.6, 0, (p - 0.6) / 0.4); }
        armL = armR * 0.8;
        armLz = -0.3;
      } else if (a.type === 'punch') {
        const k = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
        armR = -1.57 * k;
        twist = -0.35 * k;
      } else if (a.type === 'drink') {
        const k = p < 0.2 ? p / 0.2 : p > 0.85 ? (1 - p) / 0.15 : 1;
        armR = -2.4 * k;
        armRz = 0.55 * k;
        lean = lerp(lean, -0.35, k);
      } else if (a.type === 'wave') {
        armR = -2.8;
        armRz = -0.4 + Math.sin(a.t * 14) * 0.35;
      } else if (a.type === 'cheer') {
        armR = armL = -3;
        armLz = 0.4 + Math.sin(a.t * 12) * 0.2;
        armRz = -0.4 - Math.sin(a.t * 12) * 0.2;
        pelY += Math.abs(Math.sin(a.t * 10)) * 0.08;
      } else if (a.type === 'flinch') {
        lean = -0.4 * (1 - p);
        armL = armR = -0.6 * (1 - p);
      } else if (a.type === 'shake') {
        armR = -1.2;
        armRz = Math.sin(a.t * 20) * 0.2;
      } else if (a.type === 'point') {
        armR = -1.6;
      } else if (a.type === 'sand') {
        armR = lerp(-0.2, -1.8, Math.min(1, p * 2));
        armRz = lerp(0, -0.4, p);
      } else if (a.type === 'dance') {
        armR = -2.6 + Math.sin(a.t * 8) * 0.5;
        armL = -2.6 - Math.sin(a.t * 8) * 0.5;
        twist = Math.sin(a.t * 4) * 0.5;
        pelY += Math.abs(Math.sin(a.t * 8)) * 0.05;
      } else if (a.type === 'pee') {
        armR = armL = -0.5;
        lean = -0.2;
      }
      if (a.t >= a.dur) this.action = null;
    }

    const k = 14;
    const d = (obj, prop, v) => (obj[prop] = damp(obj[prop], v, k, dt));
    d(this.legL.rotation, 'x', legL);
    d(this.legR.rotation, 'x', legR);
    d(this.legL.rotation, 'z', legLz);
    d(this.legR.rotation, 'z', legRz);
    const fast = this.action && (this.action.type === 'swing' || this.action.type === 'punch');
    const ak = fast ? 40 : k;
    this.armL.rotation.x = damp(this.armL.rotation.x, armL, ak, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armR, ak, dt);
    d(this.armL.rotation, 'z', armLz);
    d(this.armR.rotation, 'z', armRz);
    d(this.pelvis.position, 'y', pelY);
    d(this.pelvis.rotation, 'x', lean);
    this.pelvis.rotation.y = damp(this.pelvis.rotation.y, twist, fast ? 30 : k, dt);
    if (!this.spinning) this.rig.rotation.x = damp(this.rig.rotation.x, rigRotX, 8, dt);
    this.rig.position.y = damp(this.rig.position.y, rigY, 8, dt);
    // drunken sway
    this.rig.rotation.z = Math.sin(this.t * 1.3) * 0.09 * this.drunk + (this.mode === 'ko' ? 0 : 0);
    if (this.walker) this.walker.position.z = walking ? Math.max(0, Math.sin(this.phase * 0.5)) * 0.08 : 0;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

function pickSleeveColor(idx) {
  return ['#1fa39a', '#c9303a', '#23408e', '#f2c14e', '#f7a1c4', '#6a4c93', '#f4f1de', '#3a86ff'][idx % 8];
}

// Merge textured parts keeping UVs (no vertex color needed).
function mergeTextured(parts) {
  const g = mergeParts(parts);
  return g;
}

export function randomName(female) {
  const M_ = ['Earl', 'Walt', 'Herb', 'Mort', 'Stan', 'Ned', 'Irv', 'Sy', 'Lou', 'Burt', 'Hank', 'Gus', 'Arnie', 'Sid', 'Moe', 'Vern', 'Floyd', 'Marv', 'Dutch', 'Clem', 'Sal', 'Norm', 'Chet', 'Ralph', 'Howie', 'Bernie', 'Lyle', 'Otis'];
  const F_ = ['Rosalind', 'Bev', 'Phyllis', 'Rhoda', 'Estelle', 'Marge', 'Dot', 'Edna', 'Ruth', 'Myrna', 'Shirley', 'Lois', 'Bunny', 'Fran', 'Trudy', 'Agnes', 'Vivian', 'Harriet', 'Opal', 'Pearl', 'Loretta', 'Irma', 'Gert', 'Sylvia'];
  const L_ = ['Goldberg', 'McAllister', 'Pruitt', 'Kowalski', 'Feldman', "O'Toole", 'Vanderhoff', 'Schwartz', 'Bellamy', 'Delgado', 'Finkel', 'Hobbs', 'Larkin', 'Nussbaum', 'Pettigrew', 'Russo', 'Tuttle', 'Whitaker'];
  return `${pick(female ? F_ : M_)} ${pick(L_)}`;
}
