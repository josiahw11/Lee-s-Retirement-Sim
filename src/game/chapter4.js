// Chapter 4: "Crash Course" — Karen hires Buck Thunderhill, a washed-up stock-car driver, as Sunset
// Palms' "Head of Cart Safety". He's impounding carts (and Earl's scooter). Beat him at his own game:
// the Bumper Brawl, the Senior Shuttle, the Duck Pond jump, and a $500 Grand Prix.
import { audio } from '../core/audio.js';
import { pick } from '../core/utils.js';

const F = (g) => g.state.quest.flags;
const BUCK = { x: -14, z: 42 };

// counters are measured from when a step begins, so earlier free play doesn't count
const base = (k) => (g) => { F(g).c4base ||= {}; F(g).c4base[k] = g.state.counters[k] || 0; };
const more = (k) => (g) => (g.state.counters[k] || 0) > ((F(g).c4base || {})[k] ?? 0);

export const CH4 = [
  {
    id: 'c4_buck', title: 'CHAPTER 4 — Meet Buck Thunderhill, Karen\'s new "Head of Cart Safety" (clubhouse lot)',
    hint: 'He\'s the one in the racing jacket, writing tickets.',
    target: (g) => g.named.buck,
    start: (g) => {
      spawnBuck(g);
      g.after(6, () => g.ui.splash('CHAPTER 4', 'CRASH COURSE', 4, '#ff6b1a'));
      g.after(8.5, () => g.ui.toast('📱 Text from Millie: "Karen hired some NASCAR has-been as HEAD OF CART SAFETY. He impounded Earl\'s scooter! With Earl still ON it! He\'s at the clubhouse lot."', 'quest', 9));
    },
    done: (g) => F(g).c4Met,
  },
  {
    id: 'c4_derby', title: 'Beat Buck at the Bumper Brawl (nightly 5PM–1AM, behind the Liquor Barrel)',
    hint: 'Derby Dan runs it from Fairway Dr. Front bumpers are armored — hit them in the SIDE.',
    target: () => ({ x: 205, z: -39 }),
    start: (g) => { base('derbyWins')(g); buckLeaves(g, 'See you in the dirt tonight, grandpa!'); }, // he's at the arena
    done: more('derbyWins'),
    reward: (g) => g.ui.toast('📱 Buck: "Lucky. Real lucky. But the neighbors still think you\'re a menace. I made sure of it."', 'heat', 7),
  },
  {
    id: 'c4_shuttle', title: 'Win the neighborhood back: deliver 4 fares in one Senior Shuttle shift',
    hint: 'Dispatcher Doris is in the clubhouse lot. Speedy deliveries add time to the clock.',
    target: () => ({ x: -31, z: 47 }),
    start: (g) => { base('bigShifts')(g); spawnBuck(g); },
    done: more('bigShifts'),
    reward: (g) => g.ui.toast('📱 Millie: "Mabel says you drive like a lunatic and she\'s never felt more alive. Buck is FUMING. He says nobody can clear the Duck Pond. Nobody."', 'quest', 8),
  },
  {
    id: 'c4_stunt', title: 'Buck says nobody can clear the Duck Pond. Clear it.',
    hint: 'The Duck Pond Clearance ramp is on the west bank. You\'ll need Sal\'s governor removal AND nitrous.',
    target: () => ({ x: -140, z: 10 }),
    start: (g) => { base('duckClears')(g); spawnBuck(g); },
    done: more('duckClears'),
    reward: (g) => g.ui.toast('📱 Buck: "...Fine. FINE. One race. Rocket Ron\'s big-money Grand Prix. Winner takes the impound lot. Loser leaves Sunset Palms."', 'heat', 8),
  },
  {
    id: 'c4_race', title: 'Final showdown: beat Buck in Rocket Ron\'s $500 Grand Prix',
    hint: 'Ron is in the clubhouse lot. Nitrous. Governor off. No mercy.',
    target: (g) => g.named.ron,
    start: (g) => { base('bigRacesWon')(g); buckLeaves(g, 'Warming up the engine. See you at the start line.'); }, // he's on the grid
    done: more('bigRacesWon'),
    reward: (g) => {
      spawnBuck(g);
      g.addMoney(1500, 'Buck\'s impound lot, liquidated');
      g.achievement('crashcourse');
      g.celebrate?.(20);
      g.ui.splash('CHAPTER 4 COMPLETE', 'Buck resigns. Every impounded cart goes home. Earl gets his scooter back (and is still on it).', 7, '#ff6b1a');
      audio.play('levelup');
      const b = g.named.buck;
      if (b) b.say('You\'re the real deal, old timer. Talladega never had a driver like you. Or a Karen like this.', 4);
    },
  },
];

