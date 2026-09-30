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
    return Math.max(-1, Math.min(1, v));
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }
}
