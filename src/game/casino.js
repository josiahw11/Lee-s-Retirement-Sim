// Lucky Lady casino games (DOM mini-games, same contract as minigames.js):
// Blackjack at Bernadette's table (or a duel with the Captain), the Golden Gam-Gam slots, and the Captain's safe.
import { audio } from '../core/audio.js';
import { clamp, rand, pick, money, shuffle } from '../core/utils.js';

const box = () => document.getElementById('mg-box');
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- Blackjack
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function handValue(cards) {
  let v = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 'A') { aces++; v += 11; } else v += ['J', 'Q', 'K'].includes(c.r) ? 10 : +c.r;
  }
  while (v > 21 && aces) { v -= 10; aces--; }
  return { v, soft: aces > 0 };
}
const cardHTML = (c, hidden = false, i = 0) => hidden
  ? `<div class="bj-card back" style="animation-delay:${i * 0.08}s"></div>`
  : `<div class="bj-card ${c.s === '♥' || c.s === '♦' ? 'red' : ''}" style="animation-delay:${i * 0.08}s"><b>${c.r}</b><i>${c.s}</i><b class="br">${c.r}</b></div>`;

export class Blackjack {
  // duel: { need: 3 } -> first to `need` hand wins against the Captain (fixed stake per hand)
  constructor(game, { dealer = 'Bernadette', duel = null, stake = 100, onDone } = {}) {
    this.g = game;
    this.dealer = dealer;
    this.duel = duel;
    this.onDone = onDone;
    this.bets = [10, 25, 50, 100];
    this.bet = duel ? stake : 25;
    this.net = 0;
    this.wins = 0;
    this.losses = 0;
    this.shoe = [];
    this.phase = 'bet';
    this.msg = duel ? `The Captain shuffles. First to ${duel.need} hands wins. ${money(stake)} a hand.` : pick(['"Place your bets, sugar."', '"Minimum ten. Maximum whatever your kids don\'t know about."', '"Feeling lucky, handsome?"']);
    box().onclick = null;
    box().innerHTML = `
      <div class="mg-title">${duel ? '⚓ THE CAPTAIN\'S TABLE ⚓' : '🃏 BLACKJACK 🃏'}</div>
      <div class="mg-sub">${duel ? 'Captain Dom Moretti deals. Loser goes overboard.' : `Dealer: ${dealer} • Blackjack pays 3:2 • Dealer stands on 17`}</div>
      <div class="bj-felt">
        <div class="bj-row"><span class="bj-who">${duel ? 'CAPTAIN' : dealer.toUpperCase()} <em id="bj-dv"></em></span><div class="bj-cards" id="bj-dealer"></div></div>
        <div class="bj-row"><span class="bj-who">${game.state.name.toUpperCase()} <em id="bj-pv"></em></span><div class="bj-cards" id="bj-player"></div></div>
      </div>
      <div class="bj-bar"><span id="bj-bank"></span><span id="bj-bet"></span><span id="bj-net"></span></div>
      <div class="mg-msg" id="bj-msg"></div>
      <div class="bj-btns" id="bj-btns"></div>
      <div class="mg-hint">${duel ? 'H hit • S stand • D double' : '1-4 bet • SPACE deal • H hit • S stand • D double • ESC cash out'}</div>`;
    this.render();
  }

  draw() {
    if (this.shoe.length < 30) {
      this.shoe = [];
      for (let d = 0; d < 6; d++) for (const s of SUITS) for (const r of RANKS) this.shoe.push({ r, s });
      shuffle(this.shoe);
      if (this.phase !== 'bet') this.msg = '*The shoe is reshuffled.*';
    }
    return this.shoe.pop();
  }

