// The player: walking, driving, drinking, peeing, brawling.
import { Character } from '../entities/character.js';
import { seatCharacter } from '../entities/cart.js';
import { heightAt, waterLevel } from '../world/terrain.js';
import { clamp, dampAngle, damp } from '../core/utils.js';

export const PLAYER_LOOK = {
  female: false, skin: '#f1c7a5', hair: '#f2f2f2', shirt: 0, shorts: '#c8b48a', hat: 'visor', hatColor: '#ffffff',
  glasses: 'aviator', mustache: true, combover: false, belly: 1.25, height: 1.0, sock: '#141414', shoe: '#6b4a2a', drinker: true,
};

export class Player {
  constructor(game, x, z, heading = 0) {
    this.game = game;
    this.char = new Character(PLAYER_LOOK);
    game.scene.add(this.char.root);
    this.x = x;
    this.z = z;
    this.y = heightAt(x, z);
    this.heading = heading;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.cart = null;
    this.hp = 90;
    this.stamina = 100;
    this.attackCd = 0;
    this.specialCd = 0;
    this.swing = null;
    this.ko = false;
    this.state = 'ok';
    this.drinkT = 0;
    this.peeing = false;
    this.blind = 0;
    this.inWater = false;
    this.airY = 0;
    this.grounded = true;
    this.speed = 0;
  }

  // Swap in a freshly built character with a new outfit, keeping pose/seat/weapon.
  setLook(overrides) {
    const old = this.char;
    const look = { ...PLAYER_LOOK, ...overrides };
    const ch = new Character(look);
    const parent = old.root.parent;
    ch.root.position.copy(old.root.position);
    ch.root.rotation.copy(old.root.rotation);
    ch.mode = old.mode;
    if (parent) parent.add(ch.root);
    if (old.heldType) ch.setHeld(old.heldType);
    old.dispose();
    this.char = ch;
  }

  enterCart(cart) {
    this.cart = cart;
    this.stand = null;
    cart.driver = this;
    seatCharacter(this.char, cart, 1);
  }

  exitCart() {
    const c = this.cart;
    if (!c) return;
    let p = c.exitPoint(1);
    // if blocked, try the other side
    const test = { x: p.x, z: p.z };
    if (this.game.world.col.resolve(test, 0.4, 0)) p = c.exitPoint(-1);
    this.game.scene.add(this.char.root);
    this.char.root.rotation.set(0, 0, 0);
    this.char.mode = 'idle';
    this.x = p.x;
    this.z = p.z;
    this.heading = c.heading;
    c.driver = null;
    this.cart = null;
  }

  update(dt, input, camRig) {
    const g = this.game;
    this.attackCd -= dt;
    this.specialCd -= dt;
    this.blind = Math.max(0, this.blind - dt);
    const drunk = g.buzz01();

    if (this.stand && !this.cart) { // posed on a podium for a moment
      this.stand.t -= dt;
      if (this.stand.t > 0) {
        this.char.mode = 'idle';
        this.char.root.position.set(this.x, this.stand.y, this.z);
        this.char.root.rotation.y = this.stand.ry;
        this.char.update(dt);
        return;
      }
      this.stand = null;
    }

    if (this.cart) {
      const c = this.cart;
      const throttle = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
      const steer = input.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
      const boost = input.key('ShiftLeft') || input.key('ShiftRight');
      const onRoad = g.onRoad(c.x, c.z);
      c.update(dt, {
        throttle: this.ko ? 0 : throttle,
        steer: this.ko ? 0 : steer,
        handbrake: input.key('Space'),
        boost: boost && !!c.upgrades.turbo,
        drunk,
        onRoad,
        wet: g.weather.intensity > 0.3,
      }, g.world.col);
      this.x = c.x;
      this.z = c.z;
      this.y = c.y;
      this.heading = c.heading;
      this.speed = c.speed;
      this.char.drunk = drunk;
      this.char.speed = 0;
      this.char.update(dt);
      return;
    }

    // ---- on foot ----
    let mx = 0, mz = 0;
    if (!this.ko && this.state !== 'frozen') {
      const f = camRig.forward();
      const fwd = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
      const side = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
      mx = f.x * fwd + -f.z * side;
      mz = f.z * fwd + f.x * side;
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
    }
    const moving = Math.hypot(mx, mz) > 0.05;
    const sprint = moving && (input.key('ShiftLeft') || input.key('ShiftRight')) && this.stamina > 2;
    let spd = sprint ? 5.2 : 2.9;
    if (g.state.buffs.rhino > 0) spd *= 1.3;
    spd *= 1 - drunk * 0.2;
    const wl = waterLevel(this.x, this.z);
    const ground = heightAt(this.x, this.z);
    const depth = wl !== null ? wl - ground : 0;
    this.inWater = depth > 0.3;
    if (this.inWater) spd *= 0.55;
    if (this.peeing || this.char.action?.type === 'drink') spd *= 0.3;
    if (sprint) this.stamina = Math.max(0, this.stamina - dt * 16);
    else this.stamina = Math.min(100, this.stamina + dt * 11);

    // drunken stagger
    if (drunk > 0.25) {
      const t = performance.now() / 1000;
      mx += Math.sin(t * 1.9) * drunk * 0.45 * (moving ? 1 : 0.3);
      mz += Math.cos(t * 1.4) * drunk * 0.45 * (moving ? 1 : 0.3);
    }
    const vmx = mx * spd, vmz = mz * spd;
    this.x += (vmx + this.vx) * dt;
    this.z += (vmz + this.vz) * dt;
    this.vx *= Math.exp(-5 * dt);
    this.vz *= Math.exp(-5 * dt);
    this.speed = moving ? spd : 0;
    if (moving && !this.swing) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), 10, dt);

    // collide with world and parked carts
    const p = { x: this.x, z: this.z };
    g.world.col.resolve(p, 0.36, this.y - ground);
    for (const c of g.carts) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d < 1.35 && d > 0.001) {
        p.x = c.x + (dx / d) * 1.35;
        p.z = c.z + (dz / d) * 1.35;
      }
    }
    this.x = p.x;
    this.z = p.z;
    const hg = heightAt(this.x, this.z);
    // tiny hop
    if (input.hit('Space') && this.grounded && !this.inWater && !this.ko) {
      this.vy = 3.6;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 14 * dt;
      this.airY += this.vy * dt;
      if (this.airY <= 0) { this.airY = 0; this.grounded = true; this.vy = 0; }
    }
    const wl2 = waterLevel(this.x, this.z);
    this.y = (wl2 !== null ? Math.max(hg, wl2 - 1.25) : hg) + this.airY;

    this.char.mode = this.ko ? 'ko' : this.inWater && wl2 - hg > 0.9 ? 'swim' : moving ? 'walk' : 'idle';
    this.char.speed = this.speed;
    this.char.drunk = drunk;
    this.char.root.position.set(this.x, this.y, this.z);
    this.char.root.rotation.y = this.heading;
    this.char.update(dt);
    this.moving = moving;
  }
}

export { clamp, damp };
