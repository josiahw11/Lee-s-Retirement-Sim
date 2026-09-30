// Boot: renderer, world, UI, title screen, main loop.
import * as THREE from 'three';
import { Input } from './core/input.js';
import { audio } from './core/audio.js';
import { CameraRig } from './core/camera.js';
import { SkySystem } from './gfx/sky.js';
import { Particles } from './gfx/particles.js';
import { PostFX } from './gfx/postfx.js';
import { shared, updateNightMaterials } from './gfx/materials.js';
import { World } from './world/world.js';
import { UI } from './ui/ui.js';
import { Minimap } from './ui/minimap.js';
import { Game, defaultState } from './game/game.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => setTimeout(r, 0))));
const setLoad = async (pct, msg) => {
  $('load-fill').style.width = `${pct}%`;
  $('load-msg').textContent = msg;
  await nextFrame();
};

const CONTROLS = [
  ['WASD', 'Walk / drive'], ['Mouse', 'Look around'],
  ['Shift', 'Brisk shuffle / Nitrous'], ['Space', 'Hop / drift'],
  ['E', 'Interact, enter/exit cart'], ['Click / F', 'Swing club / punch'],
  ['R-Click / G', 'Pocket sand (wedge)'], ['Q / 1-6', 'Switch club'],
  ['B', 'Drink a beer'], ['P (hold)', 'Pee. Anywhere.'],
  ['H', 'Horn'], ['R', 'Cart radio'],
  ['Tab', 'Phone: stats, bag, romance'], ['M', 'Map'],
  ['Esc', 'Pause / settings'], ['` [ ]', 'Demo: +3h / +stats / +$1k'],
];
for (const id of ['controls-grid', 'controls-grid2']) {
  $(id).innerHTML = CONTROLS.map(([k, d]) => `<span class="kbd">${k}</span><span>${d}</span>`).join('');
}

