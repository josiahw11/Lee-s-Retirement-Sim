// Chapter 3: "High Rollers" — the Lucky Lady casino boat is bleeding Sunset Palms' pensions dry.
// Win at blackjack, bribe the slot mechanic, hit the rigged jackpot, beat the Captain, crack his safe,
// and decide who gets $48,211 in other people's retirement.
import { BOAT } from '../world/casinoboat.js';
import { audio } from '../core/audio.js';
import { pick, money, chance } from '../core/utils.js';

const F = (g) => g.state.quest.flags;
const poi = (id) => (g) => g.world.pois[id];
const C = (g, stat, diff, label) => ({ label: label || stat.toUpperCase().replace('INTIM', 'INT').replace('STAT', 'STA'), chance: g.chance(stat, diff) });
const end = (name, text, title = '') => ({ name, title, text, choices: [{ text: 'Leave', action: () => null }] });
const PENSIONS = 48211;

export function casinoOpen(g) {
  const m = g.state.minutes;
  return m >= 18 * 60 || m < 2 * 60;
}

// ---------------------------------------------------------------- quest steps
export const CH3 = [
  {
    id: 'c3_board', title: 'CHAPTER 3 — Board the Lucky Lady casino boat at the end of Boca Pier (opens 6PM)',
    hint: 'Through the front gate to the beach, then out along the pier.',
    target: poi('casino'),
    start: (g) => {
      g.after(6.5, () => g.ui.splash('CHAPTER 3', 'HIGH ROLLERS', 4, '#ffd166'));
      g.after(9, () => g.ui.toast('📱 Text from Millie: "Half of Flamingo Drive is losing their pension on that casino boat off Boca Pier. Earl bet his DENTURES. Somebody has to do something. Ideally you."', 'quest', 9));
    },
    done: (g) => F(g).c3Boarded,
  },
  {
    id: 'c3_bj', title: "Win $250 in winning hands at Bernadette's blackjack table",
    hint: 'Charm (CHA 4+) makes Bernadette careless with her hole card. Beer makes YOU careless.',
    target: poi('casino'),
    done: (g) => (g.state.counters.bjWon || 0) >= 250,
    reward: (g) => g.ui.toast('📱 Unknown number: "Nice hands. The slots, though? Rigged tighter than my ex-wife. Stern deck. Ask for Fingers."', 'quest', 8),
  },
  {
    id: 'c3_fingers', title: 'Find "Fingers" Fanucci, the slot mechanic, on the stern deck',
    target: (g) => g.named.fingers,
    done: (g) => F(g).fingersDeal,
  },
  {
    id: 'c3_jackpot', title: 'Hit the Golden Gam-Gam jackpot on machine #3',
    hint: 'Fingers "adjusted" it. Keep pulling.',
    target: poi('casino'),
    done: (g) => F(g).c3Jackpot,
  },
  {
    id: 'c3_captain', title: 'Captain Moretti wants a word. On the bow. Now.',
    target: (g) => g.named.captain,
    start: (g) => g.ui.toast('📱 Fingers: "He saw the jackpot. He knows. Bow deck. Bring a helmet."', 'heat', 7),
    done: (g) => F(g).beatCaptain,
  },
  {
    id: 'c3_vault', title: "Crack the Captain's safe (cabin door, bow end of the saloon)",
    target: poi('cabin'),
    done: (g) => F(g).vaultChoice,
    reward: (g) => {
      g.celebrate(24, BOAT.x1 - 10, (BOAT.z0 + BOAT.z1) / 2);
      const ch = F(g).vaultChoice;
      g.ui.splash('CHAPTER 3 COMPLETE', ch === 'return' ? 'The pensions are home. Sunset Palms will name a bench after you. Probably.' : ch === 'keep' ? "You're the richest man in Sunset Palms and the most wanted. Worth it." : 'Half for them, half for you. Moral flexibility: the retiree\'s superpower.', 7, '#ffd166');
      audio.play('levelup');
    },
  },
];