  deal() {
    if (this.phase !== 'bet' && this.phase !== 'result') return;
    if (this.g.state.money < this.bet) {
      if (this.duel) { // can't cover the stake: that's a loss, and the deckhands know what that means
        this.losses = this.duel.need;
        this.msg = '"You can\'t cover the stake? Pathetic." The deckhands crack their knuckles...';
        this.doneT = 2.4;
      } else this.msg = '"Honey, you\'re tapped out."';
      this.render();
      return;
    }
    this.g.spend(this.bet);
    this.stake = this.bet;
    this.player = [this.draw(), this.draw()];
    this.dealerCards = [this.draw(), this.draw()];
    // charm: Bernadette "accidentally" tips her hole card to a charming regular
    const cha = this.g.state.stats.cha.lvl;
    this.peek = !this.duel && cha >= 4 && Math.random() < 0.25 + (cha - 4) * 0.1;
    this.phase = 'player';
    audio.play('click');
    this.msg = this.peek ? `*${this.dealer} winks and lifts the corner of her hole card a little too high.* 😉` : '';
    const p = handValue(this.player).v, d = handValue(this.dealerCards).v;
    if (p === 21 || d === 21) return this.settle();
    this.render();
  }

  drunkFumble(action) {
    // liquid courage has a price: sometimes your hand does the other thing
    const buzz = this.g.state.buzz;
    if (buzz > 55 && Math.random() < (buzz - 55) / 150) {
      this.msg = action === 'hit' ? '*hic* You meant to HIT. You waved STAND. The dealer takes it.' : '*hic* You meant to STAND. Your finger tapped the felt. HIT it is.';
      return action === 'hit' ? 'stand' : 'hit';
    }
    return action;
  }

  hit() {
    if (this.phase !== 'player') return;
    if (this.drunkFumble('hit') === 'stand') { this.fumble = this.msg; return this.stand(true); }
    this.player.push(this.draw());
    audio.play('click');
    const v = handValue(this.player).v;
    if (v > 21) return this.settle();
    if (v === 21) return this.stand(true);
    this.render();
  }

  stand(forced = false) {
    if (this.phase !== 'player') return;
    if (!forced && this.drunkFumble('stand') === 'hit') {
      this.fumble = this.msg;
      this.player.push(this.draw());
      const v = handValue(this.player).v;
      if (v > 21) return this.settle();
      if (v === 21) return this.stand(true);
      this.render();
      return;
    }
    this.phase = 'dealer';
    while (handValue(this.dealerCards).v < 17) this.dealerCards.push(this.draw());
    this.settle();
  }

  double() {
    if (this.phase !== 'player' || this.player.length !== 2) return;
    if (this.g.state.money < this.stake) { this.msg = "Can't cover the double."; this.render(); return; }
    this.g.spend(this.stake);
    this.stake *= 2;
    this.player.push(this.draw());
    audio.play('click');
    if (handValue(this.player).v > 21) return this.settle();
    this.stand(true);
  }

  settle() {
    const p = handValue(this.player).v, d = handValue(this.dealerCards).v;
    const natural = p === 21 && this.player.length === 2;
    const dNatural = d === 21 && this.dealerCards.length === 2;
    let pay = 0, res;
    if (p > 21) res = 'bust';
    else if (natural && !dNatural) { pay = this.stake * 2.5; res = 'blackjack'; }
    else if (dNatural && !natural) res = 'lose';
    else if (d > 21 || p > d) { pay = this.stake * 2; res = 'win'; }
    else if (p === d) { pay = this.stake; res = 'push'; }
    else res = 'lose';
    if (pay) this.g.addMoney(Math.round(pay), this.duel ? "the Captain's table" : 'blackjack');
    const delta = Math.round(pay - this.stake);
    this.net += delta;
    this.g.state.counters.bjNet = (this.g.state.counters.bjNet || 0) + delta;
    if (delta > 0 && !this.duel) this.g.state.counters.bjWon = (this.g.state.counters.bjWon || 0) + delta; // gross winnings (quest)
    const who = this.duel ? 'The Captain' : this.dealer;
    if (res === 'blackjack') { this.g.achievement('blackjack21'); audio.play('cash'); this.msg = `BLACKJACK! Pays 3:2. +${money(pay - this.stake)}`; this.wins++; }
    else if (res === 'win') { audio.play('cash'); this.msg = d > 21 ? `${who} busts with ${d}! You win ${money(this.stake)}.` : `${p} beats ${d}. You win ${money(this.stake)}.`; this.wins++; }
    else if (res === 'push') { audio.play('click'); this.msg = `Push at ${p}. Your bet comes back.`; }
    else { audio.play('fail'); this.msg = res === 'bust' ? `Bust with ${p}. ${pick(['"Ouch, sugar."', '"Happens to the best of us."', '"The house thanks you."'])}` : `${who} has ${d}. You lose ${money(this.stake)}.`; this.losses++; }
    if (this.fumble) { this.msg = this.fumble + ' ' + this.msg; this.fumble = null; }
    this.phase = 'result';
    this.render();
    if (this.duel && (this.wins >= this.duel.need || this.losses >= this.duel.need)) {
      this.doneT = 2.4;
      this.msg += this.wins >= this.duel.need ? ' — THE CAPTAIN IS BEATEN.' : ' — The deckhands crack their knuckles...';
      this.render();
    }
  }

