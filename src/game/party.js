// Lawn party at the player's house: guests arrive, dance, buy product; Karen crashes it.
import * as THREE from 'three';
import { PLAYER_HOUSE } from '../world/layout.js';
import { heightAt } from '../world/terrain.js';
import { audio } from '../core/audio.js';
import { rand, pick, chance, money } from '../core/utils.js';

const LIGHT_COLORS = [0xff4fa3, 0xffd23f, 0x4cc9f0, 0x7CFC9A, 0xff6b1a];

export class Party {
  constructor(game) {
    this.g = game;
    this.minutes = 0; // game minutes elapsed
    this.duration = 150;
    this.center = PLAYER_HOUSE.lawn;
    this.guests = [];
    this.statGain = 0;
    this.votes = 0;
    this.karenPhase = 0;
    this.over = false;
    // string lights + a keg
    this.group = new THREE.Group();
    const c = this.center;
    const mats = LIGHT_COLORS.map((col) => new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.5 }));
    const bulb = new THREE.SphereGeometry(0.12, 8, 6);
    const posts = [[-7, -5], [7, -5], [7, 6], [-7, 6]];
    for (const [x, z] of posts) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x5a4a3a }));
      p.position.set(c.x + x, heightAt(c.x + x, c.z + z) + 1.6, c.z + z);
      this.group.add(p);
    }
    for (let i = 0; i < 4; i++) {
      const [ax, az] = posts[i], [bx, bz] = posts[(i + 1) % 4];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const m = new THREE.Mesh(bulb, mats[(i * 11 + k) % mats.length]);
        m.position.set(c.x + ax + (bx - ax) * t, 3.1 - Math.sin(t * Math.PI) * 0.6, c.z + az + (bz - az) * t);
        this.group.add(m);
      }
    }
    const keg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xc0c6cc, metalness: 0.8, roughness: 0.3 }));
    keg.position.set(c.x, heightAt(c.x, c.z) + 0.45, c.z);
    this.group.add(keg);
    this.light = game.partyLight;
    this.light.position.set(c.x, 4, c.z);
    game.scene.add(this.group);
    this.mats = mats;

    // invite guests: residents + unattached ladies
    const pool = game.npcs.filter((n) => (n.role === 'resident' || (n.role === 'lady' && !n.cart && !n.data.lady.husband)) && n.state !== 'ko' && !n.hostile);
    pool.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
    for (const n of pool.slice(0, 16)) {
      // far-away guests get dropped off by the community shuttle at the end of the street
      if (Math.hypot(n.x - c.x, n.z - c.z) > 45) {
        const a = rand(0, Math.PI * 2);
        const pt = { x: c.x + Math.cos(a) * rand(18, 30), z: c.z + Math.sin(a) * rand(18, 30) };
        game.world.col.resolve(pt, 0.6);
        n.x = pt.x;
        n.z = pt.z;
      }
      n.state = 'walkTo';
      n.target = { x: c.x + rand(-6, 6), z: c.z + rand(-4, 5) };
      n.data.walkSpeed = n.walkSpeed * 1.6;
      n.data.after = 'party';
      if (n.role === 'resident' && !n.female && chance(0.6)) n.data.wants = 'pills';
      if (chance(0.3)) n.say(pick(['Did somebody say FREE BEER?', "I haven't been to a party since the Nixon administration!", 'Is there a buffet?', "I'll bring my own dentures!"]), 2.5);
      this.guests.push(n);
    }
    game.ui.splash('🎉 PARTY TIME 🎉', `${this.guests.length} neighbors are shuffling over. Mingle, sell, flirt.`, 3, '#ff6fa8');
    audio.play('success');
  }

  get active() {
    return !this.over;
  }

  update(dt, gameMinutes) {
    if (this.over) return;
    const g = this.g;
    const p = g.player;
    this.minutes += gameMinutes;
    const t = performance.now() / 1000;
    for (let i = 0; i < this.mats.length; i++) this.mats[i].emissiveIntensity = 1.5 + Math.sin(t * 4 + i * 1.3) * 1.2;
    this.light.intensity = 25 + Math.sin(t * 3) * 10;
    this.light.color.setHSL((t * 0.1) % 1, 0.8, 0.6);
    const near = Math.hypot(p.x - this.center.x, p.z - this.center.z) < 28;
    if (near) {
      this.statGain += gameMinutes * 0.05;
      if (this.statGain >= 1) {
        g.xp('stat', 1);
        this.statGain -= 1;
      }
    }
    // guests dance; some wander toward the player
    for (const n of this.guests) {
      if (n.state !== 'party') continue;
      if (!n.char.action && chance(dt * 1.5)) n.char.play(pick(['dance', 'dance', 'cheer', 'wave']), rand(1.5, 3));
      if (chance(dt * 0.02) && Math.hypot(n.x - p.x, n.z - p.z) < 25) n.say(pick(['WOOO!', 'This is better than bingo!', 'Play some Sinatra!', 'I think I broke a hip. Worth it!', `${g.state.name}, you animal!`, 'Is this the Macarena?']), 2.2);
      if (near && g.state.hoa.registered && !g.state.hoa.campaigned[n.id] && chance(dt * 0.03)) {
        g.state.hoa.campaigned[n.id] = true;
        g.state.hoa.votes += 1;
        this.votes++;
      }
    }
    // Karen crashes the party an hour in
    const karen = g.named.karen;
    if (this.karenPhase === 0 && this.minutes > 60 && karen && karen.state !== 'ko' && !karen.hostile) {
      this.karenPhase = 1;
      if (g.state.hoa.decrees.includes('noise') || g.state.hoa.puppet) {
        g.ui.toast('📋 Karen drove by, saw your Noise Exemption, and wept in her car.', 'quest', 5);
        this.karenPhase = 3;
      } else {
        // she "pulls up in her Buick" at the end of the street and marches over
        if (Math.hypot(karen.x - this.center.x, karen.z - this.center.z) > 40) {
          const pt = { x: this.center.x - 16, z: this.center.z + 22 };
          g.world.col.resolve(pt, 0.6);
          karen.x = pt.x;
          karen.z = pt.z;
        }
        karen.state = 'walkTo';
        karen.target = { x: this.center.x + 3, z: this.center.z + 7 };
        karen.data.walkSpeed = 3;
        karen.data.after = 'static';
        karen.say('WHAT is going on here?!', 2.5);
      }
    }
    if (this.karenPhase === 1 && karen && karen.state === 'static') {
      this.karenPhase = 2;
      karen.say(pick(['This is a NOISE VIOLATION!', 'Section 7: NO FUN AFTER 8PM!', "I'm writing ALL of you up!"]), 3);
      karen.char.play('point', 2);
      g.addHeat(1.2, 'Unauthorized fun (party)');
      g.ui.hint('Karen is shutting it down. Pass the Noise Exemption decree to party in peace.', 5);
      this.duration = Math.min(this.duration, this.minutes + 20);
    }
    if (this.minutes >= this.duration) this.end();
  }

  end() {
    if (this.over) return;
    this.over = true;
    const g = this.g;
    for (const n of this.guests) {
      if (!g.npcs.includes(n)) continue;
      if ((n.state === 'party' || n.state === 'walkTo') && !n.hostile) n.resumeBase();
      n.data.walkSpeed = undefined;
    }
    const karen = g.named.karen;
    if (karen && this.karenPhase >= 1) {
      karen.data.walkSpeed = undefined;
      karen.data.after = undefined;
      if (karen.state !== 'ko' && !karen.hostile) karen.resumeBase();
    }
    this.light.intensity = 0;
    g.scene.remove(this.group);
    g.state.counters.parties = (g.state.counters.parties || 0) + 1;
    g.achievement('party');
    g.ui.toast(`🎉 Party's over. ${this.guests.length} guests, ${this.votes} new votes${this.karenPhase === 2 ? ', 1 very angry Karen' : ''}.`, 'quest', 6);
  }
}

export { money };