// ---------------------------------------------------------------- the crew
export function spawnBoatCrew(g) {
  const H = BOAT.h;
  const cap = g.spawnNPC({ name: 'Captain Dom Moretti', female: false, role: 'captain', x: BOAT.captain.x, z: BOAT.captain.z, state: 'static', hp: 300, dmg: 17, look: { hat: 'captain', shirt: 6, shorts: '#1d2b53', glasses: 'aviator', mustache: true, skin: '#d9a07c', hair: '#1c1c1c', belly: 1.25, height: 1.06 }, homePt: { x: BOAT.captain.x, z: BOAT.captain.z } });
  cap.data.face = -Math.PI / 2;
  cap.data.quiet = true;
  g.named.captain = cap;
  const fin = g.spawnNPC({ name: '"Fingers" Fanucci', female: false, role: 'mechanic', x: BOAT.stern.x, z: BOAT.stern.z, state: 'static', look: { hat: 'cap', hatColor: '#3a3a3a', shirt: 6, shorts: '#4a5a7a', glasses: 'readers', mustache: false, skin: '#e8b996', hair: '#9a9a9a', belly: 0.95 }, homePt: { x: BOAT.stern.x, z: BOAT.stern.z } });
  fin.data.face = Math.PI / 2;
  fin.data.quiet = true;
  g.named.fingers = fin;
  g.deckhands = [[BOAT.door.x - 2.2, BOAT.door.z - 0.2], [BOAT.door.x + 2.2, BOAT.door.z - 0.2], [BOAT.captain.x - 2.5, BOAT.captain.z - 3.5]].map(([x, z], i) => {
    const n = g.spawnNPC({ name: ['Deckhand Tony', 'Deckhand Rocco', 'Deckhand Sal Jr.'][i], female: false, role: 'deckhand', x, z, state: 'static', hp: 95, dmg: 11, look: { hat: 'cap', hatColor: '#1d2b53', shirt: 6, shorts: '#1d2b53', glasses: 'none', belly: 1.2, height: 1.07, skin: pick(['#e8b996', '#c68863', '#f1c7a5']) }, homePt: { x, z } });
    n.data.face = i < 2 ? Math.PI : -Math.PI / 2;
    n.data.quiet = true;
    return n;
  });
  // high rollers taking the sea air along the rail
  [[486, 25.9, Math.PI], [505, 25.9, Math.PI], [490, 36.1, 0], [502, 36.1, 0], [478, 31, -Math.PI / 2]].forEach(([x, z, face], i) => {
    const n = g.spawnNPC({ female: i % 2 === 0, role: 'patron', x, z, state: 'static', look: { glasses: 'big' }, homePt: { x, z } });
    n.data.face = face;
    n.data.quiet = chance(0.5);
  });
  void H;
}

// ---------------------------------------------------------------- the casino floor
export function casinoNode(g) {
  const f = F(g);
  if (!casinoOpen(g)) {
    return end('Lucky Lady Casino', pick([
      '*A sign on the door: "CLOSED. OPENS AT 6PM. Early bird shrimp cocktail 5:45." A deckhand is mopping something you don\'t want to think about.*',
      '*"We open at six, pops. Go take a nap. Come back with your pension check."* — Deckhand Tony',
    ]), 'Closed until 6PM');
  }
  if (!f.c3Boarded) {
    f.c3Boarded = true;
    audio.play('cash');
  }
  const flirt = g.state.stats.cha.lvl >= 4;
  return {
    name: 'The Lucky Lady Casino', title: `Open till 2AM • Jackpot ${money(g.state.casino?.pot || 2500)}`,
    text: pick([
      '*Carpet the color of a bad decision. Slot machines ding like a hospital heart monitor. A lounge singer is doing Sinatra, badly, for eleven people who all seem to be named Marv.*',
      '*The air is 40% cigar smoke, 60% Jean Naté. Every seat at the Gam-Gam machines is taken by someone\'s grandmother. None of them have blinked since Tuesday.*',
    ]) + (flirt ? '\n\nBernadette the dealer catches your eye and pats the empty stool next to her. 😉' : ''),
    choices: [
      { text: "Blackjack at Bernadette's table", tag: '$10–$100', disabled: g.state.money < 10, action: () => { g.startMinigame('blackjack', { dealer: 'Bernadette' }); g.ui.closeDialogue(); return 'keep'; } },
      { text: f.fingersDeal && !f.c3Jackpot ? 'Play Golden Gam-Gam machine #3 (Fingers\' special)' : 'Play the Golden Gam-Gam slots', tag: '$5 / $25', disabled: g.state.money < 5, action: () => { g.startMinigame('slots', { rigged: !!(f.fingersDeal && !f.c3Jackpot) }); g.ui.closeDialogue(); return 'keep'; } },
      { text: 'Bar: a Bushwacker (frozen, lethal)', tag: money(9), disabled: g.state.money < 9, action: () => { g.spend(9); g.state.buzz = Math.min(100, g.state.buzz + 22); g.state.bladder = Math.min(100, g.state.bladder + 10); audio.play('drink'); return end('The Lucky Lady Bar', pick(['*It tastes like a milkshake that owes money to the mob.* (+buzz)', '*The bartender says "easy, champ" as you drink it in one go.* (+buzz)'])); } },
      { text: 'Leave', action: () => null },
    ],
  };
}