  render() {
    const hide = this.phase === 'player' && !this.peek;
    const dv = this.dealerCards ? handValue(this.phase === 'player' ? [this.dealerCards[0]] : this.dealerCards).v : '';
    $('bj-dealer').innerHTML = this.dealerCards ? this.dealerCards.map((c, i) => cardHTML(c, i === 1 && hide, i)).join('') : '';
    $('bj-player').innerHTML = this.player ? this.player.map((c, i) => cardHTML(c, false, i)).join('') : '';
    $('bj-dv').textContent = this.dealerCards ? `(${dv}${this.phase === 'player' && !this.peek ? ' + ?' : ''})` : '';
    $('bj-pv').textContent = this.player ? `(${handValue(this.player).v})` : '';
    $('bj-bank').textContent = `Bank ${money(this.g.state.money)}`;
    $('bj-bet').textContent = this.duel ? `Hands: You ${this.wins} — ${this.losses} Captain` : `Bet ${money(this.phase === 'player' ? this.stake : this.bet)}`;
    $('bj-net').textContent = `${this.net >= 0 ? '+' : ''}${money(this.net)} tonight`;
    $('bj-msg').textContent = this.msg;
    const btn = (id, label, on, cls = '') => `<button class="btn ${cls}" data-a="${id}" ${on ? '' : 'disabled'}>${label}</button>`;
    let h = '';
    if (this.phase === 'player') h = btn('hit', 'HIT', true) + btn('stand', 'STAND', true) + btn('double', 'DOUBLE', this.player.length === 2 && this.g.state.money >= this.stake);
    else if (!this.doneT) {
      if (!this.duel) h = this.bets.map((b, i) => btn(`bet${i}`, money(b), this.g.state.money >= b, b === this.bet ? 'sel' : '')).join('');
      h += btn('deal', this.phase === 'bet' ? 'DEAL' : 'DEAL AGAIN', true, 'big');
      if (!this.duel) h += btn('leave', 'CASH OUT', true, 'alt');
    }
    $('bj-btns').innerHTML = h;
    for (const b of $('bj-btns').querySelectorAll('button')) b.onclick = () => this.act(b.dataset.a);
  }

  act(a) {
    if (a === 'hit') this.hit();
    else if (a === 'stand') this.stand();
    else if (a === 'double') this.double();
    else if (a === 'deal') this.deal();
    else if (a === 'leave') this.finish();
    else if (a.startsWith('bet') && !this.duel) { this.bet = this.bets[+a.slice(3)]; audio.play('click'); this.render(); }
  }

