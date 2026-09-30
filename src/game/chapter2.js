// Chapter 2: "Rhino Rising" — the tea supply dries up, you brew your own, and Chip's father comes to town.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { PONDS } from '../world/layout.js';
import { heightAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { pick, rand } from '../core/utils.js';

const poi = (id) => (g) => g.world.pois[id];
const F = (g) => g.state.quest.flags;

export const CH2 = [
  {
    id: 'c2_doc', title: "CHAPTER 2 — Doc's in trouble. Get to the van.",
    target: poi('doc'),
    start: (g) => {
      F(g).teaShortage = true;
      g.ui.splash('CHAPTER 2', 'RHINO RISING', 4, '#ff6fa8');
      setTimeout(() => g.ui.toast('📱 Text from Doc: "Supplier got raided in Hialeah. Tea prices just doubled. Come to the van. Come ALONE. Or with beer."', 'quest', 8), 2500);
    },
    done: (g) => F(g).c2Doc,
  },
  {
    id: 'c2_bags', title: 'Buy a box of tea bags at the Liquor Barrel',
    target: poi('liquor'),
    done: (g) => g.state.inv.teabags > 0,
  },
  {
    id: 'c2_antler', title: 'Steal antler shavings from the Grill Room moose (Clubhouse, 9PM–5AM)',
    hint: 'Only at night. Witnesses = heat.',
    target: poi('clubhouse'),
    done: (g) => g.state.inv.antler > 0,
  },
  {
    id: 'c2_tooth', title: "Pry a tooth off Mr. Chompers' sunning rock (Gator Pond)",
    hint: 'He will not be happy about it.',
    target: (g) => g.tooth,
    start: (g) => spawnTooth(g),
    done: (g) => g.state.inv.tooth > 0,
  },
  {
    id: 'c2_brew', title: 'Brew your first batch of Rhino Tea at home',
    target: poi('home'),
    done: (g) => F(g).homebrew,
    reward: (g) => g.ui.toast('🍵 Recipe unlocked! Brew 5 Rhino Tea at home anytime for $60 in materials.', 'quest', 7),
  },
  {
    id: 'c2_test', title: 'Test the batch on Walker Wallace (he volunteered. Sort of.)',
    target: (g) => g.named.walker,
    done: (g) => F(g).testBatch,
  },
  {
    id: 'c2_deuce', title: 'Chip Wainwright II has come to town. Face "The Deuce" at the clubhouse.',
    target: (g) => g.named.deuce,
    start: (g) => spawnDeuce(g),
    done: (g) => F(g).beatDeuce,
    reward: (g) => {
      g.addMoney(1000, "The Deuce's money clip");
      g.xp('intim', 5);
      g.xp('stat', 6);
      g.ui.splash('CHAPTER 2 COMPLETE', 'The Wainwright dynasty has fallen. The tea flows freely. Sunset Palms bows to you.', 6, '#7CFC9A');
      audio.play('levelup');
    },
  },
];

// ---------------------------------------------------------------- the gator tooth
export function spawnTooth(g) {
  if (g.tooth || g.state.inv.tooth > 0) return;
  const p = PONDS.find((x) => x.name === 'Gator Pond');
  const x = p.x - p.r * 0.95, z = p.z + 4;
  const y = heightAt(x, z);
  const m = new THREE.Mesh(mergeParts([
    [GEO.ico, '#8a8a80', mat4(0, 0.35, 0, 0, 1.2, 0.5, 0.9)],
    [GEO.cone, '#fffbe6', mat4(0.1, 0.95, 0, 0, 0.09, 0.35, 0.09)],
  ]), M.vc);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.scene.add(m);
  g.tooth = { x, z, y, mesh: m };
}

export function updateTooth(g, dt) {
  const t = g.tooth;
  if (!t) return;
  if (Math.random() < dt * 3) g.particles.emit('spark', t.x + rand(-0.2, 0.2), t.y + 1.1, t.z, { vy: 0.6, life: 0.6, size: 0.35 });
  const p = g.player;
  if (!p.cart && Math.hypot(p.x - t.x, p.z - t.z) < 1.6) {
    g.state.inv.tooth = 1;
    g.scene.remove(t.mesh);
    g.tooth = null;
    audio.play('pickup');
    g.ui.splash('GOT THE TOOTH', 'Mr. Chompers noticed. RUN.', 2.2, '#ff6b6b');
    const gt = g.world.gator;
    if (gt) {
      gt.rampage = 10;
      gt.biteCd = 0.3;
    }
  }
}

// ---------------------------------------------------------------- The Deuce
export function spawnDeuce(g) {
  if (g.named.deuce) return;
  const cx = 15, cz = 24;
  const limo = g.addCart({ x: cx - 8, z: cz + 2, ry: Math.PI / 2, kind: 'rival', color: '#111111', upgrades: { rims: true, neon: true, neonColor: 0xffd23f, leather: true } });
  limo.group.scale.set(1.15, 1, 1.9); // stretch golf limo
  limo.parkedLimo = true;
  const deuce = g.spawnNPC({ name: 'Chip Wainwright II "The Deuce"', female: false, role: 'rival', x: cx, z: cz, state: 'static', hp: 360, dmg: 19, weapon: 'titanium', look: { shirt: 6, shorts: '#f2f2f2', hat: 'fedora', hatColor: '#f4f0e0', glasses: 'aviator', sweater: '#23408e', mustache: true, hair: '#f2f2f2', belly: 1.3, height: 1.08, skin: '#f5d3b8' }, homePt: { x: cx, z: cz } });
  deuce.data.face = Math.PI;
  deuce.data.quiet = true;
  deuce.data.boss = true;
  g.named.deuce = deuce;
  g.deuceCrew = ['Caddie Winthrop', 'Caddie Pembrook', 'Caddie Ashford'].map((nm, i) => {
    const n = g.spawnNPC({ name: nm, female: false, role: 'goon', x: cx - 3 + i * 3, z: cz - 2.5, state: 'static', hp: 85, dmg: 11, weapon: 'iron', look: { shirt: 6, shorts: '#f2f2f2', hat: 'cap', hatColor: '#ffffff', glasses: 'none', sweater: '#23408e' }, homePt: { x: cx - 3 + i * 3, z: cz - 2.5 } });
    n.data.face = Math.PI;
    n.data.quiet = true;
    return n;
  });
  g.ui.toast('🚨 A stretch golf limo just pulled up at the clubhouse. Chip\'s father is here.', 'heat', 6);
}

export function deuceConfront(g) {
  F(g).deuceIntro = true;
  const deuce = g.named.deuce;
  return {
    name: 'Chip Wainwright II', title: '"The Deuce" • Patriarch',
    text: `"So you're the ${g.state.name} my idiot son keeps crying about. I built this HOA. I bought the pond Mr. Chompers lives in. I own the company that makes Karen's clipboards.\n\nYou humiliated my boy, stole my carts, and now you're BREWING? In MY community?"\n\n*He removes his fedora. Slowly. Menacingly. He has more hair than you.*\n\n"Gentlemen. Remove this... tourist."`,
    choices: [
      { text: '"Your son cried the whole time, too."', action: () => { startDeuceFight(g, deuce); return null; } },
      { text: '*Take a long, slow sip of Rhino Tea first*', disabled: g.state.inv.tea <= 0, action: () => { g.state.inv.tea--; g.state.buffs.rhino = 90; audio.play('levelup'); startDeuceFight(g, deuce); return null; } },
    ],
  };
}

function startDeuceFight(g, deuce) {
  g.startBrawl([deuce, ...g.deuceCrew], 'BOSS FIGHT', '"The Deuce" & his caddies', () => {
    F(g).beatDeuce = true;
    deuce.data.retreatAfterKO = true;
    for (const c of g.deuceCrew) c.data.retreatAfterKO = true;
    setTimeout(() => deuce.say(pick(['My lawyers will hear about this!', 'I... I need my nurse.', "This isn't over! ...Is it over? It's over."]), 3), 1200);
  });
}

// ---------------------------------------------------------------- Walker's test drive
export function testBatchOn(g, walker) {
  F(g).testBatch = true;
  g.state.inv.tea = Math.max(0, g.state.inv.tea - 1);
  walker.data.zoomT = 35;
  walker.walkSpeed = 7;
  walker.runSpeed = 9;
  if (walker.role !== 'gang') {
    walker.state = 'wander';
    walker.target = null;
    walker.wait = 0;
    walker.zone = { x0: -10, x1: 45, z0: 8, z1: 30 };
  }
  walker.say('WHOA. WHOA. I CAN FEEL MY TOES!', 3);
  audio.play('levelup');
  g.ui.toast('🦏 It works. It REALLY works. Walker is doing laps around the clubhouse.', 'quest', 6);
}
