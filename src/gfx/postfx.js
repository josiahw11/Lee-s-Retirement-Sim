// Post-processing: bloom for neon/lamps at night, then a final pass that does color
// grading, vignette, drunk vision (wobble + double vision), damage flash and pocket-sand blindness.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDrunk: { value: 0 },
    uDamage: { value: 0 },
    uBlind: { value: 0 },
    uRhino: { value: 0 },
    uFade: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uDrunk; uniform float uDamage; uniform float uBlind; uniform float uRhino; uniform float uFade; uniform float uAspect;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      float d = uDrunk;
      vec2 uv = vUv;
      uv += vec2(sin(uv.y*7.0 + uTime*1.4), cos(uv.x*6.0 + uTime*1.1)) * 0.007 * d;
      // slow drunken screen rotation around center
      vec2 c = uv - 0.5;
      float ang = sin(uTime*0.6) * 0.035 * d * d;
      c = vec2(c.x*cos(ang) - c.y*sin(ang), c.x*sin(ang) + c.y*cos(ang));
      uv = c + 0.5;
      vec3 col = texture2D(tDiffuse, uv).rgb;
      if (d > 0.05) {
        vec2 off = vec2(sin(uTime*0.9), cos(uTime*0.63)) * 0.018 * d * d;
        vec3 ghost = texture2D(tDiffuse, uv + off).rgb;
        col = mix(col, ghost, 0.45 * smoothstep(0.1, 0.8, d));
        if (d > 0.5) {
          float b = (d - 0.5) * 0.012;
          vec3 blur = (texture2D(tDiffuse, uv + vec2(b,0.0)).rgb + texture2D(tDiffuse, uv - vec2(b,0.0)).rgb + texture2D(tDiffuse, uv + vec2(0.0,b)).rgb + texture2D(tDiffuse, uv - vec2(0.0,b)).rgb) * 0.25;
          col = mix(col, blur, 0.6);
        }
        col *= vec3(1.0 + 0.08*d, 1.0 + 0.03*d, 1.0 - 0.06*d); // beer goggles: warm
      }
      // grade: gentle saturation + warmth
      float l = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(l), col, 1.12);
      // rhino mode
      col = mix(col, col*vec3(1.25,0.8,0.75), uRhino*0.6);
      // vignette
      vec2 v = vUv - 0.5; v.x *= uAspect;
      float vig = smoothstep(0.95, 0.3, length(v));
      col *= mix(0.72, 1.0, vig);
      // damage flash on the edges
      col = mix(col, vec3(0.8,0.05,0.05), uDamage * (1.0 - vig) * 0.9);
      col = mix(col, vec3(1.0,0.2,0.1), uRhino * (1.0 - vig) * 0.35 * (0.6+0.4*sin(uTime*6.0)));
      // pocket sand
      float n = hash(vUv*vec2(310.0, 170.0) + uTime);
      col = mix(col, vec3(0.86,0.78,0.58) * (0.8 + 0.2*n), uBlind * (0.55 + 0.4*(1.0-vig)));
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.enabled = true;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.final.uniforms.uAspect.value = w / h;
  }

  render(dt, fx) {
    const u = this.final.uniforms;
    u.uTime.value += dt;
    u.uDrunk.value = fx.drunk;
    u.uDamage.value = fx.damage;
    u.uBlind.value = fx.blind;
    u.uRhino.value = fx.rhino;
    u.uFade.value = fx.fade;
    this.bloom.strength = 0.18 + fx.night * 0.55;
    this.composer.render(dt);
  }
}