  update(dt, input) {
    if (this.done) return;
    if (this.doneT) {
      this.doneT -= dt;
      if (this.doneT <= 0) this.finish();
      return;
    }
    // leaving first (gamepad B also sends Space): cash out, or fold the Captain's duel
    if ((input.rawHit('Escape') || input.rawHit('PadB')) && this.phase !== 'player') {
      if (!this.duel) return this.finish();
      this.losses = this.duel.need;
      this.msg = 'You fold. The Captain smiles. The deckhands do not.';
      this.doneT = 2;
      this.render();
      return;
    }
    // gamepad: A = hit / deal, X (F) = stand, Y (B) = double
    if (input.rawHit('KeyH') || (input.rawHit('PadA') && this.phase === 'player')) this.hit();
    else if (input.rawHit('Space') || input.rawHit('Enter') || input.rawHit('PadA')) this.deal();
    if (input.rawHit('KeyS') || input.rawHit('KeyF')) this.stand();
    if (input.rawHit('KeyD') || input.rawHit('KeyB')) this.double();
    for (let i = 0; i < 4; i++) if (input.rawHit(`Digit${i + 1}`)) this.act(`bet${i}`);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const g = this.g;
    g.endMinigame();
    if (this.net > 0 && !this.duel) g.ui.toast(`🃏 You walk away from the table up ${money(this.net)}.`, 'money', 4);
    else if (this.net < 0 && !this.duel) g.ui.toast(`🃏 Down ${money(-this.net)}. Bernadette blows you a kiss anyway.`, 'heat', 4);
    if (this.onDone) this.onDone({ net: this.net, wins: this.wins, losses: this.losses, won: this.duel ? this.wins >= this.duel.need : this.net > 0 });
  }
}

// ---------------------------------------------------------------- Golden Gam-Gam slots
const SYMS = ['🍒', '🍋', '🔔', '💊', '🦏', '🥃', '7️⃣', '👵'];
const WEIGHTS = [24, 20, 16, 12, 10, 9, 5, 2]; // the house always wins
const PAYS = { '👵': 0, '7️⃣': 50, '🥃': 20, '🦏': 25, '💊': 15, '🔔': 10, '🍋': 6, '🍒': 4 };

function spinSym() {
  let r = Math.random() * WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < SYMS.length; i++) { r -= WEIGHTS[i]; if (r <= 0) return SYMS[i]; }
  return SYMS[0];
}

export class Slots {
  // rigged: true -> Fingers loosened this machine; the jackpot lands on the third pull
  constructor(game, { rigged = false, onDone } = {}) {
    this.g = game;
    this.rigged = rigged;
    this.onDone = onDone;
    this.bet = 5;
    this.net = 0;
    this.pulls = 0;
    this.spinning = 0;
    const st = game.state;
    st.casino = st.casino || {};
    st.casino.pot = st.casino.pot || 2500;
    this.reels = [0, 1, 2].map(() => ({ sym: pick(SYMS), strip: [], t: 0, stopAt: 0, done: true }));
    this.msg = rigged ? 'Machine #3. Fingers gave it a little "tune-up." It hums.' : '"Every pull feeds the Gam-Gam." — the sign, ominously.';
    box().onclick = null;
    box().innerHTML = `
      <div class="mg-title">👵 THE GOLDEN GAM-GAM 👵</div>
      <div class="mg-sub">${rigged ? 'Machine #3 • slightly... adjusted' : 'Three Gam-Gams wins the progressive jackpot'}</div>
      <div class="slot-cab ${rigged ? 'rigged' : ''}">
        <div class="slot-pot">JACKPOT <b id="sl-pot"></b></div>
        <div class="slot-window">${[0, 1, 2].map((i) => `<div class="slot-reel"><div class="slot-strip" id="sl-r${i}"></div></div>`).join('')}<div class="slot-line"></div></div>
        <div class="slot-pay">🍒🍒🍒 ×4 • 🍋 ×6 • 🔔 ×10 • 💊 ×15 • 🥃 ×20 • 🦏 ×25 • 7️⃣ ×50 • any 2 🍒 ×2</div>
      </div>
      <div class="bj-bar"><span id="sl-bank"></span><span id="sl-bet"></span><span id="sl-net"></span></div>
      <div class="mg-msg" id="sl-msg"></div>
      <div class="bj-btns"><button class="btn" id="sl-b5">$5</button><button class="btn" id="sl-b25">$25</button><button class="btn big" id="sl-pull">PULL THE LEVER</button><button class="btn alt" id="sl-leave">CASH OUT</button></div>
      <div class="mg-hint">SPACE pull • 1/2 bet • ESC cash out</div>`;
    $('sl-b5').onclick = () => { if (!this.spinning) { this.bet = 5; this.render(); } };
    $('sl-b25').onclick = () => { if (!this.spinning) { this.bet = 25; this.render(); } };
    $('sl-pull').onclick = () => this.pull();
    $('sl-leave').onclick = () => this.finish();
    for (let i = 0; i < 3; i++) this.setReel(i, this.reels[i].sym);
    this.render();
  }

