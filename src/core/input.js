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

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => (this.mouseDown[e.button] = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.dx += e.movementX;
        this.dy += e.movementY;
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) this.lastMouseMove = performance.now();
      }
    });
    window.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  requestLock() {
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
