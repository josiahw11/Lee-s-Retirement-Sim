// NPC entity + behavior. Behaviors are simple state machines tuned for slapstick.
import { Character, randomLook, randomName } from '../entities/character.js';
import { seatCharacter } from '../entities/cart.js';
import { heightAt, waterLevel, POOL } from '../world/terrain.js';
import { clamp, damp, dampAngle, rand, pick, chance, wrapAngle } from '../core/utils.js';
import { audio } from '../core/audio.js';
import { routineZone, ROUTINE_ZONES } from './life.js';

let NEXT_ID = 1;

const HIT_BARKS_M = ['OW! My sciatica!', "That's my good hip!", 'You broke my dentures!', 'I fought in Korea for THIS?', "I'm calling my son-in-law! He's a lawyer!", 'My pacemaker!', 'I just had that knee done!'];
const HIT_BARKS_F = ['HELP! PERVERT!', 'Somebody call Karen!', 'My hair! I just had it set!', 'I have MACE in this purse!', "You're no gentleman!"];
const FIGHT_BARKS = ["Let's dance, sonny!", "I've got nothing to lose. I've got 3 years, tops!", "Come here, you sonuvagun!", "I'll put you in a home!", 'Put up your dukes!', 'Back in my day we fought FAIR!'];
const KO_BARKS = ['...mommy...', '*sees the Lord*', '...is it Tuesday?', '*snores*', '...five more minutes...'];
const IDLE_BARKS_M = ["These kids today with their pickleball...", "My bowels are like clockwork. 6:15 every day.", "Don't eat the Golden Coral shrimp.", "Karen fined me for my flamingo. It's a heron!", "I voted for Eisenhower. Twice.", "You seen my glasses? ...Oh, they're on my head.", "Back in '64 I could bench 300.", "They moved the early bird to 3. Communists.", "My grandson says I should get on 'the Instagram'."];
const IDLE_BARKS_F = ["Did you hear about Phyllis and the pool boy?", "I don't gossip. But Marge had WORK done.", "That Tammy... what a tramp. I love her.", "My hip's acting up. Rain's coming.", "Bingo is Wednesday. Bingo is ALWAYS Wednesday.", "My late husband would've HATED this. Anyway.", "Is that the new man? He's got a nice cart."];

export class NPC {
  constructor(game, o = {}) {
    this.game = game;
    this.id = NEXT_ID++;
    this.female = o.female ?? (o.look ? o.look.female : chance(0.5));
    this.look = { ...randomLook(this.female), ...(o.look || {}) };
    this.name = o.name || randomName(this.female);
    this.role = o.role || 'resident';
    this.char = new Character(this.look);
    game.scene.add(this.char.root);
    this.x = o.x ?? 0;
    this.z = o.z ?? 0;
    this.y = heightAt(this.x, this.z);
    this.heading = o.heading ?? rand(0, 6.28);
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.air = false;
    this.maxHp = o.hp || (this.female ? 30 : 45);
    this.hp = this.maxHp;
    this.dmg = o.dmg || 6;
    this.state = o.state || 'wander';
    this.baseState = this.state;
    this.zone = o.zone || null;
    this.homePt = o.homePt || null;
    this.target = null;
    this.wait = rand(0, 3);
    this.hostile = false;
    this.aggro = null;
    this.attackCd = rand(0.5, 1.5);
    this.windup = 0;
    this.walkSpeed = o.walkSpeed || rand(0.95, 1.35);
    this.runSpeed = o.runSpeed || rand(2.3, 2.9);
    this.icon = null;
    this.data = o.data || {};
    this.static = !!o.static;
    this.talkable = o.talkable !== false;
    this.blind = 0;
    this.stun = 0;
    this.koT = 0;
    this.stuckT = 0;
    this.lastPos = { x: this.x, z: this.z };
    this.barkT = rand(10, 40);
    this.cart = null;
    this.driver = null;
    this.visible = true;
    this.weapon = o.weapon || null;
    if (this.weapon) this.char.setHeld(this.weapon);
    this.fleeT = 0;
    this.followOffset = rand(-1, 1);
    this.recentlyHit = 0;
    this.sync();
  }