async function boot() {
  await setLoad(5, 'Applying sunscreen...');
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
  camera.position.set(80, 30, 80);

  await setLoad(15, 'Painting the sky a tasteful sunset...');
  const sky = new SkySystem(scene);
  await setLoad(25, 'Pouring concrete, planting palms, installing 72 identical stucco houses...');
  let t0 = performance.now();
  const world = new World(scene);
  console.log(`[boot] world ${Math.round(performance.now() - t0)}ms`);
  t0 = performance.now();
  await setLoad(70, 'Waking up the residents (this takes a while at their age)...');
  const particles = new Particles(scene);
  const post = new PostFX(renderer, scene, camera);
  const ui = new UI();
  ui.camera = camera;
  const minimap = new Minimap($('minimap'), $('bigmap-canvas'));
  const input = new Input(canvas);
  const camRig = new CameraRig(camera);
  camRig.col = world.col;
  const game = new Game({ scene, camera, camRig, input, ui, world, particles, sky, post, minimap, renderer });
  console.log(`[boot] game ${Math.round(performance.now() - t0)}ms`);
  await setLoad(90, 'Hiding golf balls in the ponds...');
  t0 = performance.now();
  // warm up shaders
  renderer.compile(scene, camera);
  console.log(`[boot] compile ${Math.round(performance.now() - t0)}ms`);
  await setLoad(100, 'Welcome to paradise.');

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(w, h);
    particles.setScale(h);
  };
  window.addEventListener('resize', resize);
  resize();

  // ---------------- settings ----------------
  const settings = Object.assign({ master: 0.8, music: 0.55, sens: 1, speech: true, bloom: true, shadows: true }, JSON.parse(localStorage.getItem('sunset-palms-settings') || '{}'));
  const applySettings = () => {
    audio.setVolume('master', settings.master);
    audio.setMusicVolume(settings.music);
    audio.speechEnabled = settings.speech;
    camRig.sensitivity = settings.sens;
    post.bloom.enabled = settings.bloom;
    sky.shadowsEnabled = settings.shadows;
    localStorage.setItem('sunset-palms-settings', JSON.stringify(settings));
  };
  $('set-master').value = settings.master;
  $('set-music').value = settings.music;
  $('set-sens').value = settings.sens;
  $('set-speech').checked = settings.speech;
  $('set-bloom').checked = settings.bloom;
  $('set-shadows').checked = settings.shadows;
  $('set-master').oninput = (e) => { settings.master = +e.target.value; applySettings(); };
  $('set-music').oninput = (e) => { settings.music = +e.target.value; applySettings(); };
  $('set-sens').oninput = (e) => { settings.sens = +e.target.value; applySettings(); };
  $('set-speech').onchange = (e) => { settings.speech = e.target.checked; applySettings(); };
  $('set-bloom').onchange = (e) => { settings.bloom = e.target.checked; applySettings(); };
  $('set-shadows').onchange = (e) => { settings.shadows = e.target.checked; applySettings(); };
  applySettings();

  // ---------------- title / intro ----------------
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  if (Game.loadSave()) $('btn-continue').classList.remove('hidden');
  let paused = false;
  // title music: the lounge station, as soon as the browser lets us make noise
  const titleMusic = () => {
    if (game.running) return;
    audio.init();
    applySettings();
    audio.setStation(1);
    audio.setRadio(true);
  };
  window.addEventListener('pointerdown', titleMusic, { once: true });
  window.addEventListener('keydown', titleMusic, { once: true });

  const startGame = (state, isNew) => {
    audio.init();
    applySettings();
    $('title').classList.add('hidden');
    $('intro').classList.add('hidden');
    $('hud').classList.remove('hidden');
    game.start(state, isNew);
    input.requestLock();
  };

  $('btn-new').onclick = () => {
    audio.init();
    const name = ($('name-input').value || 'Lee').trim().slice(0, 16) || 'Lee';
    $('title').classList.add('hidden');
    $('intro').classList.remove('hidden');
    const text = `After "The Incident" at the Boca Raton Elks Lodge — which involved a golf cart, a decorative fountain, three widows and a handle of Fireball — ${name}'s kids have "relocated" Dad to SUNSET PALMS, an Active Adult Community.\n\nFixed income. A strict HOA. A clubhouse full of lonely widows. A golf course full of lost balls. And a guy named Doc behind the maintenance shed.\n\nThe kids think you'll finally settle down.\n\nThe kids are wrong.`;
    let i = 0;
    const el = $('intro-text');
    el.textContent = '';
    const typer = setInterval(() => {
      i += 3;
      el.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typer);
    }, 18);
    $('btn-intro').onclick = () => {
      clearInterval(typer);
      startGame(defaultState(name), true);
    };
  };
  $('btn-continue').onclick = () => {
    const s = Game.loadSave();
    if (s) startGame(s, false);
  };
  $('btn-controls').onclick = () => $('controls-modal').classList.remove('hidden');
  $('btn-controls-close').onclick = () => $('controls-modal').classList.add('hidden');
  $('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-new').click(); });

  // ---------------- modal management ----------------
  const openMenu = (tab = 'status') => {
    ui.modal = 'menu';
    game.renderMenu(tab);
    $('menu').classList.remove('hidden');
    input.releaseLock();
  };
  const closeMenu = () => { $('menu').classList.add('hidden'); ui.modal = null; input.requestLock(); };
  const openMap = () => { ui.modal = 'map'; minimap.drawBig(game); $('bigmap').classList.remove('hidden'); input.releaseLock(); };
  const closeMap = () => { $('bigmap').classList.add('hidden'); ui.modal = null; input.requestLock(); };
  const pause = () => { paused = true; ui.modal = 'pause'; $('pause').classList.remove('hidden'); input.releaseLock(); audio.setRadio(false); audio.setEngine(false, 0, 0); };
  const resume = () => { paused = false; $('pause').classList.add('hidden'); ui.modal = null; input.requestLock(); };
  $('btn-resume').onclick = resume;
  $('btn-save').onclick = () => { game.save(); };
  $('btn-quit').onclick = () => { if (confirm('Quit to title? Unsaved progress will be lost.')) location.reload(); };
  $('bigmap').onclick = closeMap;
  ui.onModalClose = () => { if (game.running && !ui.modal) input.requestLock(); };
  ui.onModalOpen = () => input.releaseLock();

  canvas.addEventListener('click', () => {
    audio.init();
    if (game.running && !ui.modal && !paused) input.requestLock();
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    // losing lock with no modal open = player pressed Esc -> pause
    if (!locked && game.running && !ui.modal && !paused) pause();
  });

  if (new URLSearchParams(location.search).has('play')) startGame(Game.loadSave() || defaultState('Lee'), false);

  // ---------------- main loop ----------------
  const clock = new THREE.Clock();
  let mmT = 0;
  function frame() {
    requestAnimationFrame(frame);
    tick(Math.min(0.05, clock.getDelta()));
  }
  function tick(dt) {
    // hit-stop / slow-mo for big impacts
    if (game.slowmo > 0) {
      game.slowmo -= dt;
      dt *= 0.3;
    }
    input.enabled = game.running && !ui.modal && !paused && !game.cut;

    // global keys
    if (game.running) {
      if (input.rawHit('Escape')) {
        if (ui.modal === 'dialogue') {
          const last = ui._choices ? ui._choices.length - 1 : -1;
          if (last >= 0 && /leave|never|walk away|carry on|done/i.test(ui._choices[last].text)) ui.choose(last);
        } else if (ui.modal === 'shop') ui.closeShop();
        else if (ui.modal === 'menu') closeMenu();
        else if (ui.modal === 'map') closeMap();
        else if (ui.modal === 'pause') resume();
        else if (ui.modal === 'minigame') { /* the mini-game handles Esc itself */ }
        else pause();
      }
      if (input.rawHit('Tab')) {
        if (ui.modal === 'menu') closeMenu();
        else if (!ui.modal) openMenu();
      }
      if (input.rawHit('KeyM')) {
        if (ui.modal === 'map') closeMap();
        else if (!ui.modal) openMap();
      }
      if (ui.modal === 'dialogue') {
        for (let i = 1; i <= 9; i++) if (input.rawHit(`Digit${i}`) || input.rawHit(`Numpad${i}`)) ui.choose(i - 1);
        if (input.rawHit('Space') || input.rawHit('Enter')) {
          if (ui.typeI < ui.typeFull.length) ui.choose(0);
        }
      }
      if (ui.modal === 'shop' && input.rawHit('KeyE')) ui.closeShop();
    }

    if (!paused) {
      try {
        if (game.running) game.update(dt);
        else game.titleUpdate(dt);
      } catch (e) {
        if (!tick._errs) tick._errs = new Set();
        if (!tick._errs.has(e.message)) { tick._errs.add(e.message); console.error(e); }
      }
    }

    const focus = game.running ? game.player : { x: 30, z: 5 };
    const hour = game.state.minutes / 60;
    let night = sky.update(hour, paused ? 0 : dt, focus);
    const flash = game.updateWeather(paused ? 0 : dt);
    sky.applyStorm(game.weather.intensity, flash);
    night = sky.night;
    updateNightMaterials(night);
    for (const m of world.waterMats) {
      m.uniforms.uSky.value.copy(sky.fogColor);
      m.uniforms.uSunDir.value.copy(sky.uniforms.sunDir.value);
      m.uniforms.uNight.value = night;
    }
    if (!paused) shared.time.value += dt;
    world.updateDucks(shared.time.value);
    particles.update(paused ? 0 : dt);

    if (game.running) {
      ui.updateHUD(game, dt);
      ui.updateWorldUI(dt, game);
      mmT -= dt;
      if (mmT <= 0) { mmT = 1 / 30; minimap.draw(game, game.camRig.yaw); }
      $('click-to-play').classList.toggle('hidden', input.locked || !!ui.modal || paused);
    }
    post.render(dt, { drunk: game.fx.drunk, damage: game.fx.damage, blind: game.fx.blind, rhino: game.fx.rhino, fade: game.fx.fade, night });
    input.endFrame();
  }
  frame();

  window.__game = game; // handy for debugging in the console
  // Deterministic stepping for automated testing: __sim(seconds, ['KeyW'])
  window.__tick = tick;
  window.__sim = (seconds, keys = [], press = []) => {
    for (const k of keys) input.down.add(k);
    for (const k of press) input.pressed.add(k);
    const n = Math.round(seconds * 30);
    for (let i = 0; i < n; i++) {
      if (i > 0) for (const k of keys) input.down.add(k);
      tick(1 / 30);
    }
    for (const k of keys) input.down.delete(k);
  };
}

boot().catch((e) => {
  console.error(e);
  $('load-msg').textContent = `Something broke: ${e.message}`;
});