  setReel(i, sym, blur = false) {
    const el = $(`sl-r${i}`);
    if (!el) return;
    const k = SYMS.indexOf(sym);
    const above = SYMS[(k + SYMS.length - 1) % SYMS.length], below = SYMS[(k + 1) % SYMS.length];
    el.innerHTML = `<span>${above}</span><span class="mid">${sym}</span><span>${below}</span>`;
    el.classList.toggle('blur', blur);
  }

  pull() {
    if (this.spinning || this.done) return;
    if (this.g.state.money < this.bet) { this.msg = 'Out of quarters. And dignity.'; this.render(); return; }
    this.spinBet = this.bet;
    this.g.spend(this.bet);
    this.net -= this.bet;
    this.g.state.casino.pot += Math.round(this.bet * 0.4);
    this.pulls++;
    // decide the outcome up front, then let the reels roll to it
    let res = [spinSym(), spinSym(), spinSym()];
    if (this.rigged && !this.g.state.quest.flags.c3Jackpot) { // one jackpot per tune-up
      if (this.pulls === 3) res = ['👵', '👵', '👵'];
      else res = ['👵', '👵', pick(['🍋', '🔔', '🍒'])]; // agonizing near-miss
    }
    this.result = res;
    this.spinning = 3;
    this.reels.forEach((r, i) => { r.done = false; r.t = 0; r.stopAt = 0.9 + i * 0.55 + (this.rigged && i === 2 && this.pulls === 3 ? 1.2 : 0); });
    audio.play('click');
    this.msg = pick(['*clunk-clunk-whirrrr*', 'Come on, Gam-Gam...', 'Mama needs a new walker...']);
    this.render();
  }

  payout() {
    const [a, b, c] = this.result;
    let win = 0, jackpot = false;
    if (a === b && b === c) {
      if (a === '👵') { jackpot = true; win = this.g.state.casino.pot; } else win = this.spinBet * PAYS[a];
    } else if ([a, b, c].filter((s) => s === '🍒').length === 2) win = this.spinBet * 2;
    if (win) {
      this.g.addMoney(win, jackpot ? 'GAM-GAM JACKPOT' : 'slots');
      this.net += win;
    }
    if (jackpot) {
      this.g.state.casino.pot = 2500;
      this.g.state.quest.flags.c3Jackpot = true;
      this.g.achievement('jackpot');
      this.msg = `👵👵👵 GAM-GAM JACKPOT!!! ${money(win)}! The machine plays "Wind Beneath My Wings."`;
      audio.play('levelup');
      audio.play('siren');
      this.g.celebrate(6);
      $('mg-box').classList.add('jackpot');
      setTimeout(() => $('mg-box')?.classList.remove('jackpot'), 3000);
    } else if (win) {
      this.msg = `${a === b && b === c ? `Three ${a}!` : 'Two cherries!'} You win ${money(win)}.`;
      audio.play('cash');
    } else {
      this.msg = this.rigged && a === '👵' && b === '👵' ? 'SO CLOSE. Two Gam-Gams. The third one blinked.' : pick(['Nothing.', 'The Gam-Gam is not pleased.', 'Close! (It was not close.)', 'Your pension thanks you for your service.']);
    }
    this.render();
  }

