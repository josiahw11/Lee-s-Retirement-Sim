// On-screen controls for phones & tablets. They switch on at the first touch, and never appear on desktop.
// Left half of the screen: floating joystick (walk / gas-brake-steer).
// Right half: drag to look around. Thumb buttons press the same virtual keys the keyboard does.

const ACTIONS = [
  // key, label, css class, hold (true = held while touched, false = tap)
  ['KeyE', 'USE', 'use', false],
  ['KeyF', '👊', 'swing', false],
  ['Space', '⤴', 'hop', true],
  ['KeyB', '🍺', 'beer', false],
  ['ShiftLeft', '💨', 'sprint', true],
];
const SMALL = [
  ['KeyH', '📯'], ['KeyR', '📻'], ['KeyQ', '🏌️'], ['KeyG', '🏖️'], ['KeyP', '💦'],
];
const TOP = [['Escape', '⏸'], ['Tab', '📱'], ['KeyM', '🗺️']];

const STICK_R = 58;

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.on = false;
    this.stick = null; // { id, x0, y0 }
    this.look = null; // { id, x, y }
    this.held = new Map(); // touch id -> key
    window.addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  enable() {
    if (this.on) return;
    this.on = true;
    this.input.touchOn = true;
    document.body.classList.add('touch');
    const root = document.createElement('div');
    root.id = 'touch';
    const btn = (k, l, cls, hold) => `<button class="tb ${cls}" data-k="${k}" data-hold="${hold ? 1 : 0}">${l}</button>`;
    root.innerHTML = `
      <div id="t-pad"></div>
      <div id="t-stick" class="hidden"><div id="t-knob"></div></div>
      <div id="t-actions">${ACTIONS.map(([k, l, c, h]) => btn(k, l, c, h)).join('')}</div>
      <div id="t-small">${SMALL.map(([k, l]) => btn(k, l, 'small', k === 'KeyP')).join('')}</div>
      <div id="t-top">${TOP.map(([k, l]) => btn(k, l, 'top', false)).join('')}</div>`;
    document.body.appendChild(root);
    this.root = root;
    this.stickEl = root.querySelector('#t-stick');
    this.knobEl = root.querySelector('#t-knob');

    const pad = root.querySelector('#t-pad');
    pad.addEventListener('touchstart', (e) => this.padStart(e), { passive: false });
    pad.addEventListener('touchmove', (e) => this.padMove(e), { passive: false });
    pad.addEventListener('touchend', (e) => this.padEnd(e), { passive: false });
    pad.addEventListener('touchcancel', (e) => this.padEnd(e), { passive: false });

    for (const b of root.querySelectorAll('.tb')) {
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const k = b.dataset.k;
        this.input.pressed.add(k);
        if (b.dataset.hold === '1') this.input.down.add(k);
        for (const t of e.changedTouches) this.held.set(t.identifier, k);
        b.classList.add('on');
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          const k = this.held.get(t.identifier);
          if (k) this.input.down.delete(k);
          this.held.delete(t.identifier);
        }
        b.classList.remove('on');
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    }
  }

  padStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (!this.stick && t.clientX < window.innerWidth * 0.45) {
        this.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY };
        this.stickEl.style.left = `${t.clientX}px`;
        this.stickEl.style.top = `${t.clientY}px`;
        this.stickEl.classList.remove('hidden');
        this.setStick(t.clientX, t.clientY);
      } else if (!this.look) {
        this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
        this.input.touchLook = true;
      }
    }
  }

  padMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) this.setStick(t.clientX, t.clientY);
      else if (this.look && t.identifier === this.look.id) {
        this.input.dx += (t.clientX - this.look.x) * 2.3;
        this.input.dy += (t.clientY - this.look.y) * 2.3;
        this.input.lastMouseMove = performance.now();
        this.look.x = t.clientX;
        this.look.y = t.clientY;
      }
    }
  }

  padEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) this.releaseStick();
      if (this.look && t.identifier === this.look.id) {
        this.look = null;
        this.input.touchLook = false;
      }
    }
  }

  setStick(x, y) {
    const s = this.stick;
    let dx = x - s.x0, dy = y - s.y0;
    const d = Math.hypot(dx, dy);
    // floating base: drag past the rim and the stick follows your thumb
    if (d > STICK_R * 1.35) {
      const k = (d - STICK_R * 1.35) / d;
      s.x0 += dx * k; s.y0 += dy * k;
      this.stickEl.style.left = `${s.x0}px`;
      this.stickEl.style.top = `${s.y0}px`;
      dx = x - s.x0; dy = y - s.y0;
    }
    const m = Math.min(1, Math.hypot(dx, dy) / STICK_R);
    const a = Math.atan2(dy, dx);
    this.knobEl.style.transform = `translate(${Math.cos(a) * m * STICK_R}px, ${Math.sin(a) * m * STICK_R}px)`;
    const dz = m < 0.12 ? 0 : (m - 0.12) / 0.88;
    this.input.touch = { x: Math.cos(a) * dz, y: Math.sin(a) * dz };
  }

  releaseStick() {
    this.stick = null;
    this.input.touch = null;
    this.stickEl.classList.add('hidden');
    this.knobEl.style.transform = '';
  }

  // Gameplay controls only while playing; the top row (pause / phone / map) also works in menus.
  update(playing, running) {
    if (!this.on) return;
    this.root.classList.toggle('playing', playing);
    this.root.classList.toggle('hidden', !running);
    if (!playing) {
      if (this.stick) this.releaseStick();
      if (this.look) { this.look = null; this.input.touchLook = false; }
    }
  }
}