export function chapter4Started(g, STEPS) {
  const i = STEPS.findIndex((s) => s.id === 'c4_buck');
  return i >= 0 && g.state.quest.step >= i;
}

// he says his piece, strolls off toward Palm Blvd, and is gone before you catch up
function buckLeaves(g, line) {
  const b = g.named.buck;
  if (!b || !g.npcs.includes(b)) { g.named.buck = null; return; }
  g.named.buck = null;
  b.say(line, 3);
  b.state = 'walkTo';
  b.target = { x: b.x + 30, z: 62 };
  g.after(10, () => { if (g.npcs.includes(b)) g.removeNPC(b); });
}

// on load: Buck is in the lot unless he's off at the derby or the race
export function buckAround(g, STEPS) {
  const id = g.quests.current()?.id;
  return chapter4Started(g, STEPS) && id !== 'c4_derby' && id !== 'c4_race';
}

export function spawnBuck(g) {
  if (g.named.buck && g.npcs.includes(g.named.buck)) return g.named.buck;
  const b = g.spawnNPC({ name: 'Buck Thunderhill', female: false, role: 'buck', x: BUCK.x, z: BUCK.z, state: 'static', hp: 120, dmg: 12, look: { hat: 'cap', hatColor: '#d62828', shirt: 1, shorts: '#1d1d1d', glasses: 'aviator', mustache: true, skin: '#e0ac8a', hair: '#9a9a9a', belly: 1.2, height: 1.05 }, homePt: { x: BUCK.x, z: BUCK.z } });
  b.data.face = Math.PI;
  b.data.quiet = true;
  g.named.buck = b;
  return b;
}

export function buckNode(g) {
  const f = F(g);
  const step = g.quests.current()?.id;
  if (!f.c4Met) {
    const accept = (line) => () => { f.c4Met = true; audio.play('horn'); return { name: 'Buck Thunderhill', title: 'Head of Cart Safety', text: line, choices: [{ text: 'Leave', action: () => null }] }; };
    return {
      name: 'Buck Thunderhill', title: 'Head of Cart Safety (self-appointed, then Karen-appointed)',
      text: '"Buck Thunderhill. Eleven NASCAR starts, one finish, zero regrets. Karen hired me to clean up these streets. That means YOUR cart, MY impound lot. I heard you think you can drive. Heard wrong."',
      choices: [
        { text: '"You and me. Anywhere. Anytime."', action: accept('"Bumper Brawl. Tonight, behind the strip. I\'ll be the one NOT on fire."') },
        { text: '"Give Earl his scooter back."', action: accept('"Earl was doing nine in an eight zone. Want it back? Beat me. Bumper Brawl, tonight. Bring a helmet."') },
        { text: '"Nice jacket. Did Karen pick it out?"', check: { label: 'CHA', chance: g.chance('cha', 3) }, action: () => { f.c4Met = true; return { name: 'Buck Thunderhill', title: '...', text: g.roll('cha', 3) ? '"...She did, actually. Shut up. Bumper Brawl. TONIGHT."' : '"It\'s VINTAGE. Bumper Brawl, tonight. I\'m going to enjoy this."', choices: [{ text: 'Leave', action: () => null }] }; } },
      ],
    };
  }
  const taunts = {
    c4_derby: ['"See you in the dirt tonight, grandpa. Wear a diaper."', '"My cart\'s got a church pew for a bumper. Two, actually."'],
    c4_shuttle: ['"The neighbors love me. I told them you drive drunk. Was I wrong?"', '"Mabel says you\'re a menace. Mabel\'s never wrong."'],
    c4_stunt: ['"Nobody clears the Duck Pond. Nobody. Not even me. ESPECIALLY not you."', '"Go ahead. The ducks could use a laugh."'],
    c4_race: ['"Five hundred bucks. Winner keeps the impound lot. Loser leaves town."', '"I\'ve been waiting for this since Talladega \'83. Don\'t ask what happened at Talladega \'83."'],
  };
  const text = taunts[step] ? pick(taunts[step]) : pick(['"You won fair and square. Karen\'s furious. Best week of my life."', '"Want to go for a spin sometime? Just a spin. Nothing competitive. ...Unless?"', '"I\'m teaching a defensive-driving class at the clubhouse. Nobody\'s signed up. It\'s because of you."']);
  return { name: 'Buck Thunderhill', title: 'Head of Cart Safety', text, choices: [{ text: 'Leave', action: () => null }] };
}
