// DOM mini-games that run inside the main loop while the world is paused.
import { audio } from '../core/audio.js';
import { clamp, rand, randInt, pick, money, shuffle } from '../core/utils.js';

const box = () => document.getElementById('mg-box');

// ---------------------------------------------------------------- Chug-Off
// Stop the needle in the green zone to chug. Every beer makes the needle drunker.
export class ChugOff {
  constructor(game, { opponent = 'Tiki Hut Regular', bet = 40, oppRate = [2.3, 3.2], onWin, onLose } = {}) {
    this.g = game;
    this.opp = opponent;
    this.bet = bet;
    this.oppRate = oppRate;
    this.onWin = onWin;
    this.onLose = onLose;
    this.target = 6;
    this.mine = 0;
    this.theirs = 0;
    this.t = 0;
    this.phase = rand(0, 6);
    this.zone = this.newZone();
    this.cool = 0;
    this.oppT = rand(...oppRate) + 1.5;
    this.done = false;
    this.msg = 'Stop the needle in the GREEN to chug!';
    box().innerHTML = `
      <div class="mg-title">🍺 CHUG-OFF 🍺</div>
      <div class="mg-sub">${game.state.name} vs ${opponent} • First to ${this.target} • Bet ${money(bet)}</div>
      <div class="chug-rows">
        <div class="chug-row"><b>${game.state.name}</b><span id="chug-me"></span></div>
        <div class="chug-row"><b>${opponent}</b><span id="chug-them"></span></div>
      </div>
      <div class="chug-bar"><div id="chug-zone"></div><div id="chug-needle"></div></div>
      <div class="mg-msg" id="chug-msg"></div>
      <div class="mg-hint">SPACE / CLICK to chug • ESC to forfeit</div>`;
    box().onclick = () => this.press();
    this.render();
  }

  newZone() {
    const w = clamp(0.24 - this.mine * 0.022, 0.1, 0.24);
    const c = rand(0.2, 0.8);
    return { a: c - w / 2, b: c + w / 2 };
  }

  needle() {
    const drunk = this.g.state.buzz / 100;
    const speed = 1.7 + this.mine * 0.22 + drunk * 1.2;
    const wobble = Math.sin(this.t * 7.3) * drunk * 0.08;
    return clamp(0.5 + 0.5 * Math.sin(this.phase + this.t * speed) + wobble, 0, 1);
  }

  press() {
    if (this.done || this.cool > 0) return;
    const n = this.needle();
    if (n >= this.zone.a && n <= this.zone.b) {
      this.mine++;
      this.g.state.buzz = Math.min(99, this.g.state.buzz + 9);
      this.g.state.bladder = Math.min(100, this.g.state.bladder + 8);
      audio.play('glug');
      this.msg = pick(['GLUG GLUG GLUG!', 'The crowd goes mild!', 'Chugged like a champion!', "That's the stuff!"]);
      this.zone = this.newZone();
      this.cool = 0.5;
    } else {
      audio.play('splash', { vol: 0.4 });
      this.msg = pick(['SPILLED IT! Down your shirt!', 'Missed your mouth entirely.', 'That one went up your nose.']);
      this.cool = 0.9;
    }
    this.render();
    if (this.mine >= this.target) this.finish(true);
  }

  render() {
    const cup = (n) => '🍺'.repeat(n) + '<span class="mg-dim">🍺</span>'.repeat(this.target - n);
    document.getElementById('chug-me').innerHTML = cup(this.mine);
    document.getElementById('chug-them').innerHTML = cup(this.theirs);
    const z = document.getElementById('chug-zone');
    z.style.left = `${this.zone.a * 100}%`;
    z.style.width = `${(this.zone.b - this.zone.a) * 100}%`;
    document.getElementById('chug-msg').textContent = this.msg;
  }

  update(dt, input) {
    if (this.done) return;
    this.t += dt;
    this.cool -= dt;
    this.oppT -= dt;
    if (input.rawHit('Space') || input.rawHit('Enter')) this.press();
    if (input.rawHit('Escape')) return this.finish(false, true);
    if (this.oppT <= 0) {
      this.theirs++;
      this.oppT = rand(...this.oppRate) * (1 + this.theirs * 0.04);
      audio.play('glug', { vol: 0.35 });
      this.render();
      if (this.theirs >= this.target) return this.finish(false);
    }
    const nd = document.getElementById('chug-needle');
    if (nd) nd.style.left = `${this.needle() * 100}%`;
  }

  finish(win, forfeit = false) {
    if (this.done) return;
    this.done = true;
    const g = this.g;
    g.state.counters.beers += this.mine;
    if (win) {
      audio.play('burp');
      this.msg = `*BRAAAAP* ${g.state.name} WINS! +${money(this.bet * 2)}`;
      g.addMoney(this.bet * 2, 'chug-off');
      g.xp('str', 2);
      g.xp('cha', 1);
      g.achievement('chug');
      if (this.onWin) this.onWin();
    } else {
      audio.play('sadTrombone');
      this.msg = forfeit ? 'You forfeited. The bar boos you.' : `${this.opp} wins and slams the mug down. You owe ${money(this.bet)}.`;
      if (this.onLose) this.onLose();
    }
    this.render();
    setTimeout(() => g.endMinigame(), 2200);
  }
}

