// Stylized animated water for ponds and the clubhouse pool.
import * as THREE from 'three';
import { shared } from './materials.js';

export function makeWaterMaterial({ deep = '#1d5f6e', shallow = '#4fb3a9', pool = false } = {}) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(deep) },
      uShallow: { value: new THREE.Color(shallow) },
      uSky: { value: new THREE.Color('#bfe0f5') },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
      uNight: { value: 0 },
      uPool: { value: pool ? 1 : 0 },
    },
  ]);
  uniforms.uTime = shared.time;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    fog: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorld; varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSunDir; uniform float uNight; uniform float uPool;
      varying vec3 vWorld; varying vec2 vUv;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vWorld.xz;
        float t = uTime;
        float n1 = noise(p*0.35 + vec2(t*0.25, t*0.18));
        float n2 = noise(p*0.9 - vec2(t*0.4, -t*0.3));
        vec3 nrm = normalize(vec3((n1-0.5)*0.9 + (n2-0.5)*0.5, 1.0, (n2-0.5)*0.9 - (n1-0.5)*0.4));
        vec3 view = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(view, nrm), 0.0), 3.0);
        vec3 base = mix(uShallow, uDeep, 0.45 + 0.35*n1);
        if (uPool > 0.5) {
          // caustics
          float c = noise(p*2.2 + t*0.6) * noise(p*2.9 - t*0.5);
          base += vec3(0.35,0.45,0.45) * smoothstep(0.18, 0.42, c);
        }
        vec3 col = mix(base, uSky, clamp(fres*0.85, 0.0, 0.85));
        vec3 h = normalize(normalize(uSunDir) + view);
        float spec = pow(max(dot(nrm, h), 0.0), 140.0);
        col += vec3(1.0, 0.95, 0.85) * spec * 1.6 * (1.0 - uNight);
        float sparkle = step(0.985, noise(p*6.0 + t*1.5)) * (1.0 - uNight);
        col += sparkle * 0.6;
        col *= mix(1.0, 0.35, uNight);
        gl_FragColor = vec4(col, uPool > 0.5 ? 0.82 : 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  return mat;
}
