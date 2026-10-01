// Shared materials. The main vertex-colored material also animates a "wind" attribute
// so palm fronds and bushes sway without any per-object CPU work.
import * as THREE from 'three';
import { makeShirtTexture, makeRoofTileTexture } from './textures.js';

export const shared = {
  time: { value: 0 },
  night: { value: 0 },
  gust: { value: 1 }, // wind thrash multiplier (hurricanes crank it)
  windPhase: { value: 0 }, // integral of gust over time (so ramping the gust never jumps the sway)
  lean: { value: new THREE.Vector2(0, 0) }, // steady downwind bend
};

function addWind(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.time;
    shader.uniforms.uGust = shared.gust;
    shader.uniforms.uWindPhase = shared.windPhase;
    shader.uniforms.uLean = shared.lean;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float wind;\nuniform float uTime;\nuniform float uGust;\nuniform float uWindPhase;\nuniform vec2 uLean;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (wind > 0.0) {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float ph = wp.x * 0.13 + wp.z * 0.11;
          transformed.x += sin(uWindPhase * 1.7 + ph) * wind * 0.22 * uGust + uLean.x * wind * 6.0;
          transformed.z += cos(uWindPhase * 1.3 + ph * 1.3) * wind * 0.18 * uGust + uLean.y * wind * 6.0;
          transformed.y += sin(uTime * 2.1 + ph) * wind * 0.06 * uGust - length(uLean) * wind * 2.0;
        }`
      );
  };
  mat.customProgramCacheKey = () => 'wind';
  return mat;
}

// shadow-pass twin of M.vc so palm shadows sway and lean with the fronds
export const vcDepth = addWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));

export const M = {
  vc: addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 })),
  vcShiny: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.35 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8ec9e0, roughness: 0.15, metalness: 0.2, emissive: 0xffc46b, emissiveIntensity: 0 }),
  neon: new THREE.MeshStandardMaterial({ color: 0xff4fa3, emissive: 0xff4fa3, emissiveIntensity: 1.2, roughness: 0.4 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffd98a, emissiveIntensity: 0, roughness: 0.4 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.12, metalness: 1.0 }),
};
// roofs: tile texture tinted by vertex color (UVs are in 1.2 m units, see hipRoof())
M.roof = new THREE.MeshStandardMaterial({ vertexColors: true, map: makeRoofTileTexture(), roughness: 0.78 });
// lanai screen mesh
M.screen = new THREE.MeshStandardMaterial({ color: 0x2c3236, transparent: true, opacity: 0.32, roughness: 0.9, depthWrite: false, side: THREE.DoubleSide });
M.screen.userData.noShadow = true;
M.glass.userData.noShadow = true;
M.lamp.userData.noShadow = true;
M.neon.userData.noShadow = true;

const shirtMats = new Map();
export function shirtMaterial(idx) {
  if (!shirtMats.has(idx)) {
    const sparkle = idx >= 8 && idx <= 10; // sequins and lame catch the stage lights
    shirtMats.set(idx, new THREE.MeshStandardMaterial({ map: makeShirtTexture(idx), roughness: sparkle ? 0.32 : 0.9, metalness: sparkle ? 0.55 : 0 }));
  }
  return shirtMats.get(idx);
}

const solidMats = new Map();
export function solid(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!solidMats.has(key)) solidMats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }));
  return solidMats.get(key);
}

export function updateNightMaterials(night) {
  shared.night.value = night;
  M.glass.emissiveIntensity = night * 0.9;
  M.lamp.emissiveIntensity = 0.2 + night * 2.6;
  M.neon.emissiveIntensity = 0.8 + night * 2.0;
}
