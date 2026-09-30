// Blue Boy side effects, played strictly for sitcom laughs: whoever's on one waddles bow-legged with a
// folded Gazette held very deliberately in front of their waist, sweats, and gets Looks. Applies to Lee
// and to any customer who buys a Blue Boy off him.
import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { pick } from '../core/utils.js';

const LADY_LINES = ['Oh my!', 'Is that a newspaper or are you happy to see me?', 'Well HELLO, sailor.', 'Somebody\'s reading the sports section.', '*fans self*', 'I\'ll be at the pool. Just so you know.'];
const MAN_LINES = ['Put that away, Lee.', 'Good for you, buddy. Now go home.', 'Is that today\'s paper? ...Never mind.', 'I remember those days. 1987. Good year.', 'Walk it off, pal.'];
const KAREN_LINES = ['That is an HOA VIOLATION.', 'Section 9: no "displays" on common grounds!', 'I am writing this DOWN.'];

let paperMat = null;
function paperMesh() {
  if (!paperMat) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#efe9da'; x.fillRect(0, 0, 128, 96);
    x.fillStyle = '#1d1d1d'; x.font = 'bold 13px Georgia, serif'; x.textAlign = 'center';
    x.fillText('THE SUNSET PALMS', 64, 16);
    x.fillText('GAZETTE', 64, 30);
    x.fillRect(8, 36, 112, 2);
    for (let i = 0; i < 7; i++) { x.fillStyle = 'rgba(30,30,30,0.55)'; x.fillRect(10, 44 + i * 7, 50 - (i % 3) * 8, 3); x.fillRect(68, 44 + i * 7, 48 - (i % 2) * 10, 3); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    paperMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.015), paperMat);
  m.castShadow = true;
  return m;
}

export class BluePill {
  constructor(g) {
    this.g = g;
    this.mine = null; // { char, paper }
    this.said = new Set();
    this.sayT = 2;
    this.sweatT = 0;
    this.warned = false;
  }

  dress(char) {
    const paper = paperMesh();
    const belly = char.look.belly || 1;
    paper.position.set(0, -0.12, 0.2 + (belly - 1) * 0.16);
    paper.rotation.set(-0.12, 0, 0.08);
    char.b.hips.add(paper);
    char.poseBlue = true;
    return paper;
  }

  undress(char, paper) {
    char.b.hips.remove(paper);
    paper.geometry.dispose();
    char.poseBlue = false;
  }

  update(dt) {
    const g = this.g, p = g.player, s = g.state;
    const on = s.buffs.blue > 0;
    // Lee (re-dress if the wardrobe rebuilt his character)
    if (on && (!this.mine || this.mine.char !== p.char)) {
      if (this.mine && this.mine.char !== p.char) this.mine = null;
      this.mine = { char: p.char, paper: this.dress(p.char) };
      this.said.clear();
      this.warned = false;
    } else if (!on && this.mine) {
      this.undress(this.mine.char, this.mine.paper);
      this.mine = null;
      g.ui.toast('💊 The Blue Boy wears off. You can finally sit down without planning it.', 'love', 4);
    }
    if (on) {
      if (!this.warned && s.buffs.blue < 30) {
        this.warned = true;
        g.ui.toast('⚠️ Side effects may include confidence, newspaper purchases and a sudden urge to buy a boat. If this lasts more than 4 hours, consult Doc Pratt.', 'heat', 6);
      }
      this.sweatT -= dt;
      if (this.sweatT <= 0 && !p.cart) {
        this.sweatT = 1.2 + Math.random();
        g.particles.emit('drop', p.x + (Math.random() - 0.5) * 0.3, p.y + 1.75, p.z + (Math.random() - 0.5) * 0.3, { vy: 0.4, life: 0.7, size: 0.1, gravity: 6 });
      }
      // the neighbours notice
      this.sayT -= dt;
      if (this.sayT <= 0 && !p.cart && !g.ui.modal) {
        this.sayT = 2.5;
        const n = g.npcs.find((n) => !this.said.has(n) && !n.cart && n.state !== 'ko' && !n.hostile && n.visible && Math.hypot(n.x - p.x, n.z - p.z) < 6);
        if (n) {
          this.said.add(n);
          const karen = n.role === 'karen';
          n.say(pick(karen ? KAREN_LINES : n.char.look.female ? LADY_LINES : MAN_LINES), 2.4);
          if (karen) g.addHeat(0.2, 'Indecent newspaper-reading');
          if (n.char.look.female && !karen) audio.play('heart', { vol: 0.3 });
        }
      }
    }
    // customers who bought a Blue Boy off Lee
    for (const n of g.npcs) {
      const d = n.data;
      if (d.blueT > 0) {
        d.blueT -= dt;
        if (!d.bluePaper && !n.cart) d.bluePaper = this.dress(n.char);
        if (d.blueT <= 0 && d.bluePaper) { this.undress(n.char, d.bluePaper); d.bluePaper = null; }
      }
    }
  }

  clear() {
    if (this.mine) { this.undress(this.mine.char, this.mine.paper); this.mine = null; }
    for (const n of this.g.npcs) if (n.data.bluePaper) { this.undress(n.char, n.data.bluePaper); n.data.bluePaper = null; n.data.blueT = 0; }
  }
}