  render() {
    $('sl-pot').textContent = money(this.g.state.casino.pot);
    $('sl-bank').textContent = `Bank ${money(this.g.state.money)}`;
    $('sl-bet').textContent = `Bet ${money(this.bet)}`;
    $('sl-net').textContent = `${this.net >= 0 ? '+' : ''}${money(this.net)} tonight`;
    $('sl-msg').textContent = this.msg;
    $('sl-b5').classList.toggle('sel', this.bet === 5);
    $('sl-b25').classList.toggle('sel', this.bet === 25);
  }

  update(dt, input) {
    if (this.done) return;
    if (this.spinning) {
      this.reels.forEach((r, i) => {
        if (r.done) return;
        r.t += dt;
        if (r.t >= r.stopAt) {
          r.done = true;
          this.setReel(i, this.result[i]);
          audio.play('thud', { vol: 0.5 });
          if (--this.spinning === 0) this.payout();
        } else if (Math.floor(r.t * 18) !== Math.floor((r.t - dt) * 18)) this.setReel(i, SYMS[Math.floor(Math.random() * SYMS.length)], true);
      });
      return;
    }
    if (input.rawHit('Escape') || input.rawHit('PadB')) return this.finish();
    if (input.rawHit('Space') || input.rawHit('Enter') || input.rawHit('PadA')) this.pull();
    if (input.rawHit('Digit1')) { this.bet = 5; this.render(); }
    if (input.rawHit('Digit2')) { this.bet = 25; this.render(); }
  }

  finish() {
    if (this.done || this.spinning) return;
    this.done = true;
    this.g.endMinigame();
    if (this.onDone) this.onDone({ net: this.net });
  }
}