// ---------------------------------------------------------------- characters
export function talkFingers(g, n) {
  const f = F(g);
  if (f.fingersDeal) return end(n.name, f.c3Jackpot ? '"Nice pull. Now get off this boat before the Captain gets a look at the tape."' : '"Machine #3. Keep pulling. Third time\'s the charm. Don\'t make eye contact with the Gam-Gam."', 'Slot Mechanic');
  const met = f.c3Fingers;
  f.c3Fingers = true;
  const deal = (why) => { f.fingersDeal = true; audio.play('success'); return end(n.name, `${why}\n\n"Machine number three. I'll loosen her up. Give it three pulls. And you didn't hear it from me — you heard it from a guy who looked like me."`, 'Slot Mechanic'); };
  return {
    name: n.name, title: 'Slot Mechanic • smokes 4 packs a day, sells none',
    text: met ? '"You again. Got something for my... circulation?"' : `*He flicks a cigarette into the ocean without looking.*\n\n"The Gam-Gams pay out one percent. ONE. The Captain keeps a safe full of pension checks he 'holds' for the high rollers who go broke. Forty-eight grand, give or take a dead guy's Social Security.\n\nI can loosen one machine. For a price. My doctor says I need something for my... circulation."`,
    choices: [
      { text: 'Slip him a Rhino Horn Tea 🍵', disabled: g.state.inv.tea <= 0, tag: g.state.inv.tea > 0 ? `you have ${g.state.inv.tea}` : 'none', action: () => { g.state.inv.tea--; return deal('*He drinks the whole thing. His eyes widen. He stands up very straight.* "OH. Oh, that\'s... that\'s the good stuff."'); } },
      { text: 'Bribe him', tag: money(200), disabled: g.state.money < 200, action: () => { g.spend(200); return deal('*He pockets the cash so fast it technically never existed.*'); } },
      { text: '"Help me or I tell the Captain you smoke by the fuel tanks."', check: C(g, 'intim', 5), action: () => {
        if (g.roll('intim', 5)) return deal('*He goes pale.* "...Fine. FINE. You play dirty. I respect that."');
        return end(n.name, '"The Captain KNOWS I smoke by the fuel tanks. It\'s his favorite spot too. Come back with something useful."', 'Slot Mechanic');
      } },
      { text: 'Leave', action: () => null },
    ],
  };
}

export function talkDeckhand(g, n) {
  if (F(g).beatCaptain) return end(n.name, pick(['"Hey, no hard feelings about the whole... throwing-you-overboard thing. Or you throwing us. I lost track."', '"Captain\'s in his cabin crying. Don\'t go in there. Or do. I\'m not your boss."']), 'Deckhand');
  return end(n.name, casinoOpen(g) ? pick([
    '"Welcome aboard the Lucky Lady. No cameras, no refunds, no swimming back."',
    '"Dress code is pants. Pants OPTIONAL after midnight."',
    '"You look like a winner. Winners tip the deckhands."',
  ]) : pick(['"Casino opens at six. Beat it."', '"We\'re closed, pops. Come back tonight with your wallet."']), 'Lucky Lady Crew');
}

export function talkPatron(g, n) {
  return end(n.name, pick([
    '"I\'ve put eleven thousand dollars into Gam-Gam machine four. She\'s DUE."',
    '"My son thinks I\'m at bridge club. I am at bridge club. It\'s a floating bridge club with slots."',
    '"The shrimp cocktail is free if you lose over five hundred. I\'ve had a LOT of shrimp."',
    '"The Captain holds my pension checks for me. For safekeeping. That\'s normal, right?"',
    '"I won once, in 1998. I\'ve been chasing that feeling ever since."',
  ]), 'High Roller');
}

