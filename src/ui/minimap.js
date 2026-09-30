// Rotating circular minimap + full-screen map.
import { paintGround, toPx } from '../world/terrain.js';
import { HALF } from '../world/layout.js';

export const POI_ICONS = {
  home: '🏠', liquor: '🍺', buffet: '🍗', hoa: '🏛️', proshop: '⛳', sal: '🔧', doc: '💊', tiki: '🍹', pool: '🏊', pickleball: '🎾', clubhouse: '🌴', gate: '🚧',
};

export class Minimap {
  constructor(canvas, bigCanvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.big = bigCanvas;
    this.bg = bigCanvas.getContext('2d');
    this.map = paintGround(1024, 'map');
    this.size = 1024;
    this.range = 110; // meters radius shown
  }

  toCanvas(x, z) {
    return { u: toPx(x, this.size), v: toPx(z, this.size) };
  }

  draw(game, yaw) {
    const g = this.g, W = this.c.width, R = W / 2;
    const p = game.player;
    const ppm = this.size / (HALF * 2); // map px per meter
    const scale = R / this.range / ppm; // canvas px per map px
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const a = -Math.PI / 2 - Math.atan2(fz, fx);
    const pc = this.toCanvas(p.x, p.z);
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath();
    g.arc(R, R, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#6f9a4a';
    g.fillRect(0, 0, W, W);
    g.translate(R, R);
    g.rotate(a);
    g.scale(scale, scale);
    g.drawImage(this.map, -pc.u, -pc.v);
    g.restore();

    const rot = (x, z) => {
      const dx = (x - p.x) * ppm * scale, dz = (z - p.z) * ppm * scale;
      return { x: R + dx * Math.cos(a) - dz * Math.sin(a), y: R + dx * Math.sin(a) + dz * Math.cos(a) };
    };
    const dot = (x, z, col, r = 3.5, clampEdge = false, icon = null) => {
      let s = rot(x, z);
      const dx = s.x - R, dy = s.y - R, d = Math.hypot(dx, dy);
      if (d > R - 8) {
        if (!clampEdge) return;
        s = { x: R + (dx / d) * (R - 10), y: R + (dy / d) * (R - 10) };
      }
      if (icon) {
        g.font = '15px "Segoe UI Emoji", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(icon, s.x, s.y);
        return;
      }
      g.fillStyle = col;
      g.beginPath();
      g.arc(s.x, s.y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#000';
      g.lineWidth = 1;
      g.stroke();
    };

    // balls
    for (const b of game.balls.list) {
      if (Math.abs(b.x - p.x) < this.range && Math.abs(b.z - p.z) < this.range) {
        const s = rot(b.x, b.z);
        g.fillStyle = '#fff';
        g.fillRect(s.x - 1, s.y - 1, 2, 2);
      }
    }
    for (const [id, poi] of Object.entries(game.world.pois)) if (POI_ICONS[id]) dot(poi.x, poi.z, '#fff', 4, false, POI_ICONS[id]);
    for (const n of game.npcs) {
      if (Math.abs(n.x - p.x) > this.range || Math.abs(n.z - p.z) > this.range) continue;
      if (n.role === 'security') dot(n.x, n.z, n.cart && n.cart.sirenOn ? (Math.floor(performance.now() / 250) % 2 ? '#ff3030' : '#3050ff') : '#5b7cff', 5);
      else if (n.hostile) dot(n.x, n.z, '#ff3b3b', 4);
      else if (n.role === 'lady') dot(n.x, n.z, '#ff6fa8', 4);
      else if (n.role === 'gang') dot(n.x, n.z, '#7CFC9A', 4);
      else if (n.data.wants) dot(n.x, n.z, '#4cc9f0', 3);
    }
    for (const c of game.concession) dot(c.cart.x, c.cart.z, c.state.owned ? '#7CFC9A' : '#f2c94c', 4.5);
    for (const e of game.eventMarkers) dot(e.x, e.z, '#ff3b3b', 6, true);
    if (game.playerCart && !p.cart) dot(game.playerCart.x, game.playerCart.z, '#ffd23f', 4.5, true, '🛺');
    if (game.markerPos) dot(game.markerPos.x, game.markerPos.z, '#f2c94c', 7, true);

    // player arrow
    const h = p.heading;
    const hx = Math.sin(h), hz = Math.cos(h);
    const ax = hx * Math.cos(a) - hz * Math.sin(a), ay = hx * Math.sin(a) + hz * Math.cos(a);
    const ang = Math.atan2(ay, ax);
    g.save();
    g.translate(R, R);
    g.rotate(ang);
    g.fillStyle = '#ffd23f';
    g.strokeStyle = '#1d2b53';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(10, 0);
    g.lineTo(-7, 6);
    g.lineTo(-3, 0);
    g.lineTo(-7, -6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // north indicator
    const n = rot(p.x, p.z - this.range * 0.9);
    g.font = 'bold 13px sans-serif';
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', n.x, n.y);
  }

  drawBig(game) {
    const g = this.bg, W = this.big.width;
    g.clearRect(0, 0, W, W);
    g.drawImage(this.map, 0, 0, W, W);
    const s = W / this.size;
    const P = (x, z) => ({ x: toPx(x, this.size) * s, y: toPx(z, this.size) * s });
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '22px "Segoe UI Emoji", sans-serif';
    for (const [id, poi] of Object.entries(game.world.pois)) {
      if (!POI_ICONS[id]) continue;
      const q = P(poi.x, poi.z);
      g.fillText(POI_ICONS[id], q.x, q.y);
    }
    for (const c of game.concession) {
      const q = P(c.cart.x, c.cart.z);
      g.fillStyle = c.state.owned ? '#7CFC9A' : '#f2c94c';
      g.beginPath(); g.arc(q.x, q.y, 6, 0, 7); g.fill(); g.stroke();
    }
    for (const n of game.npcs) {
      if (n.role === 'lady') {
        const q = P(n.x, n.z);
        g.font = '16px "Segoe UI Emoji", sans-serif';
        g.fillText('💗', q.x, q.y);
      }
    }
    for (const e of game.eventMarkers) {
      const q = P(e.x, e.z);
      g.fillStyle = '#ff3b3b';
      g.beginPath(); g.arc(q.x, q.y, 9, 0, 7); g.fill();
    }
    if (game.markerPos) {
      const q = P(game.markerPos.x, game.markerPos.z);
      g.font = '28px "Segoe UI Emoji", sans-serif';
      g.fillText('🔻', q.x, q.y - 10);
    }
    const q = P(game.player.x, game.player.z);
    g.fillStyle = '#ffd23f';
    g.strokeStyle = '#1d2b53';
    g.lineWidth = 3;
    g.beginPath(); g.arc(q.x, q.y, 9, 0, 7); g.fill(); g.stroke();
    g.font = 'bold 16px Nunito, sans-serif';
    g.fillStyle = '#1d2b53';
    g.fillText('YOU', q.x, q.y - 18);
    // labels
    g.font = 'bold 15px Nunito, sans-serif';
    g.fillStyle = 'rgba(20,30,60,.85)';
    const lbl = (t, x, z) => { const r = P(x, z); g.fillText(t, r.x, r.y); };
    lbl('PALMETTO LINKS GOLF COURSE', 0, -275);
    lbl('CLUBHOUSE', 15, -22);
    lbl('MAINTENANCE LOT', -238, 58 - 20);
    lbl('COMMERCIAL STRIP', 197, 16);
    lbl('RESIDENTIAL', 0, 285);

    const legend = document.getElementById('bigmap-legend');
    if (legend && !legend.dataset.done) {
      legend.dataset.done = '1';
      legend.innerHTML = `<div style="font-family:var(--display);color:var(--coral);font-size:18px;margin-bottom:6px">SUNSET PALMS</div>
        🏠 Your house<br>🍺 Liquor Barrel<br>🍹 Tiki Hut bar<br>🍗 Golden Coral buffet<br>🏛️ HOA Office<br>⛳ Pro Shop (Gus)<br>🔧 Sal's Cart Customs<br>💊 Doc's van<br>🏊 Pool • 🎾 Pickleball<br>💗 Ladies<br>
        <span style="color:#b7791f">●</span> Beverage cart (Chip's)<br><span style="color:#2e7d4f">●</span> Beverage cart (yours)<br><span style="color:#d33">●</span> Trouble<br>🔻 Objective
        <div style="margin-top:10px;opacity:.6;font-size:12px">Click or press M to close</div>`;
    }
  }
}
