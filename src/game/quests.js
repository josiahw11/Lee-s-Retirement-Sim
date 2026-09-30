// Chapter 1 story chain + free-roam goals afterwards.
import { money } from '../core/utils.js';
import { CH2 } from './chapter2.js';

const poi = (id) => (g) => g.world.pois[id];

export const STEPS = [
  {
    id: 'cart', title: 'Hop in your golf cart [E]',
    target: (g) => (g.player.cart ? null : g.playerCart),
    done: (g) => g.player.cart === g.playerCart,
    start: (g) => g.ui.hint('WASD to walk • Mouse or RIGHT-DRAG to look • E to get in your cart', 7),
  },
  {
    id: 'beer', title: 'Buy beer at the Liquor Barrel',
    target: poi('liquor'),
    done: (g) => g.state.quest.flags.boughtBeer,
    start: (g) => g.ui.hint('Drive: W/S gas & brake • A/D steer • SPACE drift • R radio • H horn', 8),
    reward: (g) => g.xp('cha', 1),
  },
  {
    id: 'drink', title: 'Crack a cold one open [B]',
    done: (g) => g.state.counters.beers >= 1,
    hint: 'Press B. Yes, even while driving.',
    reward: (g) => g.xp('str', 1),
  },
  {
    id: 'gus', title: 'Ask Gus at the Pro Shop about making money',
    target: poi('proshop'),
    done: (g) => g.state.quest.flags.metGus,
  },
  {
    id: 'balls', title: 'Collect & sell 10 golf balls to Gus',
    hint: 'Balls are scattered on the course & in ponds. Buy a bucket!',
    target: (g) => (g.state.inv.balls >= Math.min(10, g.ballCap()) ? g.world.pois.proshop : g.nearestBall()),
    done: (g) => g.state.counters.ballsSold >= 10,
    reward: (g) => { g.addMoney(40, 'quest bonus'); },
  },
  {
    id: 'doc', title: 'Find "Doc" behind the maintenance shed',
    target: poi('doc'),
    done: (g) => g.state.quest.flags.metDoc,
  },
  {
    id: 'deal', title: 'Sell 5 Blue Boys 💊 to residents',
    hint: 'Look for residents with a 💊 over their heads. Avoid Security & Karen.',
    target: (g) => (g.state.inv.pills > 0 ? g.nearestCustomer('pills') : g.world.pois.doc),
    done: (g) => g.state.counters.pillsSold >= 5,
    reward: (g) => { g.xp('cha', 2); g.ui.hint('Restock at Doc\'s van. Rhino Horn Tea sells for 3x more...', 6); },
  },
  {
    id: 'flirt', title: 'Sweet-talk a lady (Doris is by the pool)',
    hint: 'Beer gives liquid courage (+CHA). Too much and you slur.',
    target: (g) => g.named.doris,
    done: (g) => Object.values(g.state.romance).some((r) => r.aff >= 30),
  },
  {
    id: 'chip', title: 'Chip Wainwright III wants "a word" at the Pro Shop',
    target: (g) => g.named.chip,
    start: (g) => g.toast('📱 Text from Gus: "Chip\'s asking about you. Watch yourself."', 'quest', 6),
    done: (g) => g.state.quest.flags.beatChip,
    reward: (g) => { g.xp('intim', 3); g.addMoney(100, 'Chip\'s wallet'); },
  },
  {
    id: 'cartwar', title: 'Take over a beverage cart on the course',
    hint: 'Beverage carts loop the cart paths. Get out & talk to the operator.',
    target: (g) => g.nearestUnownedCart(),
    done: (g) => g.state.counters.cartsTaken >= 1,
    reward: (g) => g.ui.hint('Keep your carts stocked with Blue Boys & Rhino Tea for passive income.', 6),
  },
  {
    id: 'pimp', title: "Pimp your ride at Sal's Cart Customs",
    target: poi('sal'),
    done: (g) => g.cartModCount() >= 1,
  },
  {
    id: 'hoa', title: 'Seize the HOA: run for President — or find dirt on Karen',
    hint: 'Register at the HOA Office & campaign, or blackmail Karen (dumpster at night / Linda).',
    target: poi('hoa'),
    done: (g) => g.state.hoa.president || g.state.hoa.puppet,
    reward: (g) => g.chapterComplete(),
  },
];

STEPS.push(...CH2);

const FREE = [
  { id: 'tammy', title: 'LEGEND: Win over Tammy the Cart Girl', done: (g) => g.state.romance.tammy.conquest, target: (g) => g.named.tammy },
  { id: 'carts', title: 'Control all 3 beverage carts', done: (g) => g.concession.every((c) => c.state.owned), target: (g) => g.nearestUnownedCart() },
  { id: 'crew', title: 'Recruit a crew of 3 retirees', done: (g) => g.gang().length >= 3, hint: 'Recruits hang around the parks & clubhouse.' },
  { id: 'rich', title: `Become a millionaire (${money(1000000)})... or at least ${money(10000)}`, done: (g) => g.state.money >= 10000 },
];

export class Quests {
  constructor(game) {
    this.g = game;
    this._t = 0;
  }

  current() {
    const q = this.g.state.quest;
    if (q.step < STEPS.length) return STEPS[q.step];
    return FREE.find((f) => !f.done(this.g)) || null;
  }

  begin() {
    const s = this.current();
    if (s && s.start && !this.g.state.quest.started?.[s.id]) {
      this.g.state.quest.started = this.g.state.quest.started || {};
      this.g.state.quest.started[s.id] = true;
      s.start(this.g);
    }
  }

  update(dt) {
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.3;
    const g = this.g;
    const q = g.state.quest;
    if (q.step < STEPS.length) {
      const s = STEPS[q.step];
      if (s.done(g)) {
        q.step++;
        g.onQuestComplete(s);
        if (s.reward) s.reward(g);
        this.begin();
      }
    }
  }
}