export function talkCaptain(g, n) {
  const f = F(g);
  if (f.beatCaptain) return end(n.name, f.vaultChoice ? '"You took my pension fund. You took my DIGNITY. ...Would you like to buy a slightly used riverboat?"' : '"My cabin\'s locked. My safe is locked. My heart is locked. Leave me alone."', 'Former Captain');
  const q = g.quests.current();
  if (!q || q.id !== 'c3_captain') {
    return end(n.name, pick([
      '"Welcome aboard, my friend! The Lucky Lady: where every retiree is a high roller until they aren\'t."',
      '"Ever notice how the ocean never judges you? Unlike your children. Play the slots."',
      '"Pension troubles? I HOLD pension checks for our valued guests. Safekeeping. Very legal. Mostly legal."',
    ]), 'Captain of the Lucky Lady');
  }
  return {
    name: n.name, title: 'Captain • Casino Owner • Pension "Custodian"',
    text: `*He's peeling an orange with a knife that's way too big for an orange.*\n\n"Machine three hasn't paid out since the Carter administration. Then YOU sit down and it plays 'Wind Beneath My Wings.' You and Fingers. Very cute.\n\nOn my boat, cheaters leave two ways: broke, or wet. Your choice, ${g.state.name}."`,
    choices: [
      { text: '"Double or nothing. You and me. Blackjack. Loser goes overboard."', tag: 'first to 3 hands • $100/hand', disabled: g.state.money < 100, action: () => {
        g.startMinigame('blackjack', { duel: { need: 3 }, stake: 100, onDone: (r) => (r.won ? captainBeaten(g, 'cards') : overboard(g)) });
        g.ui.closeDialogue();
        return 'keep';
      } },
      { text: '"Fight me. Winner keeps the boat."', tag: 'boss fight', action: () => { captainFight(g); return null; } },
      { text: '"Nice pension safe. Shame if the Coast Guard saw it."', check: C(g, 'intim', 7), action: () => {
        if (g.roll('intim', 7)) { captainBeaten(g, 'bluff'); return end(n.name, '*The knife stops mid-peel.*\n\n"...The Coast Guard. You wouldn\'t." *You would.* "Fine. FINE. Get off my bow. My cabin is... unlocked. For no reason."', 'Captain'); }
        return end(n.name, '"The Coast Guard commander plays blackjack here every Thursday. He owes me a boat." *He smiles. It\'s not a nice smile.*', 'Captain');
      } },
      { text: 'Back away slowly', action: () => null },
    ],
  };
}

function captainFight(g) {
  const cap = g.named.captain;
  cap.data.boss = true;
  g.startBrawl([cap, ...g.deckhands], 'BOSS FIGHT', 'Captain Moretti & the deckhands', () => captainBeaten(g, 'fists'));
}

function captainBeaten(g, how) {
  const f = F(g);
  if (f.beatCaptain) return;
  f.beatCaptain = true;
  const cap = g.named.captain;
  cap.data.retreatAfterKO = true;
  for (const d of g.deckhands) d.data.retreatAfterKO = true;
  g.xp('intim', 3);
  g.xp('stat', 3);
  if (how === 'cards') g.ui.splash('YOU BEAT THE HOUSE', 'The Captain throws his hat into the Atlantic. His cabin keys go with it. (He has a spare. It\'s under the mat.)', 4, '#ffd166');
  g.after(1.5, () => cap.say(pick(['My boat... my beautiful boat...', 'I have friends in Atlantic City!', 'Nobody touches the safe! ...Nobody listens to me.']), 3));
}

// Loser goes overboard: splash, fade, wash up on the beach missing a shoe.
function overboard(g) {
  const p = g.player;
  g.state.counters.overboard = (g.state.counters.overboard || 0) + 1;
  g.achievement('overboard');
  audio.play('splash');
  g.particles.burst('drop', p.x, p.y + 0.5, p.z + 3, 40, { speed: 4, up: 7, life: 1.4, size: 0.3, gravity: 12 });
  g.fadeOut(() => {
    g.teleport(420, 30 + Math.random() * 20);
    g.state.buzz = Math.max(0, g.state.buzz - 30);
  }, 2.2, 'OVERBOARD', 'The deckhands threw you off the stern. You wash up on Boca Beach, missing a shoe. Try again.', '#4cc9f0');
}

// ---------------------------------------------------------------- the captain's cabin + the choice
export function cabinNode(g) {
  const f = F(g);
  if (!f.beatCaptain) return end("Captain's Cabin", '*A brass plate: "CAPTAIN — PRIVATE — THIS MEANS YOU, EARL." The door is locked, and a deckhand is watching you look at it.*', 'Locked');
  if (f.vaultChoice) return end("Captain's Cabin", '*The safe hangs open, empty except for a signed photo of Wayne Newton and a single butterscotch candy. You take the candy.*', 'Empty');
  if (f.vaultOpen) return vaultChoiceNode(g);
  return {
    name: "Captain's Cabin", title: 'A 1962 Mosler safe',
    text: '*Wood paneling, a stuffed marlin, and a framed photo of the Captain shaking hands with a man who is definitely in witness protection. Behind the marlin: the safe.*',
    choices: [
      { text: 'Crack the safe', tag: 'listen for the click', action: () => {
        g.startMinigame('safe', { time: 60, onDone: (ok) => {
          if (ok) { f.vaultOpen = true; g.ui.openDialogue(vaultChoiceNode(g)); } else g.ui.toast('🔐 The deckhands are back from their smoke break. Try again in a minute.', 'heat', 4);
        } });
        g.ui.closeDialogue();
        return 'keep';
      } },
      { text: 'Leave', action: () => null },
    ],
  };
}

