// Keyboard + mouse state with "just pressed" edge detection and pointer-lock mouse look.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDown = [false, false, false];
    this.mousePressed = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true; // false while menus/dialogue own the keyboard
    this.lastMouseMove = 0;
    this.touch = null; // joystick vector {x, y} while a thumb is on it
    this.touchLook = false;
    this.touchOn = false;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    // Mouse look works two ways: pointer lock (click the game) where the browser allows it,
    // and button-drag everywhere else (right/middle always; left too once pointer lock is known
    // to be blocked). A quick click without much movement still counts as a click.
    this.drag = { down: false, moved: 0, t: 0 };
    this.lockFailed = false;
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown[e.button] = true;
      if (e.button === 2 || e.button === 1 || (e.button === 0 && this.lockFailed)) {
        this.drag = { down: true, moved: 0, t: performance.now(), button: e.button };
      } else this.mousePressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseDown[e.button] = false;
      if (this.drag.down && e.button === this.drag.button) {
        const quick = this.drag.moved < 8 && performance.now() - this.drag.t < 350;
        if (quick && e.button !== 1) this.mousePressed[e.button] = true;
        this.drag.down = false;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.drag.down) {
        this.dx += e.movementX;
        this.dy += e.movementY;
        if (this.drag.down) this.drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) this.lastMouseMove = performance.now();
      }
    });
    window.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
      if (this.onLockFailed) this.onLockFailed();
    });
  }

  // true when mouse (or touch-drag) movement should steer the camera
  get looking() {
    return this.locked || this.drag.down || this.touchLook;
  }

  requestLock() {
    if (this.lockFailed || this.touchOn) return;
    if (!this.locked && this.canvas.requestPointerLock) {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (_) { /* some browsers throw if called too quickly */ }
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  key(code) { return this.enabled && this.down.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  // Menus read raw presses even when gameplay input is disabled.
  rawHit(code) { return this.pressed.has(code); }
  click(btn = 0) { return this.enabled && this.mousePressed[btn]; }
  held(btn = 0) { return this.enabled && this.mouseDown[btn]; }

  axis(neg, pos) {
    let v = 0;
    for (const k of neg) if (this.key(k)) v -= 1;
    for (const k of pos) if (this.key(k)) v += 1;
    // analog gamepad overrides when the stick is in use
    if (this.enabled && this.pad) {
      const a = this.pad.axes;
      let s = 0;
      if (pos.includes('KeyW')) s = Math.abs(this.pad.trig) > Math.abs(-a[1]) ? this.pad.trig : -a[1];
      else if (pos.includes('KeyD')) s = a[0];
      else if (pos.includes('KeyA')) s = -a[0];
      if (Math.abs(s) > Math.abs(v)) v = s;
    }
    // on-screen joystick (see ui/touch.js)
    if (this.enabled && this.touch) {
      const t = this.touch;
      const s = pos.includes('KeyW') ? -t.y : pos.includes('KeyD') ? t.x : pos.includes('KeyA') ? -t.x : 0;
      if (Math.abs(s) > Math.abs(v)) v = s;
    }
    return Math.max(-1, Math.min(1, v));
  }

  // Poll the first connected gamepad; buttons become virtual key codes.
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) { this.pad = null; return; }
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const axes = [dz(gp.axes[0] || 0), dz(gp.axes[1] || 0), dz(gp.axes[2] || 0), dz(gp.axes[3] || 0)];
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const val = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const map = {
      0: ['KeyE', 'PadA'], 1: ['Space', 'PadB'], 2: ['KeyF'], 3: ['KeyB'], 4: ['KeyQ'], 5: ['KeyG'],
      8: ['Tab'], 9: ['Escape'], 10: ['ShiftLeft'], 11: ['KeyH'], 12: ['KeyR', 'PadUp'], 13: ['KeyP', 'PadDown'], 14: ['KeyM', 'PadLeft'], 15: ['PadRight'],
    };
    const prev = this.pad ? this.pad.held : new Set();
    const held = new Set();
    for (const [i, codes] of Object.entries(map)) {
      if (!b(+i)) continue;
      for (const c of codes) {
        held.add(c);
        if (!prev.has(c)) this.pressed.add(c);
      }
    }
    for (const c of prev) if (!held.has(c)) this.down.delete(c);
    for (const c of held) this.down.add(c);
    this.pad = { axes, held, trig: val(7) - val(6) };
    if (Math.abs(axes[2]) + Math.abs(axes[3]) > 0) {
      this.dx += axes[2] * 14;
      this.dy += axes[3] * 10;
      this.lastMouseMove = performance.now();
    }
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }
}