// ---------------------------------------------------------------- The Captain's safe
// Turn the dial (A/D or the arrows). The stethoscope meter swells near each number and the
// tumbler clicks. Press SPACE to set it. Three numbers before the deckhands finish their smoke break.
export class SafeCrack {
  constructor(game, { time = 60, onDone } = {}) {
    this.g = game;
    this.onDone = onDone;
    this.combo = [rand(5, 95), rand(5, 95), rand(5, 95)].map(Math.round);
    this.k = 0;
    this.dial = 0;
    this.vel = 0;
    this.time = time;
    this.btn = 0;
    this.lastTick = 0;
    this.msg = 'Turn the dial. Listen for the click. SPACE to set each number.';
    box().onclick = null;
    box().innerHTML = `
      <div class="mg-title">🔐 THE CAPTAIN'S SAFE 🔐</div>
      <div class="mg-sub">A 1962 Mosler. The Captain's password is probably his boat's name. It isn't.</div>
      <div class="safe-wrap">
        <div class="safe-dial" id="sf-dial">${Array.from({ length: 50 }, (_, i) => `<i style="transform:rotate(${i * 7.2}deg)" class="${i % 5 ? '' : 'big'}">${i % 5 ? '' : `<b style="transform:rotate(${-i * 7.2}deg)">${i * 2}</b>`}</i>`).join('')}<div class="safe-knob"></div></div>
        <div class="safe-side">
          <div class="safe-marker">▼</div>
          <div class="safe-read" id="sf-read">00</div>
          <div class="safe-steth">🩺<div class="safe-meter"><div id="sf-meter"></div></div></div>
          <div class="safe-set" id="sf-set"></div>
          <div class="safe-time" id="sf-time"></div>
        </div>
      </div>
      <div class="mg-msg" id="sf-msg"></div>
      <div class="bj-btns"><button class="btn" id="sf-l">◀</button><button class="btn big" id="sf-go">SET NUMBER</button><button class="btn" id="sf-r">▶</button></div>
      <div class="mg-hint">A/D turn (hold SHIFT for fine control) • SPACE set • ESC bail</div>`;
    const hold = (el, v) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.btn = v; });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => { this.btn = 0; });
    };
    hold($('sf-l'), -1);
    hold($('sf-r'), 1);
    $('sf-go').onclick = () => this.set();
    this.render();
  }

  dist() {
    const d = Math.abs(((this.dial - this.combo[this.k]) % 100 + 100) % 100);
    return Math.min(d, 100 - d);
  }

  set() {
    if (this.done) return;
    if (this.dist() <= 1.2) {
      this.k++;
      audio.play('thud', { vol: 0.8 });
      if (this.k >= 3) return this.finish(true);
      this.msg = `*CLUNK* Tumbler ${this.k} drops. ${3 - this.k} to go.`;
    } else {
      this.time -= 4;
      audio.play('fail');
      this.msg = pick(['Nope. The dial clacks. Somebody on deck says "you hear that?"', 'Wrong. You lose a few seconds wiping sweat off the dial.', 'Nothing. Your hearing aid whistles.']);
    }
    this.render();
  }

  render() {
    const n = Math.round(((this.dial % 100) + 100) % 100);
    $('sf-dial').style.transform = `rotate(${-this.dial * 3.6}deg)`;
    $('sf-read').textContent = String(n).padStart(2, '0');
    $('sf-meter').style.width = `${Math.max(0, 1 - this.dist() / 12) * 100}%`;
    $('sf-set').innerHTML = [0, 1, 2].map((i) => `<span class="${i < this.k ? 'ok' : ''}">${i < this.k ? String(this.combo[i]).padStart(2, '0') : '??'}</span>`).join(' - ');
    $('sf-time').textContent = `⏱ ${Math.max(0, Math.ceil(this.time))}s`;
    $('sf-msg').textContent = this.msg;
  }

  update(dt, input) {
    if (this.done) {
      this.endT -= dt;
      if (this.endT <= 0 && !this.closed) {
        this.closed = true;
        if (this.onDone) this.onDone(this.ok); // open the vault dialogue first so the mouse isn't re-locked under it
        this.g.endMinigame();
      }
      return;
    }
    this.time -= dt;
    if (this.time <= 0) return this.finish(false);
    if (input.rawHit('Escape') || input.rawHit('PadB')) return this.finish(false);
    const pad = input.pad ? input.pad.axes[0] : 0;
    const dir = clamp((input.down.has('KeyD') || input.down.has('ArrowRight') || input.down.has('PadRight') ? 1 : 0) - (input.down.has('KeyA') || input.down.has('ArrowLeft') || input.down.has('PadLeft') ? 1 : 0) + this.btn + pad, -1, 1);
    const fine = input.down.has('ShiftLeft') || input.down.has('ShiftRight');
    const want = dir * (fine ? 6 : 26);
    this.vel += (want - this.vel) * Math.min(1, dt * 10);
    this.dial += this.vel * dt;
    // tick sounds as the dial passes numbers; a louder click right on the number
    const whole = Math.floor(this.dial);
    if (whole !== this.lastTick) {
      this.lastTick = whole;
      const near = this.dist() < 1.2;
      audio.tone({ freq: near ? 1900 : 900, type: 'square', dur: 0.015, vol: near ? 0.2 : 0.04 });
    }
    if (input.rawHit('Space') || input.rawHit('Enter') || input.rawHit('PadA')) this.set();
    this.render();
  }

  finish(ok) {
    if (this.done) return;
    this.done = true;
    this.msg = ok ? '*The door swings open. It smells like cigars and other people\'s pensions.*' : 'The deckhands are coming back. You bail.';
    this.render();
    audio.play(ok ? 'levelup' : 'sadTrombone');
    if (ok) this.g.achievement('safecracker');
    this.ok = ok;
    this.endT = 1.6;
  }
}
