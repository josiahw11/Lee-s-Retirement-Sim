// The Sunset Palms Senior Games (Sundays 9AM–6PM): three events built from the mini-games —
// Shuffleboard, Closest to the Pin and the Chug-Off — then a medal ceremony on a podium in front of
// the clubhouse, with medals around necks, an off-key anthem and fireworks.
import * as THREE from 'three';
import { mergeParts, mat4 } from '../gfx/batch.js';
import { M } from '../gfx/materials.js';
import { GEO } from '../world/world.js';
import { HOLES } from '../world/layout.js';
import { heightAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { pick, money } from '../core/utils.js';

const DESK = { x: 3.5, z: 13 };
const PODIUM = { x: 15, z: 21 };
const EVENTS = [
  { id: 'shuffle', name: 'Shuffleboard', icon: '🥌' },
  { id: 'golf', name: 'Closest to the Pin', icon: '⛳' },
  { id: 'chug', name: 'Chug-Off', icon: '🍺' },
];

export function gamesDay(g) {
  const h = g.state.minutes / 60;
  return g.state.dow === 6 && h >= 9 && h < 18;
}

export class SeniorGames {
  constructor(g) {
    this.g = g;
    this.commish = null;
    this.podium = null;
    this.medals = [];
  }

  get st() {
    const s = this.g.state;
    if (!s.games || s.games.day !== s.day) s.games = { day: s.day, results: {}, ceremony: false };
    return s.games;
  }

  update() {
    const g = this.g;
    const on = gamesDay(g);
    if (on && !this.commish) {
      this.commish = g.spawnNPC({ name: 'Commissioner Gladys Pemberton', female: true, role: 'commissioner', x: DESK.x, z: DESK.z, state: 'static', look: { hat: 'visor', hatColor: '#23408e', glasses: 'readers', shirt: 2 }, homePt: { x: DESK.x, z: DESK.z } });
      this.commish.data.face = 0;
      this.commish.data.quiet = true;
      if (!g.state.flags.gamesHint) {
        g.state.flags.gamesHint = true;
        g.ui.toast('🏅 Sunday: the SUNSET PALMS SENIOR GAMES are on! Sign up with Commissioner Gladys at the clubhouse. Three events. Glory. Mild injuries.', 'quest', 8);
      }
    } else if (!on && this.commish) {
      g.removeNPC(this.commish);
      this.commish = null;
      this.clearCeremony();
    }
  }

  record(id, won) {
    const st = this.st;
    st.results[id] = won ? 'gold' : 'loss';
    const g = this.g;
    if (won) { g.addMoney(150, `Senior Games gold: ${EVENTS.find((e) => e.id === id).name}`); g.xp('stat', 1); }
    const left = EVENTS.filter((e) => !st.results[e.id]).length;
    g.after(3.5, () => g.ui.toast(left ? `🏅 ${won ? 'GOLD!' : 'No medal.'} ${left} event${left > 1 ? 's' : ''} left. See Gladys.` : '🏅 All events done! Report to Gladys for the medal ceremony.', 'quest', 5));
  }

  // podium in front of the clubhouse; Lee takes his place based on golds
  ceremony() {
    const g = this.g;
    const st = this.st;
    st.ceremony = true;
    const golds = Object.values(st.results).filter((r) => r === 'gold').length;
    const place = golds >= 2 ? 1 : golds === 1 ? 2 : 3;
    this.clearCeremony();
    const y = heightAt(PODIUM.x, PODIUM.z);
    this.podium = new THREE.Mesh(mergeParts([
      [GEO.box, '#f4f4f4', mat4(0, 0.6, 0, 0, 1.4, 1.2, 1.2)],
      [GEO.box, '#e8e8e8', mat4(-1.45, 0.4, 0, 0, 1.4, 0.8, 1.2)],
      [GEO.box, '#e0e0e0', mat4(1.45, 0.25, 0, 0, 1.4, 0.5, 1.2)],
      [GEO.box, '#d4af37', mat4(0, 0.9, 0.61, 0, 0.4, 0.4, 0.02)],
      [GEO.box, '#c0c6cc', mat4(-1.45, 0.55, 0.61, 0, 0.35, 0.35, 0.02)],
      [GEO.box, '#b87333', mat4(1.45, 0.3, 0.61, 0, 0.35, 0.35, 0.02)],
    ]), M.vc);
    this.podium.position.set(PODIUM.x, y, PODIUM.z);
    this.podium.castShadow = true;
    g.scene.add(this.podium);
    const spots = { 1: [0, 1.2], 2: [-1.45, 0.8], 3: [1.45, 0.5] };
    const rivals = g.npcs.filter((n) => n.role === 'resident' && !n.cart && n.state !== 'ko').slice(0, 2);
    const standOn = (char, p, medal, who) => {
      const [dx, h] = spots[p];
      char.root.position.set(PODIUM.x + dx, y + h, PODIUM.z);
      char.root.rotation.y = 0;
      if (who) who.data ? (who.data.stand = { t: 7, y: y + h, ry: 0 }) : (who.stand = { t: 7, y: y + h, ry: 0 });
      const m = new THREE.Mesh(mergeParts([
        [GEO.torus, '#1f4fa8', mat4(0, 1.42, 0.06, 0, 0.14, 0.2, 0.5, Math.PI / 2 - 0.55)],
        [GEO.cyl16, medal, mat4(0, 1.28, 0.3, 0, 0.065, 0.015, 0.065, Math.PI / 2 - 0.25)], // clears even a proud belly
      ]), M.vc);
      char.root.add(m);
      this.medals.push({ char, m });
    };
    const col = { 1: '#d4af37', 2: '#c0c6cc', 3: '#b87333' };
    const p = g.player;
    p.x = PODIUM.x + spots[place][0]; p.z = PODIUM.z; p.heading = 0;
    standOn(p.char, place, col[place], p);
    [1, 2, 3].filter((x) => x !== place).forEach((pl, i) => { const n = rivals[i]; if (n) { n.x = PODIUM.x + spots[pl][0]; n.z = PODIUM.z; standOn(n.char, pl, col[pl], n); } });
    // anthem (off-key, naturally) + fireworks + a cinematic
    const notes = [392, 392, 440, 392, 523, 494, 392, 392, 440, 392, 587, 523];
    notes.forEach((f, i) => audio.tone({ freq: f * (1 + (Math.random() - 0.5) * 0.03), type: 'square', dur: 0.32, vol: 0.06, at: i * 0.36 }));
    g.celebrate(18, PODIUM.x, PODIUM.z - 4);
    const V = p.char.root.position.constructor;
    g.camRig.cinematic = { pos: new V(PODIUM.x + 1.5, y + 2.4, PODIUM.z + 7.5), look: new V(PODIUM.x, y + 1.6, PODIUM.z) };
    g.after(7, () => { g.camRig.cinematic = null; });
    const title = place === 1 ? 'GOLD MEDAL' : place === 2 ? 'SILVER MEDAL' : 'BRONZE (PARTICIPATION)';
    g.ui.splash(`🏅 ${title} 🏅`, place === 1 ? `${golds === 3 ? 'A clean sweep! ' : ''}The anthem plays. Someone cries. It's you.` : 'There is always next Sunday. And there are always excuses.', 5, place === 1 ? '#d4af37' : '#c0c6cc');
    if (place === 1) { g.addMoney(golds === 3 ? 750 : 400, 'Senior Games champion'); g.xp('stat', 3); g.achievement('champion'); }
    if (golds === 3) g.achievement('triplecrown');
    g.state.counters.gamesWon = (g.state.counters.gamesWon || 0) + (place === 1 ? 1 : 0);
  }

  clearCeremony() {
    if (this.podium) { this.g.scene.remove(this.podium); this.podium = null; }
    for (const { char, m } of this.medals) char.root.remove(m);
    this.medals = [];
  }

  clear() {
    this.clearCeremony();
    if (this.commish && this.g.npcs.includes(this.commish)) this.g.removeNPC(this.commish);
    this.commish = null;
  }
}

// Commissioner Gladys: sign up for events, then the ceremony
export function commishNode(g) {
  const sg = g.seniorGames;
  const st = sg.st;
  const done = EVENTS.filter((e) => st.results[e.id]);
  const row = (e) => `${e.icon} ${e.name}: ${st.results[e.id] === 'gold' ? '🥇 GOLD' : st.results[e.id] ? '— no medal' : 'not yet played'}`;
  const start = (e) => () => {
    const onWin = () => sg.record(e.id, true), onLose = () => sg.record(e.id, false);
    if (e.id === 'shuffle') g.startMinigame('shuffle', { bet: 0, skill: 0.72, onWin, onLose });
    else if (e.id === 'chug') g.startMinigame('chug', { opponent: 'Defending champ "Iron Liver" Irma', bet: 0, oppRate: [1.9, 2.5], onWin, onLose });
    else {
      const hole = HOLES.find((h) => h.n === 4) || HOLES[0];
      const opp = g.npcs.find((n) => n.role === 'golfer' && n.data.hole === hole) || g.npcs.find((n) => n.role === 'golfer' && n.data.hole);
      g.startMinigame('ctp', { hole: opp ? opp.data.hole : hole, opp, bet: 0, onDone: (r) => sg.record('golf', r === 'win' || r === 'ace') });
    }
    g.ui.closeDialogue();
    return 'keep';
  };
  const choices = EVENTS.filter((e) => !st.results[e.id]).map((e) => ({ text: `${e.icon} Compete: ${e.name}`, tag: 'gold = $150', action: start(e) }));
  if (done.length === 3 && !st.ceremony) choices.push({ text: '🏅 Take your place on the podium', action: () => { sg.ceremony(); return null; } });
  choices.push({ text: 'Leave', action: () => null });
  return {
    name: 'Commissioner Gladys Pemberton', title: '38th Annual Sunset Palms Senior Games',
    text: `${st.ceremony ? '"The ceremony\'s over, champ. Go ice something."' : done.length === 3 ? '"All three events! Get on that podium before your knees give out."' : pick(['"Three events. One champion. Zero drug testing. What\'s your event?"', '"Last year\'s champ broke a hip in the victory lap. He\'s still the champ. Legally."'])}\n\n${EVENTS.map(row).join('\n')}`,
    choices,
  };
}

export { money };