// ---------------------------------------------------------------- Bingo
// Daub the called numbers and yell BINGO before Karen's "friend" does. It's rigged.
const COLS = 'BINGO';
export class Bingo {
  constructor(game, { pot = 150, rigged = true } = {}) {
    this.g = game;
    this.pot = pot;
    this.card = [];
    for (let c = 0; c < 5; c++) {
      const nums = shuffle(Array.from({ length: 15 }, (_, i) => c * 15 + i + 1)).slice(0, 5);
      for (let r = 0; r < 5; r++) this.card[r * 5 + c] = nums[r];
    }
    this.card[12] = 0; // free space
    this.daub = new Set([12]);
    this.pool = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
    this.called = [];
    this.t = 1.5;
    this.interval = 1.8;
    const slow = game.state.romance.millie?.conquest ? 10 : 0;
    this.rivalAt = randInt(rigged ? 30 : 38, rigged ? 50 : 58) + slow;
    this.done = false;
    this.msg = 'Karen is calling. Daub fast, old man.';
    const cells = this.card.map((n, i) => `<button class="bingo-cell ${i === 12 ? 'free' : ''}" data-i="${i}">${i === 12 ? 'FREE' : n}</button>`).join('');
    box().innerHTML = `
      <div class="mg-title">🎱 BINGO NIGHT 🎱</div>
      <div class="mg-sub">Pot: ${money(pot)} • Caller: Karen Whitmore (suspiciously)${slow ? ' • Millie is slowing her down 😉' : ''}</div>
      <div class="bingo-wrap">
        <div>
          <div class="bingo-head">${COLS.split('').map((c) => `<span>${c}</span>`).join('')}</div>
          <div class="bingo-card">${cells}</div>
        </div>
        <div class="bingo-side">
          <div class="bingo-call" id="bingo-call">—</div>
          <div class="bingo-called" id="bingo-called"></div>
          <button class="btn big" id="bingo-yell">BINGO!</button>
        </div>
      </div>
      <div class="mg-msg" id="bingo-msg"></div>
      <div class="mg-hint">Click called numbers to daub • ESC to walk out</div>`;
    box().onclick = null;
    box().querySelectorAll('.bingo-cell').forEach((b) => (b.onclick = () => this.tap(+b.dataset.i, b)));
    document.getElementById('bingo-yell').onclick = () => this.yell();
    this.render();
  }

  label(n) {
    return `${COLS[Math.floor((n - 1) / 15)]}-${n}`;
  }

  tap(i, el) {
    if (this.done || this.daub.has(i)) return;
    if (!this.called.includes(this.card[i])) {
      this.msg = "That number hasn't been called, cheater.";
      audio.play('fail', { vol: 0.4 });
    } else {
      this.daub.add(i);
      el.classList.add('on');
      audio.play('pickup', { vol: 0.5 });
      this.msg = '';
    }
    this.render();
  }

  hasBingo() {
    const d = (r, c) => this.daub.has(r * 5 + c);
    for (let k = 0; k < 5; k++) {
      if ([0, 1, 2, 3, 4].every((j) => d(k, j))) return true;
      if ([0, 1, 2, 3, 4].every((j) => d(j, k))) return true;
    }
    return [0, 1, 2, 3, 4].every((j) => d(j, j)) || [0, 1, 2, 3, 4].every((j) => d(j, 4 - j));
  }

  yell() {
    if (this.done) return;
    if (this.hasBingo()) return this.finish('win');
    this.g.addHeat(0.4, 'False bingo (a Class-A HOA offense)');
    this.finish('false');
  }

  render() {
    document.getElementById('bingo-msg').textContent = this.msg;
    const last = this.called[this.called.length - 1];
    document.getElementById('bingo-call').textContent = last ? this.label(last) : '—';
    document.getElementById('bingo-called').textContent = this.called.slice(-12).map((n) => this.label(n)).join('  ');
  }

  update(dt, input) {
    if (this.done) return;
    if (input.rawHit('Escape')) return this.finish('quit');
    this.t -= dt;
    if (this.t > 0) return;
    this.t = this.interval;
    const n = this.pool.pop();
    this.called.push(n);
    audio.tone({ freq: 520 + (n % 5) * 60, type: 'triangle', dur: 0.15, vol: 0.1 });
    if (this.called.length >= this.rivalAt) return this.finish('rival');
    this.render();
  }

  finish(result) {
    if (this.done) return;
    this.done = true;
    const g = this.g;
    if (result === 'win') {
      this.msg = `B-I-N-G-O! You win ${money(this.pot)}! Karen's eye is twitching.`;
      g.addMoney(this.pot, 'BINGO');
      g.xp('cha', 2);
      g.xp('stat', 1);
      g.achievement('bingo');
      audio.play('levelup');
    } else if (result === 'rival') {
      this.msg = `"${pick(['BINGO!', 'BINGO, BABY!', 'Bingo! Karen, you\'re a doll.'])}" — ${pick(["Karen's sister-in-law", 'Phyllis (Karen\'s neighbor)', 'Karen\'s bridge partner'])}. Rigged. Totally rigged.`;
      audio.play('sadTrombone');
    } else if (result === 'false') {
      this.msg = 'FALSE BINGO! Karen blows a whistle. Everyone gasps. You are escorted out.';
      audio.play('whistle');
    } else this.msg = 'You walked out mid-game. Mildred took your chair.';
    this.render();
    g.advanceTime(60);
    setTimeout(() => g.endMinigame(), result === 'quit' ? 400 : 2600);
  }
}