  get dead() { return false; } // nobody dies in Sunset Palms. Officially.

  say(text, dur = 3) {
    this.game.ui.bubble(this, text, dur);
  }

  seatIn(cart, driver) {
    this.cart = cart;
    this.driver = driver;
    cart.driver = this;
    seatCharacter(this.char, cart, 1);
    this.state = 'drive';
  }

  leaveCart() {
    if (!this.cart) return;
    const c = this.cart;
    const p = c.exitPoint(1);
    c.driver = null;
    this.game.scene.add(this.char.root);
    this.char.root.rotation.set(0, 0, 0);
    this.x = p.x; this.z = p.z;
    this.heading = c.heading;
    this.cart = null;
    this.driver = null;
    this.char.mode = 'idle';
    this.state = 'wander';
  }

  distTo(x, z) {
    return Math.hypot(this.x - x, this.z - z);
  }

  faceTo(x, z, dt, k = 8) {
    this.heading = dampAngle(this.heading, Math.atan2(x - this.x, z - this.z), k, dt);
  }

  // Take a hit from something at (fx,fz). Returns true if this knocked them out.
  takeHit(dmg, fx, fz, knock, attacker = null) {
    if (this.state === 'ko' && !this.air) {
      // hitting a downed geezer: extra shame, no extra damage
      if (attacker === this.game.player) this.game.crime(this.x, this.z, 0.2, "Kicking a man while he's down", 15);
      return false;
    }
    const dx = this.x - fx, dz = this.z - fz;
    const d = Math.hypot(dx, dz) || 1;
    this.vx += (dx / d) * knock;
    this.vz += (dz / d) * knock;
    this.hp -= dmg;
    // big swings launch people who are already hurting (landing = nap time). Bosses keep their feet.
    if (knock > 12 && !this.data.boss && this.hp < this.maxHp * 0.5) {
      this.vy = 4 + knock * 0.25;
      this.air = true;
    }
    this.recentlyHit = 1.5;
    this.char.play('flinch', 0.4);
    this.windup = 0;
    const g = this.game;
    g.particles.burst('star', this.x, this.y + 1.8, this.z, 4, { speed: 2, up: 2, life: 0.6, size: 0.35, gravity: 2 });
    audio.play(this.female ? 'ow' : 'oof', { pitch: rand(0.9, 1.2) });
    if (this.hp <= 0) {
      this.knockout(attacker);
      return true;
    }
    if (chance(0.5)) this.say(pick(this.female ? HIT_BARKS_F : HIT_BARKS_M), 2.2);
    if (attacker) this.provoke(attacker);
    return false;
  }

  provoke(attacker) {
    if (this.role === 'streaker') {
      this.state = 'flee';
      this.fleeFrom = attacker;
      this.fleeT = 999;
      return;
    }
    if (this.role === 'shopkeeper' || this.role === 'lady' || this.female) {
      if (this.role !== 'gang') {
        this.state = 'flee';
        this.fleeFrom = attacker;
        this.fleeT = 6;
      }
      return;
    }
    if (this.role === 'gang' && attacker === this.game.player) return;
    this.hostile = true;
    this.aggro = attacker;
    if (this.state !== 'drive') this.state = 'fight';
    if (chance(0.4)) this.say(pick(FIGHT_BARKS), 2);
  }

  // Go back to whatever this NPC normally does (follow, guard, golf, wander, stand at post).
  resumeBase() {
    this.hostile = false;
    this.aggro = null;
    this.target = null;
    const b = this.baseState || 'wander';
    if ((b === 'static' || b === 'golf') && this.homePt) this.state = 'returnHome';
    else this.state = b;
  }

  knockout(attacker) {
    this.hp = 0;
    this.state = 'ko';
    this.koT = rand(9, 14);
    this.char.mode = 'ko';
    this.windup = 0;
    this.hostile = this.hostile && this.role !== 'resident';
    this.say(pick(KO_BARKS), 3);
    const g = this.game;
    g.onKnockout(this, attacker);
  }

  sync() {
    this.char.root.position.set(this.x, this.y, this.z);
    this.char.root.rotation.y = this.heading;
  }

