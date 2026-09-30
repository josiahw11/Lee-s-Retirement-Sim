// Gradient sky dome with sun, procedural stars and drifting billboard clouds,
// plus the day/night lighting rig.
import * as THREE from 'three';
import { makeCloudTexture } from './textures.js';
import { clamp, lerp, smooth } from '../core/utils.js';

// hour -> palette keyframes
const KEYS = [
  { h: 0, top: '#070b1f', hor: '#16203d', fog: '#101830', sun: '#000000', sunI: 0, amb: 0.22, hemiSky: '#3b4a80', hemiGnd: '#1a1f2a', stars: 1 },
  { h: 5.2, top: '#0d1433', hor: '#2a2d55', fog: '#1d2244', sun: '#000000', sunI: 0, amb: 0.25, hemiSky: '#3b4a80', hemiGnd: '#1a1f2a', stars: 0.9 },
  { h: 6.3, top: '#35508e', hor: '#f7a072', fog: '#d49a86', sun: '#ffb070', sunI: 0.9, amb: 0.45, hemiSky: '#9fb6e0', hemiGnd: '#5a4a3a', stars: 0.1 },
  { h: 8, top: '#3a84d6', hor: '#b9e2ff', fog: '#bfe0f5', sun: '#fff1d6', sunI: 2.4, amb: 0.7, hemiSky: '#bfe3ff', hemiGnd: '#6a7a4a', stars: 0 },
  { h: 16.5, top: '#3a84d6', hor: '#c4e6ff', fog: '#c8e4f5', sun: '#fff1d6', sunI: 2.5, amb: 0.7, hemiSky: '#bfe3ff', hemiGnd: '#6a7a4a', stars: 0 },
  { h: 18.4, top: '#4a4f9a', hor: '#ff8a5c', fog: '#e89a80', sun: '#ff9a5a', sunI: 1.5, amb: 0.5, hemiSky: '#c49ad0', hemiGnd: '#6a4a3a', stars: 0 },
  { h: 19.6, top: '#241f55', hor: '#c24f7e', fog: '#6a3f6a', sun: '#ff5a6a', sunI: 0.3, amb: 0.33, hemiSky: '#7a5aa0', hemiGnd: '#2a1f2a', stars: 0.35 },
  { h: 20.8, top: '#0a0f28', hor: '#1f2248', fog: '#141a36', sun: '#000000', sunI: 0, amb: 0.24, hemiSky: '#3b4a80', hemiGnd: '#1a1f2a', stars: 1 },
  { h: 24, top: '#070b1f', hor: '#16203d', fog: '#101830', sun: '#000000', sunI: 0, amb: 0.22, hemiSky: '#3b4a80', hemiGnd: '#1a1f2a', stars: 1 },
];
const cA = new THREE.Color(), cB = new THREE.Color();
function mixHex(a, b, t, out) {
  cA.set(a);
  cB.set(b);
  return out.copy(cA).lerp(cB, t);
}

export class SkySystem {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      top: { value: new THREE.Color() },
      hor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color() },
      stars: { value: 0 },
      time: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; uniform float time;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -1.0, 1.0);
          vec3 col = mix(hor, top, pow(clamp(h,0.0,1.0), 0.55));
          col = mix(col, hor*0.85, clamp(-h*3.0,0.0,1.0));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          col += sunCol * (pow(sd, 900.0)*6.0 + pow(sd, 18.0)*0.35 + pow(sd,3.0)*0.12);
          if (stars > 0.01 && h > 0.0) {
            vec3 q = floor(d*260.0);
            float s = hash(q);
            float tw = 0.6 + 0.4*sin(time*2.0 + s*50.0);
            col += vec3(step(0.9975, s) * tw * stars * smoothstep(0.0,0.25,h));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // clouds
    const tex = makeCloudTexture();
    this.clouds = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
      const s = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2, r = 250 + Math.random() * 420;
      s.position.set(Math.cos(a) * r, 120 + Math.random() * 90, Math.sin(a) * r);
      const sc = 120 + Math.random() * 160;
      s.scale.set(sc, sc * 0.45, 1);
      s.userData.speed = 1.5 + Math.random() * 2;
      scene.add(s);
      this.clouds.push(s);
    }

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0);
    scene.add(this.moon);
    scene.add(this.moon.target);

    scene.fog = new THREE.Fog(0xbfe0f5, 120, 620);
    this.night = 0;
    this.fogColor = new THREE.Color();
  }

  // hour: 0..24 float. focus: point the shadow camera follows.
  update(hour, dt, focus) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = smooth(clamp((hour - a.h) / (b.h - a.h), 0, 1));
    const u = this.uniforms;
    mixHex(a.top, b.top, t, u.top.value);
    mixHex(a.hor, b.hor, t, u.hor.value);
    mixHex(a.sun, b.sun, t, u.sunCol.value);
    u.stars.value = lerp(a.stars, b.stars, t);
    u.time.value += dt;

    // sun path: rises east (+x) at 6, sets west at 19.5
    const dayT = clamp((hour - 6) / 13.5, -0.1, 1.1);
    const ang = dayT * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.95, -0.35).normalize();
    u.sunDir.value.copy(sunDir);
    const sunI = lerp(a.sunI, b.sunI, t);
    this.sun.intensity = sunI;
    this.sun.color.copy(u.sunCol.value).lerp(new THREE.Color(1, 1, 1), 0.3);
    const up = Math.max(sunDir.y, 0.12);
    this.sun.position.set(focus.x + sunDir.x * 150, up * 150, focus.z + sunDir.z * 150);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.castShadow = sunI > 0.15 && this.shadowsEnabled !== false;

    this.night = clamp(1 - sunI / 1.2, 0, 1);
    this.moon.intensity = this.night * 0.55;
    this.moon.position.set(focus.x - 80, 160, focus.z + 60);
    this.moon.target.position.set(focus.x, 0, focus.z);

    this.hemi.intensity = lerp(a.amb, b.amb, t) * 1.3;
    mixHex(a.hemiSky, b.hemiSky, t, this.hemi.color);
    mixHex(a.hemiGnd, b.hemiGnd, t, this.hemi.groundColor);
    mixHex(a.fog, b.fog, t, this.fogColor);
    this.scene.fog.color.copy(this.fogColor);

    this.dome.position.set(focus.x, 0, focus.z);
    const cloudTint = new THREE.Color().copy(u.hor.value).lerp(new THREE.Color(1, 1, 1), 0.55 - this.night * 0.4);
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x - focus.x > 700) c.position.x -= 1400;
      c.material.color.copy(cloudTint);
      c.material.opacity = 0.85 - this.night * 0.55;
    }
    return this.night;
  }
}
