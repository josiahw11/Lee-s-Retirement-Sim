// All DOM UI: HUD, prompts, toasts, speech bubbles, dialogue, shops, menus.
import * as THREE from 'three';
import { money, fmtTime, DAYS, clamp } from '../core/utils.js';
import { audio } from '../core/audio.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export class UI {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'hud-money', 'hud-time', 'hud-loc', 'm-hp', 'm-buzz', 'm-buzz-l', 'm-bladder', 'm-stam', 'hud-buffs', 'heat-icons', 'hud-heat', 'hud-stats', 'hud-obj', 'obj-text', 'obj-dist', 'radio', 'hud-weapon', 'hud-inv', 'speedo', 'speed-n', 'prompt', 'toasts', 'splash', 'hint', 'world-ui', 'dialogue', 'dlg-name', 'dlg-title', 'dlg-text', 'dlg-choices', 'shop', 'shop-title', 'shop-money', 'shop-greet', 'shop-items', 'menu', 'menu-tabs', 'menu-body', 'bigmap', 'pause', 'click-to-play']) {
      this.el[id] = $(id);
    }
    this.bubbles = [];
    this.floats = [];
    this.tagEls = new Map();
    this.markerEl = null;
    this.dlg = null;
    this.modal = null; // 'dialogue' | 'shop' | 'menu' | 'map' | 'pause'
    this._t = 0;
    this.camera = null;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    window.addEventListener('resize', () => { this.w = window.innerWidth; this.h = window.innerHeight; });
    $('shop-close').onclick = () => this.closeShop();
  }

  project(x, y, z) {
    _v.set(x, y, z).project(this.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: (_v.x * 0.5 + 0.5) * this.w, y: (-_v.y * 0.5 + 0.5) * this.h };
  }

  // ---------------- HUD ----------------
  updateHUD(g, dt) {
    this._t -= dt;
    const p = g.player;
    const st = g.state;
    const heatLvl = g.heat.level;
    // fast-updating things
    this.el['m-hp'].style.width = `${clamp(p.hp / g.maxHp(), 0, 1) * 100}%`;
    this.el['m-buzz'].style.width = `${st.buzz}%`;
    this.el['m-bladder'].style.width = `${st.bladder}%`;
    this.el['m-stam'].style.width = `${p.stamina}%`;
    if (p.cart) {
      this.el.speedo.classList.remove('hidden');
      const mph = Math.round(p.cart.speed * 2.237);
      this.el['speed-n'].textContent = mph;
      this.el.speedo.classList.toggle('fast', mph > 25);
    } else this.el.speedo.classList.add('hidden');
    const w = g.weaponDef();
    const cdp = clamp(1 - p.attackCd / w.cd, 0, 1);
    this.el['hud-weapon'].innerHTML = `<span>${w.icon} ${w.name}</span><div class="cd"><i style="width:${cdp * 100}%"></i></div>`;
    if (this._t > 0) return;
    this._t = 0.15;
    this.el['hud-money'].textContent = money(st.money);
    this.el['hud-money'].classList.toggle('neg', st.money < 0);
    this.el['hud-time'].textContent = `${DAYS[st.dow]} ${fmtTime(st.minutes)} • Day ${st.day + 1}`;
    this.el['hud-loc'].textContent = g.world.locationName(p.x, p.z);
    const bl = st.buzz;
    this.el['m-buzz-l'].textContent = bl < 5 ? 'SOBER' : bl < 30 ? 'BUZZED' : bl < 60 ? 'TIPSY' : bl < 85 ? 'HAMMERED' : 'BLACKOUT';
    const buffs = [];
    if (st.buffs.rhino > 0) buffs.push(`🦏 RHINO ${Math.ceil(st.buffs.rhino)}s`);
    if (st.buffs.blue > 0) buffs.push(`💊 BLUE ${Math.ceil(st.buffs.blue)}s`);
    if (st.buffs.colada > 0) buffs.push(`🍹 ${Math.ceil(st.buffs.colada)}s`);
    if (st.bladder > 80) buffs.push('🚽 GOTTA GO [P]');
    this.el['hud-buffs'].innerHTML = buffs.map((b) => `<span>${b}</span>`).join('');
    let hi = '';
    for (let i = 0; i < 5; i++) hi += `<span class="${i < heatLvl ? 'on' : 'off'}">📋</span>`;
    this.el['heat-icons'].innerHTML = hi;
    this.el['hud-heat'].classList.toggle('hot', heatLvl > 0);
    const sNames = [['str', 'STR'], ['cha', 'CHA'], ['intim', 'INT'], ['stat', 'STA']];
    this.el['hud-stats'].innerHTML = sNames.map(([k, n]) => {
      const base = g.statBase(k), eff = g.stat(k);
      return `<div class="s ${eff > base ? 'buffed' : ''}"><b>${eff}</b>${n}</div>`;
    }).join('');
    const inv = st.inv;
    const cap = g.ballCap();
    this.el['hud-inv'].innerHTML = `<span>🍺 ${inv.beer}</span><span>💊 ${inv.pills}</span><span>🍵 ${inv.tea}</span><span>⛳ ${inv.balls}/${cap}</span><span>🍷 ${inv.wine}</span><span>💐 ${inv.flowers}</span>`;
    // objective
    const obj = g.quests.current();
    if (g.race && g.race.running) {
      const h = g.race.hud();
      this.el['hud-obj'].classList.remove('hidden');
      this.el['obj-text'].textContent = h.title;
      this.el['obj-dist'].textContent = h.sub;
    } else if (obj) {
      this.el['hud-obj'].classList.remove('hidden');
      this.el['obj-text'].textContent = obj.title;
      const t = obj.target ? obj.target(g) : null;
      this.el['obj-dist'].textContent = t ? `${Math.round(Math.hypot(t.x - p.x, t.z - p.z))} m` : obj.hint || '';
    } else this.el['hud-obj'].classList.add('hidden');
  }

  prompt(html) {
    const e = this.el.prompt;
    if (!html) { e.classList.add('hidden'); this._prompt = null; return; }
    if (this._prompt !== html) {
      e.innerHTML = html;
      this._prompt = html;
    }
    e.classList.remove('hidden');
  }

  hint(text, dur = 4) {
    const e = this.el.hint;
    e.textContent = text;
    e.classList.remove('hidden');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => e.classList.add('hidden'), dur * 1000);
  }

  toast(text, kind = '', dur = 4.5) {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.innerHTML = text;
    this.el.toasts.prepend(d);
    while (this.el.toasts.children.length > 6) this.el.toasts.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), dur * 1000);
    setTimeout(() => d.remove(), dur * 1000 + 450);
  }

  splash(text, sub = '', dur = 2.5, color = null) {
    const e = this.el.splash;
    e.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    e.style.color = color || '';
    e.classList.remove('hidden');
    e.style.animation = 'none';
    void e.offsetWidth;
    e.style.animation = '';
    clearTimeout(this._splashT);
    this._splashT = setTimeout(() => e.classList.add('hidden'), dur * 1000);
  }

  radio(text) {
    const e = this.el.radio;
    e.textContent = `📻 ${text}`;
    e.classList.remove('hidden');
    clearTimeout(this._radioT);
    this._radioT = setTimeout(() => e.classList.add('hidden'), 3000);
  }

  // ---------------- world-space overlays ----------------
  bubble(ent, text, dur = 3) {
    // one bubble per entity
    for (const b of this.bubbles) if (b.ent === ent) { b.el.remove(); b.dead = true; }
    this.bubbles = this.bubbles.filter((b) => !b.dead);
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    this.el['world-ui'].appendChild(el);
    this.bubbles.push({ ent, el, t: dur });
    if (this.onBubble) this.onBubble(ent, text);
  }

  float(x, y, z, text, color = '#fff', dur = 1.4) {
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.color = color;
    this.el['world-ui'].appendChild(el);
    this.floats.push({ x, y, z, el, t: dur, max: dur });
  }

  updateWorldUI(dt, g) {
    for (const b of this.bubbles) {
      b.t -= dt;
      const e = b.ent;
      const s = this.project(e.x, (e.y || 0) + (e.cart ? 2.9 : 2.35), e.z);
      const d = Math.hypot(e.x - g.player.x, e.z - g.player.z);
      if (!s || b.t <= 0 || d > 45) {
        b.el.style.display = 'none';
      } else {
        b.el.style.display = '';
        b.el.style.left = `${s.x}px`;
        b.el.style.top = `${s.y}px`;
        b.el.style.opacity = clamp(b.t * 2, 0, 1);
      }
      if (b.t <= 0) { b.el.remove(); b.dead = true; }
    }
    this.bubbles = this.bubbles.filter((b) => !b.dead);
    for (const f of this.floats) {
      f.t -= dt;
      f.y += dt * 1.2;
      const s = this.project(f.x, f.y, f.z);
      if (s && f.t > 0) {
        f.el.style.left = `${s.x}px`;
        f.el.style.top = `${s.y}px`;
        f.el.style.opacity = clamp(f.t / (f.max * 0.4), 0, 1);
        f.el.style.display = '';
      } else f.el.style.display = 'none';
      if (f.t <= 0) { f.el.remove(); f.dead = true; }
    }
    this.floats = this.floats.filter((f) => !f.dead);

    // NPC tags (icons + names)
    const seen = new Set();
    for (const t of g.tags) {
      seen.add(t.key);
      let el = this.tagEls.get(t.key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'tag';
        this.el['world-ui'].appendChild(el);
        this.tagEls.set(t.key, el);
      }
      const s = this.project(t.x, t.y, t.z);
      if (!s) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = `${s.x}px`;
      el.style.top = `${s.y}px`;
      const html = `${t.icon ? `<span class="ico">${t.icon}</span>` : ''}${t.label || ''}`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      el.className = `tag ${t.cls || ''}`;
    }
    for (const [k, el] of this.tagEls) if (!seen.has(k)) { el.remove(); this.tagEls.delete(k); }

    // objective marker
    const m = g.markerPos;
    if (m) {
      if (!this.markerEl) {
        this.markerEl = document.createElement('div');
        this.markerEl.className = 'marker';
        this.el['world-ui'].appendChild(this.markerEl);
      }
      const s = this.project(m.x, m.y + 3.2, m.z);
      if (s) {
        const d = Math.round(Math.hypot(m.x - g.player.x, m.z - g.player.z));
        this.markerEl.style.display = '';
        this.markerEl.style.left = `${clamp(s.x, 30, this.w - 30)}px`;
        this.markerEl.style.top = `${clamp(s.y, 60, this.h - 40)}px`;
        this.markerEl.innerHTML = `🔻<small>${d}m</small>`;
      } else this.markerEl.style.display = 'none';
    } else if (this.markerEl) this.markerEl.style.display = 'none';
  }

  clearWorldUI() {
    for (const b of this.bubbles) b.el.remove();
    for (const f of this.floats) f.el.remove();
    for (const [, el] of this.tagEls) el.remove();
    this.bubbles = [];
    this.floats = [];
    this.tagEls.clear();
  }

  // ---------------- dialogue ----------------
  // node: {name, title, text, choices:[{text, check:{label,chance}, disabled, action}], onClose}
  openDialogue(node) {
    // a new conversation replacing an open one still owes the old one its cleanup
    if (this.modal === 'dialogue' && this._onClose) { const cb = this._onClose; this._onClose = null; cb(); }
    this._onClose = node.onClose || null;
    this.modal = 'dialogue';
    if (this.onModalOpen) this.onModalOpen();
    this.el.dialogue.classList.remove('hidden');
    this.showNode(node);
  }

  showNode(node) {
    if (!node) return this.closeDialogue();
    this.dlg = node;
    this.el['dlg-name'].textContent = node.name || '';
    this.el['dlg-title'].textContent = node.title || '';
    const full = node.text || '';
    this.typeFull = full;
    this.typeI = 0;
    this.el['dlg-text'].textContent = '';
    clearInterval(this._typeT);
    this._typeT = setInterval(() => {
      this.typeI += 2;
      this.el['dlg-text'].textContent = full.slice(0, this.typeI);
      if (this.typeI >= full.length) clearInterval(this._typeT);
    }, 16);
    const box = this.el['dlg-choices'];
    box.innerHTML = '';
    const choices = node.choices && node.choices.length ? node.choices : [{ text: node.next ? 'Continue' : 'Leave', action: () => (node.next ? node.next() : null) }];
    choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      let chk = '';
      if (c.check) {
        const pct = Math.round(c.check.chance * 100);
        const cls = pct >= 70 ? 'good' : pct >= 40 ? 'mid' : 'bad';
        chk = `<span class="chk ${cls}">${c.check.label} ${pct}%</span>`;
      } else if (c.tag) chk = `<span class="chk ${c.tagCls || 'money'}">${c.tag}</span>`;
      b.innerHTML = `<span><span class="num">${i + 1}.</span>${c.text}</span>${chk}`;
      b.disabled = !!c.disabled;
      b.onclick = () => this.choose(i);
      box.appendChild(b);
    });
    this._choices = choices;
  }

  choose(i) {
    const c = this._choices && this._choices[i];
    if (!c || c.disabled) return;
    // first press finishes typing
    if (this.typeI < this.typeFull.length) {
      this.typeI = this.typeFull.length;
      this.el['dlg-text'].textContent = this.typeFull;
      clearInterval(this._typeT);
      return;
    }
    audio.play('click');
    const next = c.action ? c.action() : null;
    if (next && next !== 'keep') this.showNode(next);
    else if (next !== 'keep') this.closeDialogue();
  }

  closeDialogue() {
    const cb = this._onClose;
    this._onClose = null;
    this.dlg = null;
    clearInterval(this._typeT);
    this.el.dialogue.classList.add('hidden');
    if (this.modal === 'dialogue') this.modal = null;
    if (cb) cb();
    if (this.onModalClose) this.onModalClose();
  }

  // ---------------- shop ----------------
  openShop(def, g, handlers) {
    this.modal = 'shop';
    if (this.onModalOpen) this.onModalOpen();
    this.shopDef = def;
    this.shopHandlers = handlers;
    this.shopGame = g;
    this.el.shop.classList.remove('hidden');
    this.el['shop-title'].textContent = def.title;
    this.el['shop-greet'].textContent = handlers.greet || '';
    this.renderShop();
  }

  renderShop() {
    const def = this.shopDef, g = this.shopGame, h = this.shopHandlers;
    this.el['shop-money'].textContent = money(g.state.money);
    const box = this.el['shop-items'];
    box.innerHTML = '';
    const items = h.items ? h.items() : def.items;
    items.forEach((it) => {
      const b = document.createElement('button');
      const info = h.info ? h.info(it) : {};
      b.className = `item ${info.owned ? 'owned' : ''}`;
      const price = info.price ?? it.price;
      b.innerHTML = `<span class="ic">${it.icon || '•'}</span><span><div class="nm">${it.name}</div><div class="ds">${info.desc || it.desc || ''}</div></span><span class="pr">${info.label || (price ? money(price) : '')}</span>`;
      b.disabled = !!info.disabled;
      b.onclick = () => {
        h.buy(it);
        this.renderShop();
      };
      box.appendChild(b);
    });
  }

  closeShop() {
    this.el.shop.classList.add('hidden');
    if (this.modal === 'shop') this.modal = null;
    if (this.onModalClose) this.onModalClose();
  }

  // ---------------- generic modal helpers ----------------
  show(id) { $(id).classList.remove('hidden'); }
  hide(id) { $(id).classList.add('hidden'); }
}