function vaultChoiceNode(g) {
  const f = F(g);
  const choose = (kind) => () => {
    f.vaultChoice = kind;
    const s = g.state;
    if (kind === 'return') {
      g.addMoney(2000, 'a reward from grateful residents');
      g.xp('stat', 8);
      g.xp('cha', 3);
      for (const r of Object.values(s.romance)) r.aff = Math.min(100, (r.aff || 0) + 10);
      s.hoa.votes = (s.hoa.votes || 0) + 25;
      g.achievement('robinhood');
      return end('The Pensions', `*You spend the night stuffing envelopes into mailboxes up and down Flamingo Drive. By morning, the whole community is crying, hugging, and — in Earl's case — putting his dentures back in.*\n\n+${money(2000)} reward • +Status • every lady's heart grows three sizes`);
    }
    if (kind === 'keep') {
      g.addMoney(PENSIONS, "the Captain's safe");
      g.addHeat(3.5, 'Pension heist');
      g.achievement('kingpin');
      return end('The Pensions', `*${money(PENSIONS)}. In cash. In a duffel bag that says "WORLD'S BEST GRANDPA."*\n\n*Somewhere, a very old woman is going to have to switch to generic cat food. You try not to think about it. You mostly succeed.*`);
    }
    g.addMoney(Math.round(PENSIONS / 2), 'half the pensions');
    g.xp('stat', 3);
    g.addHeat(1.2, 'Suspicious generosity');
    return end('The Pensions', '*Half go back in the mailboxes with little notes that say "from a friend." Half go in your recliner. The recliner is very comfortable now.*');
  };
  return {
    name: "The Captain's Safe", title: `${money(PENSIONS)} in "held" pension checks`,
    text: `*Stacks of pension checks, rubber-banded by name. Doris Kaplan. Earl Finkbeiner. Millie Rausch. Walker Wallace. Bundles and bundles of other people's golden years.*\n\n*This is the part of the movie where the hero makes a choice.*`,
    choices: [
      { text: 'Return every pension to its owner', tag: 'HERO', action: choose('return') },
      { text: 'Split it. Half back, half for you.', tag: 'ANTIHERO', action: choose('split') },
      { text: 'Keep all of it', tag: 'VILLAIN', action: choose('keep') },
    ],
  };
}

// ---------------------------------------------------------------- reviewer shortcut: jump to a chapter
export function jumpToChapter(g, n, STEPS) {
  const s = g.state;
  const f = s.quest.flags;
  const ids = { 2: 'c2_doc', 3: 'c3_board' };
  const idx = STEPS.findIndex((x) => x.id === ids[n]);
  if (idx < 0) return;
  Object.assign(f, { metGus: true, metDoc: true, beatChip: true, boughtBeer: true });
  if (n >= 3) f.c2Doc = true;
  else for (const k of ['c2Doc', 'teaShortage', 'homebrew', 'testBatch', 'beatDeuce']) delete f[k];
  // replaying a chapter starts it clean
  for (const k of ['c3Boarded', 'c3Fingers', 'fingersDeal', 'c3Jackpot', 'beatCaptain', 'vaultOpen', 'vaultChoice']) delete f[k];
  s.counters.bjWon = 0;
  delete s.flags.gazVault;
  delete s.flags.gazJackpot;
  s.hoa.president = s.hoa.president || n >= 2;
  if (n >= 3) Object.assign(f, { teaShortage: true, homebrew: true, testBatch: true, beatDeuce: true });
  s.inv.tea = Math.max(s.inv.tea, 3);
  s.inv.beer = Math.max(s.inv.beer, 6);
  s.money = Math.max(s.money, 1500);
  s.counters.beers = Math.max(1, s.counters.beers);
  s.quest.step = idx;
  s.quest.started = {};
  if (n >= 3) s.minutes = 17 * 60 + 40; // just before the boat opens
  g.quests.begin();
  g.ui.toast(`⏭️ Jumped to Chapter ${n}. Progress before it was filled in.`, 'quest', 5);
}