  // --------------- per-frame ---------------
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (this.data.aqua) {
      // water aerobics: chest-deep in the pool, facing the instructor; the class drives the poses
      this.char.mode = 'idle';
      this.char.speed = 0;
      this.y = POOL.y - 1.15;
      this.char.root.position.set(this.x, this.y, this.z);
      this.char.root.rotation.y = this.data.face || 0;
      if (this.visible) this.char.update(dt);
      return;
    }
    if (this.cart) {
      this.updateDriving(dt);
      this.char.speed = 0;
      if (this.visible) this.char.update(dt);
      return;
    }
    this.recentlyHit = Math.max(0, this.recentlyHit - dt);
    this.attackCd -= dt;
    this.blind = Math.max(0, this.blind - dt);
    this.stun = Math.max(0, this.stun - dt);

    let moveX = 0, moveZ = 0, spd = 0;
    const st = this.state;

    if (st === 'ko') {
      this.koT -= dt;
      if (this.char.koT > 0.5 && Math.random() < dt * 2) g.particles.emit('star', this.x + rand(-0.3, 0.3), this.y + 0.9, this.z + rand(-0.3, 0.3), { vy: 0.5, life: 0.8, size: 0.3, spin: 4 });
      if (this.koT <= 0 && !this.air) {
        this.hp = this.maxHp * 0.6;
        this.char.mode = 'idle';
        if (this.role === 'rival' || this.role === 'husband' || this.role === 'goon') {
          this.state = this.hostile ? 'fight' : 'flee';
          if (this.data.retreatAfterKO) {
            this.hostile = false;
            this.state = 'flee';
            this.fleeFrom = p;
            this.fleeT = 8;
          }
        } else if (this.role === 'security') {
          this.state = 'chaseFoot';
        } else if (this.role === 'gang') {
          this.resumeBase();
        } else {
          this.state = 'flee';
          this.fleeFrom = p;
          this.fleeT = 5;
          this.hostile = false;
        }
      }
    } else if (this.stun > 0 || this.blind > 0) {
      // stumble around
      if (this.blind > 0 && Math.random() < dt * 3) this.heading += rand(-1, 1);
      moveX = Math.sin(this.heading) * 0.4;
      moveZ = Math.cos(this.heading) * 0.4;
      spd = 0.5;
      if (Math.random() < dt) this.say(pick(['MY EYES!', 'I can\'t see! Worse than usual!', 'Sand! Why is it always sand?!']), 1.5);
    } else if (st === 'static') {
      if (this.distTo(p.x, p.z) < 7) this.faceTo(p.x, p.z, dt, 4);
      else if (this.data.face !== undefined) this.heading = dampAngle(this.heading, this.data.face, 3, dt);
    } else if (st === 'wander') {
      if (!this.target) {
        this.wait -= dt;
        if (this.wait <= 0) this.pickTarget();
      } else {
        const dx = this.target.x - this.x, dz = this.target.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.8) {
          this.target = null;
          this.wait = rand(3, 12);
          if (chance(0.25) && this.distTo(p.x, p.z) < 25) this.say(pick(this.female ? IDLE_BARKS_F : IDLE_BARKS_M), 3.5);
        } else {
          moveX = dx / d; moveZ = dz / d;
          const raining = g.weather.intensity > 0.5;
          spd = this.walkSpeed * (raining ? 1.6 : 1);
          if (raining && chance(dt * 0.05) && this.distTo(p.x, p.z) < 20) this.say(pick(this.female ? ['My PERM!', 'I just had my hair SET!', 'Somebody get me a rain bonnet!'] : ['My hip can feel this rain.', 'Florida. Every. Damn. Day.', 'Where did I park?!']), 2.5);
        }
      }
      // react to the player driving like a maniac close by
      if (p.cart && p.cart.speed > 8 && this.distTo(p.x, p.z) < 6 && chance(dt * 2)) {
        this.say(pick(['SLOW DOWN, HOTSHOT!', 'IT SAYS TWELVE MILES AN HOUR!', "I'm telling Karen!", 'Watch it, you maniac!']), 2);
        this.char.play('shake', 1);
      }
    } else if (st === 'flee') {
      this.fleeT -= dt;
      const f = this.fleeFrom || p;
      const dx = this.x - f.x, dz = this.z - f.z;
      const d = Math.hypot(dx, dz) || 1;
      moveX = dx / d; moveZ = dz / d;
      spd = this.runSpeed * 0.85;
      if (this.fleeT <= 0 || d > 30) this.resumeBase();
    } else if (st === 'returnHome') {
      const h = this.homePt;
      if (!h) this.state = 'wander';
      else {
        const dx = h.x - this.x, dz = h.z - this.z, d = Math.hypot(dx, dz);
        if (d < 0.7) {
          this.state = this.baseState;
        } else {
          moveX = dx / d; moveZ = dz / d; spd = this.walkSpeed * 1.3;
        }
      }
    } else if (st === 'fight' || st === 'chaseFoot') {
      let t = this.aggro || p;
      if (st === 'chaseFoot') t = p;
      if (t.state === 'ko' || (t === p && p.ko)) {
        // won the fight
        this.resumeBase();
        if (this.role !== 'gang') this.char.play('cheer', 1.5);
      } else {
        const tx = t.x, tz = t.z;
        const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
        this.faceTo(tx, tz, dt, 10);
        if (this.windup > 0) {
          this.windup -= dt;
          if (this.windup <= 0) {
            // strike!
            const nd = Math.hypot(tx - this.x, tz - this.z);
            if (nd < (this.weapon ? 2.1 : 1.6)) g.npcHits(this, t);
            this.attackCd = this.data.boss ? rand(0.45, 0.75) : rand(0.7, 1.2);
          }
        } else if (d > (this.weapon ? 1.8 : 1.3)) {
          moveX = dx / d; moveZ = dz / d;
          spd = st === 'chaseFoot' ? 3.0 : this.runSpeed;
          if (t === p && p.cart) spd = this.runSpeed;
        } else if (this.attackCd <= 0 && !(t === p && p.cart)) {
          this.windup = 0.45;
          this.char.play(this.weapon ? 'swing' : 'punch', this.weapon ? 0.7 : 0.45);
          if (chance(0.25)) this.say(pick(FIGHT_BARKS), 1.5);
        }
        // give up if too far
        if (d > 45 && st === 'fight' && this.role !== 'gang') this.resumeBase();
      }
    } else if (st === 'follow') {
      const enemy = g.nearestHostile(this.x, this.z, 16, this);
      if (enemy) {
        this.aggro = enemy;
        this.state = 'fight';
      } else {
        // trail behind player
        const back = p.cart ? 5 : 2.8;
        const hx = p.x - Math.sin(p.heading) * back + Math.cos(p.heading) * this.followOffset * 2;
        const hz = p.z - Math.cos(p.heading) * back - Math.sin(p.heading) * this.followOffset * 2;
        const dx = hx - this.x, dz = hz - this.z, d = Math.hypot(dx, dz);
        if (d > 60) {
          // catch up off-screen (they "took a shortcut")
          this.x = hx + rand(-3, 3);
          this.z = hz + rand(-3, 3);
        } else if (d > 1.2) {
          moveX = dx / d; moveZ = dz / d;
          spd = clamp(d * 0.8, this.walkSpeed, p.cart ? 7 : 4.5);
        }
      }
    } else if (st === 'guard') {
      const post = this.data.post;
      const enemy = g.nearestHostile(this.x, this.z, 18, this);
      if (enemy) { this.aggro = enemy; this.state = 'fight'; }
      else if (post) {
        const dx = post.x - this.x, dz = post.z - this.z, d = Math.hypot(dx, dz);
        if (d > 2) { moveX = dx / d; moveZ = dz / d; spd = this.walkSpeed * 1.4; }
      }
    } else if (st === 'golf') {
      this.data.swingT = (this.data.swingT ?? rand(4, 15)) - dt;
      this.heading = dampAngle(this.heading, this.data.face ?? 0, 3, dt);
      if (this.data.shotT > 0) {
        this.data.shotT -= dt;
        if (this.data.shotT <= 0) g.golferShot(this);
      }
      if (this.data.swingT <= 0) {
        this.data.swingT = rand(14, 26);
        this.char.play('swing', 0.9);
        this.data.shotT = 0.45;
      }
    } else if (st === 'lounge' || st === 'fish') {
      // sunbathing / fishing: stay put
      if (this.data.face !== undefined) this.heading = dampAngle(this.heading, this.data.face, 3, dt);
    } else if (st === 'chat') {
      const o = this.data.chatWith;
      if (o) this.faceTo(o.x, o.z, dt, 5);
    } else if (st === 'party') {
      // just vibing; dancing is triggered by the party
      if (this.distTo(p.x, p.z) < 6) this.faceTo(p.x, p.z, dt, 2);
    } else if (st === 'idle') {
      this.wait -= dt;
      if (this.wait <= 0) this.resumeBase();
    } else if (st === 'walkTo') {
      const t = this.target;
      if (t) {
        const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
        if (d < 1) {
          this.state = this.data.after || this.baseState || 'wander';
          if (this.data.onArrive) this.data.onArrive(this);
        } else { moveX = dx / d; moveZ = dz / d; spd = this.data.walkSpeed || this.walkSpeed * 1.4; }
      }
    }

    // integrate
    if (spd > 0 && this.state !== 'ko') {
      this.x += moveX * spd * dt;
      this.z += moveZ * spd * dt;
      if (this.state !== 'fight' && this.state !== 'chaseFoot') this.heading = dampAngle(this.heading, Math.atan2(moveX, moveZ), 6, dt);
    }
    // knockback / airborne
    if (Math.abs(this.vx) + Math.abs(this.vz) > 0.01 || this.air) {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const fr = this.air ? 0.3 : 5;
      this.vx *= Math.exp(-fr * dt);
      this.vz *= Math.exp(-fr * dt);
    }
    // collisions
    const pt = { x: this.x, z: this.z };
    const hit = g.world.col.resolve(pt, 0.35, this.y - heightAt(this.x, this.z));
    this.x = pt.x; this.z = pt.z;
    if (hit && this.air) {
      this.vx *= -0.3; this.vz *= -0.3;
    }
    // stuck detection while wandering
    if (this.state === 'wander' && this.target) {
      this.stuckT += dt;
      if (this.stuckT > 2.5) {
        if (Math.hypot(this.x - this.lastPos.x, this.z - this.lastPos.z) < 1) { this.target = null; this.wait = 1; }
        this.stuckT = 0;
        this.lastPos = { x: this.x, z: this.z };
      }
    }

    const ground = heightAt(this.x, this.z);
    if (this.air) {
      this.vy -= 20 * dt;
      this.y += this.vy * dt;
      this.char.spinning = true;
      this.char.rig.rotation.x -= dt * 9;
      if (this.y <= ground) {
        this.y = ground;
        this.air = false;
        this.char.spinning = false;
        this.char.rig.rotation.x = wrapAngle(this.char.rig.rotation.x);
        this.vy = 0;
        audio.play('thud');
        g.particles.burst('dust', this.x, this.y + 0.2, this.z, 6, { speed: 2, up: 1, gravity: 1, life: 0.8, size: 0.8, grow: 1 });
        if (this.state !== 'ko') this.knockout(g.player);
      }
    } else {
      const wl = waterLevel(this.x, this.z);
      this.y = wl !== null ? Math.max(ground, wl - 1.25) : ground;
      this.char.mode = this.state === 'ko' ? 'ko' : this.state === 'lounge' ? 'lounge' : wl !== null && wl - ground > 0.9 ? 'swim' : spd > 0.1 ? 'walk' : 'idle';
      if (wl !== null && this.state === 'ko' && !this.data.splashed) {
        this.data.splashed = true;
        g.onSplashdown(this);
      }
      if (wl === null) this.data.splashed = false;
    }
    this.char.speed = spd;

    // ambient barks near player
    this.barkT -= dt;
    if (this.barkT <= 0) {
      this.barkT = rand(25, 60);
      if (this.state === 'wander' && this.distTo(p.x, p.z) < 14 && chance(0.4) && !this.data.quiet) this.say(pick(this.female ? IDLE_BARKS_F : IDLE_BARKS_M), 3.5);
    }

    // heads turn toward the player (or whoever they're chatting with)
    const lookable = this.state === 'wander' || this.state === 'static' || this.state === 'idle' || this.state === 'party' || this.state === 'golf' || this.state === 'lounge';
    if (this.state === 'chat' && this.data.chatWith) this.char.lookAt = this.data.chatWith;
    else this.char.lookAt = lookable && this.distTo(p.x, p.z) < 9 ? p : null;

    this.sync();
    if (this.visible) this.char.update(dt);
  }

  pickTarget() {
    const w = this.game.world;
    // daily routines: evenings at the pool/tiki bar, late nights at home
    if (this.role === 'resident') {
      const rz = routineZone(this.game, this);
      if (rz === 'home') {
        this.target = { x: this.homePt.x + rand(-3, 3), z: this.homePt.z + rand(-3, 3) };
        this.stuckT = 0;
        this.lastPos = { x: this.x, z: this.z };
        return;
      }
      if (rz && Math.hypot(this.x - 40, this.z) < 180) {
        this.target = w.randomZonePoint(ROUTINE_ZONES[rz]);
        this.stuckT = 0;
        this.lastPos = { x: this.x, z: this.z };
        return;
      }
    }
    if (this.homePt && chance(0.5)) {
      this.target = { x: this.homePt.x + rand(-6, 6), z: this.homePt.z + rand(-6, 6) };
    } else if (this.zone) {
      this.target = w.randomZonePoint(this.zone);
    } else {
      this.target = w.randomZonePoint();
    }
    this.stuckT = 0;
    this.lastPos = { x: this.x, z: this.z };
  }

  updateDriving(dt) {
    const g = this.game;
    const c = this.cart;
    const d = this.driver;
    let chase = this.data.chase || null;
    if (this.role === 'security' && g.heat.level > 0 && !g.player.ko) {
      c.sirenOn = true;
      const p = g.player;
      const dist = Math.hypot(p.x - c.x, p.z - c.z);
      d.speed = g.state.hoa.decrees.includes('budget') ? 5 : 12.5 + g.heat.level * 0.4;
      if (dist < 40 || !g.world.col.blocked(c.x, c.z, p.x, p.z)) {
        const lead = p.cart ? 0.6 : 0.2;
        chase = { x: p.x + (p.cart ? p.cart.vx : 0) * lead, z: p.z + (p.cart ? p.cart.vz : 0) * lead };
      } else {
        d.repathT -= dt;
        if (d.repathT <= 0) {
          d.routeTo(p.x, p.z);
          d.repathT = 2;
        }
      }
      // bail out and chase on foot if player is on foot nearby
      if (!p.cart && dist < 12 && c.speed < 3) {
        this.leaveCart();
        this.state = 'chaseFoot';
        this.say(pick(['STOP RIGHT THERE, SIR!', "You're in violation of section 4, paragraph 9!", 'Freeze! HOA Security!']), 2);
        this.parkedCart = c;
        return;
      }
    } else if (this.role === 'security') {
      c.sirenOn = false;
      d.speed = 6.5;
    }
    const obstacles = g.carts.filter((o) => o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 10);
    if (Math.hypot(g.player.x - c.x, g.player.z - c.z) < 10) obstacles.push(g.player.cart || g.player);
    for (const n of g.npcs) if (!n.cart && n.state !== 'ko' && Math.abs(n.x - c.x) < 8 && Math.abs(n.z - c.z) < 8) obstacles.push(n);
    const inp = d.control(dt, obstacles, chase);
    if (d.honkNow && !chase) {
      if (Math.hypot(g.player.x - c.x, g.player.z - c.z) < 40) audio.play(c.kind === 'scooter' ? 'meep' : 'horn', { vol: 0.5 });
      if (chance(0.5)) this.say(pick(['MOVE IT, GRANDPA!', 'Some of us have DIALYSIS at 3!', 'Get outta the road!']), 2);
    }
    c.update(dt, inp, g.world.col);
    this.x = c.x; this.z = c.z; this.y = c.y; this.heading = c.heading;
  }
}

export { wrapAngle, damp };
