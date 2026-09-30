// One-draw-call particle system using a texture atlas (hearts, stars, cash, dust, water...).
import * as THREE from 'three';
import { makeParticleAtlas, ATLAS } from './textures.js';
import { rand } from '../core/utils.js';

const MAX = 2000;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.cell = new Float32Array(MAX);
    this.rot = new Float32Array(MAX);
    this.col = new Float32Array(MAX * 3).fill(1);
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ alive: false });
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('cell', new THREE.BufferAttribute(this.cell, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: makeParticleAtlas() }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float size; attribute float alpha; attribute float cell; attribute float rot; attribute vec3 tint;
        uniform float uScale;
        varying float vA; varying float vCell; varying float vRot; varying vec3 vTint;
        void main(){
          vA = alpha; vCell = cell; vRot = rot; vTint = tint;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = min(size * uScale / -mv.z, 110.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying float vA; varying float vCell; varying float vRot; varying vec3 vTint;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float s = sin(vRot), co = cos(vRot);
          c = vec2(c.x*co - c.y*s, c.x*s + c.y*co) + 0.5;
          if (c.x<0.0||c.x>1.0||c.y<0.0||c.y>1.0) discard;
          vec2 uv = vec2((mod(vCell,8.0) + c.x)/8.0, 1.0 - (floor(vCell/8.0) + c.y)/2.0);
          vec4 t = texture2D(map, uv);
          if (t.a*vA < 0.02) discard;
          gl_FragColor = vec4(t.rgb * vTint, t.a*vA);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  setScale(h) {
    this.points.material.uniforms.uScale.value = h * 0.9;
  }

  emit(type, x, y, z, o = {}) {
    const p = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.life = p.max = o.life ?? 1;
    p.size = o.size ?? 0.5;
    p.grow = o.grow ?? 0;
    p.g = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.cell = ATLAS[type] ?? 0;
    p.rot = o.rot ?? 0;
    p.spin = o.spin ?? 0;
    p.fadeIn = o.fadeIn ?? 0.05;
    p.tint = o.tint || null;
    p.onDeath = o.onDeath || null;
    p.follow = o.follow || null; // object with .position to stick to
    p.fx = o.follow ? x - o.follow.x : 0;
    p.fz = o.follow ? z - o.follow.z : 0;
    return p;
  }

  burst(type, x, y, z, n, o = {}) {
    const sp = o.speed ?? 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = sp * rand(0.4, 1);
      this.emit(type, x, y, z, {
        vx: Math.cos(a) * s + (o.vx || 0),
        vy: (o.up ?? 3) * rand(0.5, 1.2),
        vz: Math.sin(a) * s + (o.vz || 0),
        life: (o.life ?? 1) * rand(0.7, 1.2),
        size: (o.size ?? 0.4) * rand(0.7, 1.3),
        gravity: o.gravity ?? 9,
        drag: o.drag ?? 0.5,
        spin: rand(-4, 4),
        rot: rand(0, 6.28),
        grow: o.grow ?? 0,
      });
    }
  }

  update(dt) {
    let n = 0;
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        if (p.onDeath) p.onDeath(p);
        continue;
      }
      p.vy -= p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= p.g ? 1 : d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt;
      p.rot += p.spin * dt;
      const age = p.max - p.life;
      const a = Math.min(1, age / p.fadeIn) * Math.min(1, p.life / (p.max * 0.35));
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.size[n] = p.size;
      this.alpha[n] = a;
      this.cell[n] = p.cell;
      this.rot[n] = p.rot;
      const tc = p.tint;
      this.col[n * 3] = tc ? tc[0] : 1;
      this.col[n * 3 + 1] = tc ? tc[1] : 1;
      this.col[n * 3 + 2] = tc ? tc[2] : 1;
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'size', 'alpha', 'cell', 'rot', 'tint']) this.geo.attributes[k].needsUpdate = true;
  }

  // A firework: a rising spark that bursts into a colored sphere of glitter.
  firework(x, z, y0 = 0, audio = null) {
    const palette = [[1, 0.3, 0.5], [1, 0.85, 0.2], [0.3, 0.9, 1], [0.5, 1, 0.5], [1, 0.5, 0.15], [0.8, 0.5, 1]];
    const col = palette[Math.floor(Math.random() * palette.length)];
    const col2 = palette[Math.floor(Math.random() * palette.length)];
    this.emit('spark', x, y0, z, {
      vx: rand(-2, 2), vy: rand(22, 30), vz: rand(-2, 2), gravity: 9, life: rand(1.1, 1.5), size: 0.9, tint: [1, 0.9, 0.7],
      onDeath: (p) => {
        if (audio) audio.fireworkPop(Math.hypot(p.x - (audio.listenerX || p.x), p.z - (audio.listenerZ || p.z)));
        for (let i = 0; i < 90; i++) {
          const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), s = rand(9, 14);
          this.emit('spark', p.x, p.y, p.z, {
            vx: Math.sin(ph) * Math.cos(th) * s, vy: Math.cos(ph) * s, vz: Math.sin(ph) * Math.sin(th) * s,
            gravity: 5, drag: 1.4, life: rand(1.4, 2.2), size: rand(1.4, 2.2), grow: -0.6, tint: i % 3 ? col : col2,
          });
        }
      },
    });
  }
}
