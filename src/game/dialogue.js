// Every conversation in Sunset Palms. Nodes: {name, title, text, choices:[{text, check, tag, disabled, action}]}
import { SHOPS, LADIES, PICKUP_LINES, LADY_REACTIONS, RECRUITS, CART_MODS, PAINTS, WEAPONS, DECREES, CONCESSION } from './data.js';
import { pick, rand, randInt, chance, money, DAYS, fmtTime } from '../core/utils.js';
import { audio } from '../core/audio.js';
import { testBatchOn } from './chapter2.js';
import { casinoNode, cabinNode } from './chapter3.js';

// ---------------------------------------------------------------- helpers
const C = (g, stat, diff, label) => ({ label: label || stat.toUpperCase().replace('INTIM', 'INT').replace('STAT', 'STA'), chance: g.chance(stat, diff) });

function end(name, text, title = '') {
  return { name, title, text, choices: [{ text: 'Leave', action: () => null }] };
}

// ---------------------------------------------------------------- residents
const GREET_M = [
  "Well if it isn't the new fella. Heard you got kicked out of Boca.",
  "You're blocking my sun, pal.",
  "Is it Tuesday? My pills are color-coded and I'm colorblind.",
  "You look like a guy who knows a guy.",
  "Don't tell my wife you saw me out here. She thinks I'm at the podiatrist.",
  "I've been married 52 years. Ask me how. Actually don't.",
];
const GREET_F = [
  "Oh! You startled me. My hearing aid was on 'garden'.",
  "You're the new one. Doris said you had a nice... cart.",
  "Can't talk long, sweetie. Water aerobics in twenty.",
  "Are you single? Asking for my sister. She's dead, but still.",
];
const SMALLTALK = [
  ['"Did you know the Golden Coral\'s shrimp is actually just more chicken?"', '+1 CHA XP'],
  ['"Karen fined my neighbor for a wind chime. A WIND chime. It was windy!"', ''],
  ['"Doc Pratt used to be a real doctor. Veterinary, but still."', ''],
  ['"Watch out for Chip Wainwright. His daddy owned half of Palm Beach and Chip owns the other half of his own ego."', ''],
  ['"Tammy on the beverage cart? Every man here would give a kidney. Most of us only have one left."', ''],
  ['"They say Officer Dale failed the police exam four times. Now he\'s drunk on HOA power."', ''],
];

export function talkResident(g, npc) {
  const name = npc.name;
  const f = npc.female;
  const inv = g.state.inv;
  const wants = npc.data.wants;
  const node = {
    name, title: f ? 'Resident' : 'Resident',
    text: pick(f ? GREET_F : GREET_M) + (wants === 'pills' ? '\n\n*He glances around nervously and lowers his voice.* "Say... you wouldn\'t know where a guy could get some, uh, vitamins?"' : wants === 'tea' ? `\n\n*${f ? 'She' : 'He'} leans in.* "I hear there's a tea. For... vigor. ${f ? "It's for my husband. He's been a wet noodle since the Carter administration." : 'Rhino something?'}"` : ''),
    choices: [],
  };
  if (wants === 'pills') {
    node.choices.push({ text: `"Psst. Need a little help in the bedroom?" (💊 ${inv.pills})`, disabled: inv.pills <= 0, action: () => dealNode(g, npc, 'pills') });
  }
  if (wants === 'tea') {
    node.choices.push({ text: `"I've got the real rhino juice." (🍵 ${inv.tea})`, disabled: inv.tea <= 0, action: () => dealNode(g, npc, 'tea') });
  }
  if (g.state.hoa.registered && !g.state.hoa.president && !g.state.hoa.campaigned[npc.id]) {
    node.choices.push({ text: '"Vote for me for HOA President. I\'ll get rid of Karen."', check: C(g, 'cha', 3), action: () => campaign(g, npc) });
    node.choices.push({ text: '"Here\'s twenty bucks. You never saw me. Vote for me."', tag: '$20', disabled: g.state.money < 20, action: () => {
      g.spend(20);
      g.state.hoa.campaigned[npc.id] = true;
      g.state.hoa.votes += 1;
      g.toast('🗳️ Bought a vote (+1). Democracy!', 'quest');
      return end(name, '"Pleasure doing business. I was gonna vote for you anyway. Now I\'m definitely thinking about it."');
    } });
  }
  if (!npc.data.chatted) {
    node.choices.push({ text: 'Shoot the breeze', action: () => {
      npc.data.chatted = true;
      const [line] = pick(SMALLTALK);
      g.xp('cha', 1);
      return end(name, line);
    } });
  }
  if (!f) {
    node.choices.push({ text: '"Gimme your wallet, gramps."', check: C(g, 'intim', npc.data.tough || 3), action: () => {
      if (g.roll('intim', npc.data.tough || 3)) {
        const amt = randInt(12, 48);
        g.addMoney(amt, 'mugged a senior');
        g.xp('intim', 1);
        g.crime(npc.x, npc.z, 0.6, 'Mugging a resident', 15);
        npc.data.wants = null;
        return end(name, pick([`*He shakily hands over $${amt} and a Werther's Original.* "Take it! Take the candy too!"`, `"Okay, okay! $${amt}! It was for my grandkid's birthday card, you monster."`]));
      }
      npc.provoke(g.player);
      return end(name, '"Oh, you wanna go? I survived NORMANDY, sonny!" *He puts up his dukes.*');
    } });
  } else {
    node.choices.push({ text: 'Compliment her hair', check: C(g, 'cha', 2), action: () => {
      if (g.roll('cha', 2)) {
        g.xp('cha', 1);
        return end(name, pick(['"Oh, you noticed! It\'s called \'Midnight Periwinkle\'."', '"Aren\'t you sweet. Most men here only notice the buffet."']));
      }
      g.player.hp -= 3;
      g.ui.float(npc.x, 2, npc.z, 'SLAP!', '#ff6b6b');
      audio.play('hit');
      return end(name, '*SLAP* "I know what you\'re after. Everybody\'s after something."');
    } });
  }
  node.choices.push({ text: 'Leave', action: () => null });
  return node;
}

function campaign(g, npc) {
  g.state.hoa.campaigned[npc.id] = true;
  if (g.roll('cha', 3)) {
    const v = 1 + Math.floor(g.stat('stat') / 4) + (npc.female ? 1 : 0);
    g.state.hoa.votes += v;
    g.toast(`🗳️ +${v} vote${v > 1 ? 's' : ''} for ${g.state.name}`, 'quest');
    return end(npc.name, pick(['"Anyone\'s better than Karen. She fined my dog for barking in a Spanish accent."', '"You got my vote. And my wife\'s. She doesn\'t know yet."', '"If you promise to bring back the Tuesday taco bar, you\'re my guy."']));
  }
  return end(npc.name, pick(['"I don\'t vote for men in Hawaiian shirts. Burned once."', '"Karen\'s kept this place orderly. Miserable, but orderly."']));
}

function dealNode(g, npc, kind) {
  const isTea = kind === 'tea';
  const base = isTea ? 130 : 25;
  const qty = isTea ? 1 : Math.min(g.state.inv.pills, randInt(1, 3));
  const unit = isTea ? 'Rhino Horn Tea' : `Blue Boy${qty > 1 ? 's' : ''}`;
  const legend = g.state.perks.legend ? 1.1 : 1;
  const sell = (price, text) => {
    const total = Math.round(price * qty * legend);
    g.state.inv[kind] -= qty;
    g.addMoney(total, isTea ? 'rhino tea' : 'blue boys');
    g.state.counters[isTea ? 'teaSold' : 'pillsSold'] += qty;
    npc.data.wants = null;
    npc.data.bought = true;
    g.crime(npc.x, npc.z, 1.0, 'Distributing "vitamins"', 18, true);
    g.xp('cha', 1);
    g.particles.burst('cash', npc.x, 1.6, npc.z, 5, { speed: 1.5, up: 3, life: 1.2, size: 0.45 });
    return end(npc.name, text);
  };
  return {
    name: npc.name, title: 'Customer',
    text: isTea
      ? `"Is it true what they say? That it's... the real deal?"\n\n(Wants ${qty} ${unit})`
      : `"How much for ${qty}? And is it discreet? My wife checks the recycling."\n\n(Wants ${qty} ${unit})`,
    choices: [
      { text: `"Standard price. $${base} each."`, tag: `+$${Math.round(base * qty * legend)}`, action: () => sell(base, pick(['"Deal. God bless America."', '"Pleasure. Now walk away slowly."', '"If this works I\'m naming my next grandkid after you."'])) },
      { text: `"For you? Premium blend. $${Math.round(base * 1.45)} each."`, check: C(g, 'cha', isTea ? 6 : 4), action: () => {
        if (g.roll('cha', isTea ? 6 : 4)) return sell(Math.round(base * 1.45), '"Premium, huh? Worth every penny if it gets me through Saturday night."');
        return { name: npc.name, text: '"Premium my foot. I\'m on a fixed income, not a fixed brain."', choices: [{ text: `Fine. $${base} each.`, action: () => sell(base, '"Now we\'re talking."') }, { text: 'Walk away', action: () => null }] };
      } },
      { text: `"$${Math.round(base * 1.7)} each, or your wife hears about the pool boy."`, check: C(g, 'intim', isTea ? 5 : 3), action: () => {
        if (g.roll('intim', isTea ? 5 : 3)) {
          g.xp('intim', 1);
          return sell(Math.round(base * 1.7), '*He goes pale and pays without a word. There WAS a pool boy.*');
        }
        npc.provoke(g.player);
        return end(npc.name, '"There\'s no pool boy! ...Okay there was ONE pool boy. That\'s it, put \'em up!"');
      } },
      { text: 'Never mind', action: () => null },
    ],
  };
}

// ---------------------------------------------------------------- ladies
function hearts(aff) {
  const n = Math.round(aff / 20);
  return '❤'.repeat(n) + '♡'.repeat(5 - n);
}

export function talkLady(g, npc) {
  const def = npc.data.lady;
  const r = g.state.romance[def.id];
  const name = def.name;
  const title = `${def.title} • ${hearts(r.aff)}`;
  if (def.id === 'tammy') {
    const ok = g.stat('cha') >= def.reqCha && g.stat('stat') >= def.reqStat && g.cartModCount() >= def.needsPimpedCart;
    if (!ok && !r.conquest) {
      return {
        name, title,
        text: pick([
          '"Aww, sugar. You\'re cute, in a Werther\'s Original kinda way. Come back when you\'re SOMEBODY around here."',
          '"Every man in this zip code has proposed to me. You gotta stand out, honey. Nice cart? Nice attitude? Nice... anything?"',
        ]) + `\n\n(Needs CHA ${def.reqCha}, STATUS ${def.reqStat}, and a cart with ${def.needsPimpedCart}+ mods.)`,
        choices: [
          ...concessionChoices(g, npc),
          { text: 'Buy a beer off her cart ($5)', disabled: g.state.money < 5, action: () => { g.spend(5); g.state.inv.beer++; return end(name, '"Here ya go, hon. Tip\'s appreciated. Big tips are REMEMBERED."'); } },
          { text: 'Leave with your dignity', action: () => null },
        ],
      };
    }
  }
  if (r.conquest) return ladyAfter(g, npc, def, r);
  const greet = r.aff < 20
    ? pick(['"Can I help you?" *She clutches her purse a little tighter.*', '"You\'re the new one. You smell like beer and Bengay."', '"Oh. Hello."'])
    : r.aff < 50
      ? pick(['"Well, look who it is." *She smiles despite herself.*', '"You again! People are going to talk."'])
      : r.aff < 80
        ? pick(['"There\'s my handsome troublemaker."', '"I was hoping you\'d come by. Don\'t let it go to your head."'])
        : pick(['"*She bats her eyelashes so hard her false lashes nearly fly off.*"', '"If you don\'t ask me out soon, I\'m asking YOU."']);
  const cool = g.state.minutes + g.state.day * 1440 - (r.last || -9999) < 45;
  const node = { name, title, text: greet, choices: [] };
  if (def.id === 'millie') {
    node.choices.push({ text: `"Bet you can't out-drink me, Millie."`, tag: 'chug-off $40', disabled: g.state.money < 40, action: () => {
      g.startMinigame('chug', { opponent: 'Millie Rausch', bet: 40, oppRate: [1.9, 2.6], onWin: () => g.romance('millie', 14), onLose: () => g.romance('millie', 6) });
      g.ui.closeDialogue();
      return 'keep';
    } });
  }
  node.choices.push({ text: 'Make small talk', disabled: cool, tag: cool ? 'she needs a minute' : '', action: () => {
    r.last = g.absMinutes();
    const d = randInt(3, 6);
    g.romance(def.id, d);
    g.xp('cha', 1);
    return { ...end(name, pick([
      '"My grandson says I should try the online dating. I said, honey, everyone online is either a bot or dead."',
      '"I used to be a dancer, you know. Rockettes, 1966. Don\'t look at my knees now."',
      '"Bingo was rigged again. I\'m not saying it was Karen. I\'m thinking it very loudly."',
      '"You have kind eyes. Well, one kind eye. The other one\'s doing its own thing."',
    ]) + `\n\n(+${d} ❤)`, title), title };
  } });
  const bonus = g.flirtBonus();
  const line = pick(PICKUP_LINES);
  const diff = line.diff * 0.6 + def.tier - bonus;
  node.choices.push({ text: `"${line.line}"`, check: C(g, 'cha', diff), disabled: cool, action: () => {
    r.last = g.absMinutes();
    maybeHusband(g, npc, def);
    if (g.roll('cha', diff)) {
      const d = randInt(9, 15);
      g.romance(def.id, d);
      audio.play('heart');
      g.particles.burst('heart', npc.x, 2.2, npc.z, 6, { speed: 1, up: 2, gravity: -1, life: 1.6, size: 0.5 });
      return end(name, `${pick(LADY_REACTIONS.success)}\n\n(+${d} ❤)`, title);
    }
    g.romance(def.id, -5);
    audio.play('fail');
    return end(name, `${pick(LADY_REACTIONS.fail)}\n\n(-5 ❤)`, title);
  } });
  for (const [item, icon, label] of [['flowers', '💐', 'Gas station flowers'], ['wine', '🍷', 'Box wine'], ['beer', '🍺', 'A warm Geezer Light'], ['towel', '🏖️', 'A fluffy beach towel']]) {
    if (g.state.inv[item] > 0) {
      node.choices.push({ text: `Give her ${label} ${icon}`, action: () => {
        g.state.inv[item]--;
        const likes = def.likes.includes(item), hates = def.dislikes.includes(item);
        const d = likes ? 16 : hates ? -6 : 7;
        g.romance(def.id, d);
        if (d > 0) g.particles.burst('heart', npc.x, 2.2, npc.z, 5, { speed: 1, up: 2, gravity: -1, life: 1.4, size: 0.5 });
        return end(name, (likes ? pick(['"For ME? Oh, you shouldn\'t have. No, really, give it here."', '"My favorite! How did you know? Did Mildred tell you? That snitch."']) : hates ? pick(['"Ew. What am I, a college boy?"', '"I\'m allergic. To cheapness."']) : '"Well, thank you. That\'s... thoughtful."') + `\n\n(${d > 0 ? '+' : ''}${d} ❤)`, title);
      } });
    }
  }
  const statOk = g.stat('cha') >= def.reqCha && g.stat('stat') >= def.reqStat;
  node.choices.push({
    text: r.aff >= 60 ? '"Let me take you out tonight."' : 'Ask her out (needs ❤❤❤)',
    disabled: r.aff < 60 || !statOk,
    tag: !statOk ? `needs CHA ${def.reqCha} / STA ${def.reqStat}` : '',
    tagCls: 'bad',
    action: () => dateNode(g, npc, def, r),
  });
  node.choices.push({ text: 'Leave', action: () => null });
  return node;
}

// Signature dates per lady; everyone else gets a random classic.
const SIGNATURE_DATES = {
  doris: ['the Golden Coral for the 4:00 early bird', 'She brought her own Tupperware and filled it with shrimp while making direct eye contact with the manager. You have never been more attracted to anyone.'],
  millie: ['a back-room poker game at the Elks Lodge', 'She cleaned out three retired dentists and a priest, then bought you a round with their money. She calls you "sugar tits." You allow it.'],
  gloria: ['the Tiki Hut for a Bushwacker crawl', 'She told you about all four ex-husbands in alphabetical order. Husband #3, Sal, "had hands like a surgeon and the morals of a raccoon."'],
  bev: ['a moonlight pickleball match', 'She beat you 11-0, kissed you at the net, and whispered "Frank bowls on Thursdays." It is Thursday.'],
  linda: ['the Country Club patio, right under Chip\'s nose', 'You split a $90 bottle of wine on Chip\'s member account. He waved at you from the bar, confused. She squeezed your knee under the table.'],
  rhonda: ['the Rusty Pelican for dollar-oyster night', 'She ate forty oysters, got into a shouting match with a pelican, and taught you a Jersey hand gesture that got you both banned for a week.'],
  tammy: ['a midnight cruise in her beverage cart around the back nine', 'She let you drive. At the Lake Serenity ramp she yelled "SEND IT," and you did. As you splashed down, somebody set off fireworks over the clubhouse. It might have been for you. It was definitely for you.'],
};

function dateNode(g, npc, def, r) {
  if (def.id === 'tammy') g.celebrate(14, 52, -112);
  const venue = SIGNATURE_DATES[def.id] || pick([
    ['the Golden Coral for the 4:00 early bird', 'She ordered the prime rib, then wrapped two dinner rolls in a napkin "for later." A woman after your own heart.'],
    ['a sunset cart ride around the back nine', 'You drove with one hand on the wheel and one on the Geezer Light. She held on for dear life. She loved it.'],
    ['Bingo Night at the clubhouse', 'She won twice. Karen glared the whole time. You held her daubers. It was intimate.'],
    ['the duck pond with a box of wine', 'You fed the ducks. The ducks fed on your insecurities. She laughed so hard her teeth slipped.'],
  ]);
  return {
    name: def.name, title: 'A Date',
    text: `You take ${def.name.split(' ')[0]} to ${venue[0]}.\n\n${venue[1]}`,
    choices: [{ text: 'Continue ▸', action: () => {
      g.romance(def.id, 100 - r.aff - 10);
      g.advanceTime(90);
      return {
        name: def.name, title: 'The Nightcap',
        text: `"${pick(['I had a wonderful time. Would you... want to come in for a Sanka?', "My late husband's side of the bed is getting cold. Well, colder.", "Walk me to my door? And maybe... through it?"])}"`,
        choices: [
          { text: 'Take a Blue Boy first 💊 (guaranteed... performance)', disabled: g.state.inv.pills <= 0, tag: `💊 ${g.state.inv.pills}`, action: () => { g.state.inv.pills--; return conquest(g, npc, def, true); } },
          { text: 'Wing it, like it\'s 1971', check: C(g, 'cha', def.tier * 2 + 1 - g.flirtBonus()), action: () => {
            if (g.roll('cha', def.tier * 2 + 1 - g.flirtBonus())) return conquest(g, npc, def, false);
            g.romance(def.id, -15);
            return end(def.name, 'Things were going great until you fell asleep mid-sentence. She tucked a blanket over you and turned on Matlock. It was actually really nice, but it doesn\'t count.\n\n(-15 ❤. Try again another time.)');
          } },
          { text: '"I should get home. It\'s past 8."', action: () => end(def.name, '"A gentleman! How disappointing." (Come back when you\'re feeling brave.)') },
        ],
      };
    } }],
  };
}

function conquest(g, npc, def, pill) {
  const r = g.state.romance[def.id];
  g.fadeOut(() => {
    audio.play('bedsprings');
    r.conquest = true;
    r.aff = 100;
    g.state.counters.conquests++;
    g.advanceTime(120);
    g.unlockPerk(def.perkId, def);
    g.xp('cha', 4);
    g.xp('stat', 3);
  }, 3.8, `💞 ${def.name.split(' ')[0].toUpperCase()} 💞`, pill ? 'The Blue Boy worked for 4 hours. You called a doctor. The doctor said "nice."' : "Ol' reliable. The neighbors called in a noise complaint.");
  return null;
}

function ladyAfter(g, npc, def, r) {
  const node = { name: def.name, title: `${def.title} • 💞 Conquered`, text: pick(['"Well hello, lover."', '"The girls at bridge club are SO jealous."', '"Don\'t you dare tell Karen about us. Actually, do. I want to see her face."']), choices: [] };
  if (def.perkId === 'casserole') {
    const today = g.state.day;
    node.choices.push({ text: 'Got any casserole? 🥘', disabled: g.state.perks.casseroleDay === today, tag: g.state.perks.casseroleDay === today ? 'tomorrow' : 'full heal', action: () => {
      g.state.perks.casseroleDay = today;
      g.player.hp = g.maxHp();
      g.state.buzz = Math.max(0, g.state.buzz - 50);
      return end(def.name, '*She produces a steaming tuna casserole from literally nowhere.* "Eat. You\'re too skinny. Well, your arms are."\n\n(Full heal, sobered up)');
    } });
  }
  if (def.perkId === 'dirt') {
    node.choices.push({ text: '"Tell me about Karen."', action: () => { g.state.hoa.dirt = true; return end(def.name, '"Karen Whitmore rigs the bingo. Has for years. She keeps the real ball cage in her trunk. And the HOA \'beautification fund\'? Paid for her new teeth." (Go have a chat with Karen.)'); } });
  }
  if (def.perkId === 'dirt') node.choices.push({ text: '"What\'s Chip planning?"', action: () => end(def.name, pick(['"He\'s been bragging he\'ll take back the beverage carts. Hide your inventory, lover."', '"Chip thinks you\'re \'a vulgar little man.\' He said it while wearing a sweater around his neck in July."'])) });
  node.choices.push({ text: 'Sweet nothings (+CHA xp)', action: () => { g.xp('cha', 1); return end(def.name, pick(['"You\'re a bad man. I love it."', '"Stop it. No, don\'t stop."'])); } });
  if (def.id === 'tammy') node.choices.push(...concessionChoices(g, npc));
  node.choices.push({ text: 'Leave', action: () => null });
  return node;
}

function maybeHusband(g, npc, def) {
  if (!def.husband || g.state.romance[def.id].husbandDealt) return;
  if (!chance(0.35)) return;
  g.husbandEvent(def, npc);
}

export function husbandConfront(g, husband, def) {
  const isFrank = def.husband === 'frank';
  const diff = isFrank ? 5 : 3;
  return {
    name: husband.name, title: 'Jealous Husband',
    text: isFrank ? '"HEY! WHAT THE HELL IS THIS?! That\'s my WIFE, you shriveled-up prune!"' : '"I say! Unhand my wife, you vulgar little man! Do you know who my FATHER was?"',
    choices: [
      { text: 'Stare him down. Don\'t blink. Don\'t even breathe.', check: C(g, 'intim', diff), action: () => {
        if (g.roll('intim', diff)) {
          g.state.romance[def.id].husbandDealt = true;
          g.xp('intim', 3);
          husband.state = 'flee';
          husband.fleeT = 6;
          husband.fleeFrom = g.player;
          if (isFrank) {
            g.giveWeapon('titanium');
            return end(husband.name, '*Frank\'s lip trembles. He slowly hands you his Titanium Driver.* "...Take it. Take the clubs. Just... don\'t tell the guys at the Elks."\n\n(Got FRANK\'S TITANIUM DRIVER)');
          }
          g.addMoney(500, 'hush money');
          return end(husband.name, '*Chip dabs his forehead with a monogrammed handkerchief and hands you an envelope.* "Five hundred dollars. For your... discretion. Father would be so ashamed."');
        }
        g.brawl(husband, 2, isFrank ? 'Frank\'s bowling buddies' : "Chip's caddies");
        return end(husband.name, '"THAT\'S IT! BOYS! GET OVER HERE!" *Two of his buddies come shuffling at full speed.*');
      } },
      { text: '"It\'s not what it looks like. I was checking her for ticks."', check: C(g, 'cha', 6), action: () => {
        if (g.roll('cha', 6)) {
          husband.state = 'returnHome';
          return end(husband.name, '"...Ticks? Oh god. Did you find any? Bev, go shower. Thank you, stranger. Thank you."');
        }
        g.brawl(husband, 1, 'his buddy');
        return end(husband.name, '"Ticks?! I\'LL GIVE YOU TICKS!"');
      } },
      { text: 'Run for it', action: () => { g.romance(def.id, -8); husband.provoke(g.player); return null; } },
    ],
  };
}

// ---------------------------------------------------------------- concession carts
export function concessionChoices(g, npc) {
  const c = g.concession.find((x) => x.operator === npc);
  if (!c) return [];
  const st = c.state;
  if (!st.owned) {
    return [
      { text: `"Stop stocking Chip's junk. Sell MY product." (Pay $200 signing bonus)`, tag: '$200 • 55% cut', disabled: g.state.money < 200, action: () => {
        g.spend(200);
        g.takeCart(c, 0.55);
        return end(npc.name, '"Two hundred cash? Chip pays me in \'exposure.\' You got yourself a cart, boss."');
      } },
      { text: '"You work for me now. Or you swim with the gators."', check: C(g, 'intim', 4 + g.state.counters.cartsTaken), action: () => {
        if (g.roll('intim', 4 + g.state.counters.cartsTaken)) {
          g.xp('intim', 2);
          g.takeCart(c, 0.75);
          return end(npc.name, '*Gulps.* "Seventy-five percent to you. Yes sir. Chip who?"');
        }
        g.rivalAmbush(npc.x, npc.z, 2);
        return end(npc.name, '"Oh yeah? CHIP! CHIIIIP! We got a problem cart!" *Two of Chip\'s goons come running.*');
      } },
    ];
  }
  const inv = g.state.inv;
  return [
    { text: `Restock: hand over product (💊 ${inv.pills} / 🍵 ${inv.tea})`, disabled: inv.pills + inv.tea === 0, action: () => {
      st.stock.pills += inv.pills;
      st.stock.tea += inv.tea;
      const msg = `Stocked ${inv.pills} Blue Boys and ${inv.tea} Rhino Tea.`;
      inv.pills = 0; inv.tea = 0;
      return end(npc.name, `"${pick(['Beautiful. These fly off the cart faster than the hot dogs.', 'The fellas on hole 4 are gonna be VERY happy.'])}"\n\n${msg}`);
    } },
    { text: '"How\'s business?"', action: () => end(npc.name, `Stock: 💊 ${st.stock.pills} • 🍵 ${st.stock.tea}\nEarned for you so far: ${money(st.earned)}\nYour cut: ${Math.round(st.cut * 100)}%\n\n"${st.stock.pills + st.stock.tea === 0 ? "I'm out, boss. Guys are asking. It's getting ugly." : 'Moving product, boss.'}"`) },
  ];
}

export function talkOperator(g, npc) {
  return { name: npc.name, title: 'Beverage Cart Operator', text: g.concession.find((x) => x.operator === npc)?.state.owned ? '"Hey boss. Cart\'s running smooth."' : '"Cold drinks, hot dogs, and... *wink*... the other stuff. Chip\'s supply. What\'ll it be?"', choices: [...concessionChoices(g, npc), { text: 'Leave', action: () => null }] };
}

// ---------------------------------------------------------------- gang
export function talkRecruit(g, npc) {
  const def = npc.data.recruit;
  if (def.id === 'walker' && g.state.quest.flags.homebrew && !g.state.quest.flags.testBatch) {
    return {
      name: def.name, title: 'Volunteer (unaware)',
      text: `"What's in the thermos? Smells like a petting zoo."`,
      choices: [
        { text: '"Home-brewed Rhino Tea. On the house, Wally."', disabled: g.state.inv.tea <= 0, tag: `🍵 ${g.state.inv.tea}`, action: () => { testBatchOn(g, npc); return end(def.name, '*He drinks the whole thermos. His walker begins to smoke.* "OH. OH MY. WHERE ARE MY SNEAKERS?"'); } },
        { text: 'Never mind', action: () => null },
      ],
    };
  }
  if (npc.role === 'gang') {
    const guarding = npc.state === 'guard';
    return {
      name: def.name, title: 'Your Crew',
      text: pick(['"What\'s the play, boss?"', '"I\'m ready. My hip isn\'t, but I am."', '"Point me at somebody."']),
      choices: [
        { text: 'Follow me', disabled: npc.state === 'follow', action: () => { g.setGangMode(npc, 'follow'); return null; } },
        { text: 'Guard this spot', disabled: guarding, action: () => { g.setGangMode(npc, 'guard'); return end(def.name, '"Nobody gets past me. Unless I nod off."'); } },
        { text: 'Take a hike (dismiss)', action: () => { g.dismissGang(npc); return end(def.name, '"Fine. I\'ll be at the clubhouse. Call me."'); } },
        { text: 'Carry on', action: () => null },
      ],
    };
  }
  const full = g.gang().length >= 4;
  return {
    name: def.name, title: 'Potential Recruit',
    text: `${def.bio}\n\n"${pick(['You look like a guy who needs muscle. I got muscle. Some of it\'s even mine.', "I'm bored, I'm mean, and I've got nothing but time. Well. Some time."])}"`,
    choices: [
      { text: `"Join my crew." (${money(def.cost)})`, disabled: g.state.money < def.cost || full, tag: full ? 'crew full' : '', action: () => { g.spend(def.cost); g.recruit(npc); return end(def.name, '"You got yourself a soldier. When do we eat?"'); } },
      { text: `"Join me and you get a steady supply of Rhino Tea." (🍵 ×${def.teaCost})`, disabled: g.state.inv.tea < def.teaCost || full, action: () => { g.state.inv.tea -= def.teaCost; g.recruit(npc); return end(def.name, '*He downs one on the spot. His eyes go wide.* "OH, I\'M IN. I\'M SO IN."'); } },
      { text: 'Leave', action: () => null },
    ],
  };
}

// ---------------------------------------------------------------- key NPCs
export function talkKaren(g, npc) {
  const h = g.state.hoa;
  const choices = [];
  if (h.dirt && !h.puppet && !h.president) {
    choices.push({ text: '"Nice teeth, Karen. Bought with the beautification fund?"', check: C(g, 'intim', 4), action: () => {
      if (g.roll('intim', 4)) {
        h.puppet = true;
        g.xp('intim', 4);
        g.xp('stat', 3);
        g.toast('🏛️ KAREN IS YOUR PUPPET. Visit the HOA Office to issue decrees.', 'quest', 7);
        return end('Karen Whitmore', '*Her eye twitches. Her clipboard trembles.* "...What do you want." \n\nShe\'s yours now. Every rule, every fine, every decree. You run the HOA from the shadows.');
      }
      return end('Karen Whitmore', '"How DARE you. I will have you EVICTED." (She\'s rattled, but not broken. Get scarier and try again.)');
    } });
  }
  if (h.puppet) {
    choices.push({ text: '"How\'s my favorite puppet?"', action: () => end('Karen Whitmore', '"...The decrees you requested are in effect. Please stop smiling at me like that."') });
  }
  if (g.heat.value > 0.2) {
    const fine = g.fineAmount();
    choices.push({ text: `Pay your outstanding violations (${money(fine)})`, disabled: g.state.money < fine, action: () => { g.spend(fine); g.heat.value = 0; return end('Karen Whitmore', '"Paid in full. For now. I have my eye on you. Both eyes. And binoculars."'); } });
  }
  choices.push({ text: '"Nice clipboard."', action: () => end('Karen Whitmore', pick(['"It\'s a Swingline Executive. You couldn\'t afford it."', '"Section 12, paragraph 4: no sarcasm within 50 feet of the clubhouse. That\'s a warning."'])) });
  choices.push({ text: 'Leave', action: () => null });
  return {
    name: 'Karen Whitmore', title: 'HOA President',
    text: h.puppet ? '"*quietly* ...Yes?"' : pick([
      `"${g.state.name}. Your flamingo count is non-compliant, your cart is unauthorized, and your shirt is... loud. That's three warnings."`,
      '"I\'ve got my eye on you. Sunset Palms has STANDARDS. Some of us remember when this was a respectable community."',
      '"Do you know how many complaints I\'ve received about you? Eleven. Today."',
    ]),
    choices,
  };
}

export function talkChip(g, npc) {
  if (g.state.quest.flags.chipIntro && !g.state.quest.flags.beatChip) {
    return {
      name: 'Chip Wainwright III', title: 'Rival • Country Club Boys',
      text: '"You again. Boys, teach this peasant some manners."',
      choices: [{ text: 'Round two.', action: () => { g.chipBrawl(npc); return null; } }],
    };
  }
  return end('Chip Wainwright III', pick([
    '"Father always said: never talk to people who buy their golf shirts at Costco."',
    '"This is MY course. My carts. My ball market. You\'re just a rounding error."',
    '"Is that a Hawaiian shirt? In the CLUBHOUSE district? Tacky."',
  ]));
}

export function chipConfront(g, chip) {
  g.state.quest.flags.chipIntro = true;
  return {
    name: 'Chip Wainwright III', title: 'Rival • Country Club Boys',
    text: `"So YOU'RE the one selling 'vitamins' on my course. I'm Chip Wainwright. The Third. My family has run the beverage carts, the ball market, and half the HOA for forty years."\n\n*He adjusts the sweater tied around his neck.*\n\n"Biff. Thurston. Explain to ${g.state.name} how we do things at Sunset Palms."`,
    choices: [
      { text: '"Chip, your sweater called. It wants a man to wear it."', action: () => { g.chipBrawl(chip); return null; } },
      { text: '*Crack your knuckles. And your back. And your neck.*', action: () => { g.xp('intim', 1); g.chipBrawl(chip); return null; } },
    ],
  };
}

export function talkGolfer(g, npc) {
  return end(npc.name, pick([
    '"Do you MIND? I\'m in my backswing. I\'ve been in my backswing since 1994."',
    '"FORE! ...Sorry, reflex. I say it to everybody."',
    '"I shot an 82 once. On nine holes. Don\'t tell anybody."',
    '"If you see a Titleist Pro V1 out there, it\'s mine. They\'re all mine. Gus buys \'em back and sells \'em to me again. I know. I KNOW."',
  ]));
}

// ---------------------------------------------------------------- POIs / shops
export function visit(g, poi) {
  const id = poi.id;
  if (id === 'tiki') return tikiNode(g);
  if (id === 'casino') return casinoNode(g);
  if (id === 'cabin') return cabinNode(g);
  if (SHOPS[id]) return openShop(g, id);
  if (id === 'sal') return openSal(g);
  if (id === 'home') return homeNode(g);
  if (id === 'hoa') return hoaNode(g);
  if (id === 'clubhouse') return clubhouseNode(g);
  if (id === 'dumpster') return dumpsterNode(g);
  if (id === 'gate') return end('Front Gate', `"Beach is straight ahead, Mr. ${g.state.name}. Boca Beach Club. Rusty Pelican's got two-for-one Bushwackers. Don't drive on the pier. Everybody drives on the pier." — Gate Guard Hector`);
  if (id === 'pickleball') return betNode(g, 'Pickleball Hustle', '"Twenty bucks says you can\'t return my dink shot, old man." — a 70-year-old in compression sleeves.', 'str', 4, 40);
  if (id === 'shuffle') {
    const play = (bet, skill) => () => { g.startMinigame('shuffle', { bet, skill }); g.ui.closeDialogue(); return 'keep'; };
    return {
      name: 'Shuffleboard Hustle', title: 'The courts',
      text: 'The shuffleboard sharks of Sunset Palms play for blood. And cash. One frame, four pucks each. Land in the triangle, knock their pucks into the gutter.',
      choices: [
        { text: 'Play a friendly frame', tag: `bet ${money(30)}`, disabled: g.state.money < 30, action: play(30, 0.55) },
        { text: 'Play the house champion', tag: `bet ${money(150)}`, disabled: g.state.money < 150, action: play(150, 0.85) },
        { text: 'Walk away', action: () => null },
      ],
    };
  }
  if (id === 'pool') return end('The Pool', `The clubhouse pool. 82 degrees and approximately 30% water, 70% sunscreen. ${g.state.bladder > 20 ? '\n\n(Tip: press P while standing in the water. You know you want to.)' : ''}`);
  if (id === 'gazebo') return end('Gazebo', 'Someone carved "MILDRED + ???" into the railing. The ??? has been scratched out and re-carved nine times.');
  return null;
}

function tikiNode(g) {
  return {
    name: 'Tiki Hut', title: 'Manny, Bartender',
    text: pick(['"Welcome to paradise, amigo. Paradise costs six bucks a beer."', '"The regulars are looking for fresh blood. Chug-off? Winner doubles the bet."']),
    choices: [
      { text: 'Order drinks', action: () => { openShop(g, 'tiki'); g.ui.closeDialogue(); return 'keep'; } },
      { text: 'Challenge the regulars to a CHUG-OFF', tag: 'bet $40', disabled: g.state.money < 40, action: () => { g.startMinigame('chug', { opponent: pick(['Big Sal "The Funnel"', 'Dutch Van Houten', 'Irv the Sponge']), bet: 40 }); g.ui.closeDialogue(); return 'keep'; } },
      { text: 'Leave', action: () => null },
    ],
  };
}

function betNode(g, title, text, stat, diff, bet) {
  return {
    name: title, title: `Bet ${money(bet)}`,
    text,
    choices: [
      { text: `Play for ${money(bet)}`, check: C(g, stat, diff), disabled: g.state.money < bet, action: () => {
        g.advanceTime(30);
        if (g.roll(stat, diff)) {
          g.addMoney(bet, 'hustle');
          g.xp(stat, 2);
          return end(title, pick(['You win! Your opponent throws his paddle into the pond.', 'Victory! Someone yells "HUSTLER!" You take a bow. Your back cracks.']));
        }
        g.spend(bet);
        return end(title, pick(['You lose. Badly. A small crowd gathers to laugh.', 'You lost, and pulled something. Worth it? No.']));
      } },
      { text: 'Walk away', action: () => null },
    ],
  };
}

function homeNode(g) {
  const h = g.state.minutes;
  const late = h >= 18 * 60 || h < 5 * 60;
  return {
    name: `${g.state.name}'s Place`, title: 'Home Sweet Home',
    text: pick(['Your recliner has a butt-shaped dent that fits you like a glove. The TV is still on Matlock.', 'Home. It smells like Bengay and ambition.']),
    choices: [
      { text: late ? 'Sleep until morning (saves game)' : 'Sleep until morning (it\'s early, but you\'re old)', action: () => { g.sleep(); return null; } },
      { text: 'Throw a lawn party (booze & snacks)', tag: g.party ? 'party in progress' : '$250', disabled: !!g.party || g.state.money < 250, action: () => { g.startParty(); return null; } },
      { text: 'Take a nap (2 hours, heal)', action: () => { g.fadeOut(() => { g.advanceTime(120); g.player.hp = g.maxHp(); g.state.buzz = Math.max(0, g.state.buzz - 40); }, 1.5, '💤', 'Power nap. You drooled on the remote.'); return null; } },
      ...brewChoices(g),
      { text: 'Wardrobe: change your outfit', action: () => wardrobeNode(g) },
      { text: 'Save game', action: () => { g.save(); return end('Home', 'Game saved. Your legacy is secure. Unlike your bladder.'); } },
      { text: 'Leave', action: () => null },
    ],
  };
}

function brewChoices(g) {
  const st = g.state;
  const f = st.quest.flags;
  if (f.homebrew) {
    return [{ text: 'Brew a batch of Rhino Tea (5 teas)', tag: '$60 materials', disabled: st.money < 60, action: () => {
      g.spend(60);
      g.startMinigame('brew', { onWin: () => { st.inv.tea += 5; g.xp('str', 1); }, onLose: () => g.ui.toast('Ruined batch. The materials are gone.', 'heat', 3) });
      g.ui.closeDialogue();
      return 'keep';
    } }];
  }
  if (!f.c2Doc) return [];
  const have = st.inv.teabags > 0 && st.inv.antler > 0 && st.inv.tooth > 0;
  return [{ text: `Brew Doc's secret Rhino Tea recipe`, disabled: !have, tag: have ? 'first batch' : `need: ${[st.inv.teabags ? '' : 'tea bags', st.inv.antler ? '' : 'antler', st.inv.tooth ? '' : 'gator tooth'].filter(Boolean).join(', ')}`, tagCls: have ? 'good' : 'bad', action: () => {
    g.startMinigame('brew', { onWin: () => { f.homebrew = true; st.inv.tea += 5; st.inv.teabags--; st.inv.antler = 0; st.inv.tooth = 0; g.xp('str', 2); } });
    g.ui.closeDialogue();
    return 'keep';
  } }];
}

const SHIRT_NAMES = ['Teal Flamingo (lucky)', 'Hibiscus Red', 'Navy Palms', 'Sunshine Orange', 'Flamingo Pink', 'Purple Reign', 'Cream Linen', 'Electric Blue'];
const HAT_NAMES = { visor: 'White Visor', bucket: 'Bucket Hat', cap: 'Trucker Cap', fedora: 'Straw Fedora', none: 'No Hat' };
const GLASS_NAMES = { aviator: 'Aviators', big: 'Jackie O Shades', readers: 'Readers', none: 'No Glasses' };
function wardrobeNode(g) {
  const st = g.state;
  const cycle = (key, list) => {
    const i = list.indexOf(st.look[key]);
    st.look[key] = list[(i + 1) % list.length];
    g.player.setLook(st.look);
    return wardrobeNode(g);
  };
  return {
    name: 'Wardrobe', title: 'Buy more at the clubhouse boutique',
    text: `Shirt: ${SHIRT_NAMES[st.look.shirt]}
Hat: ${HAT_NAMES[st.look.hat] || st.look.hat}
Glasses: ${GLASS_NAMES[st.look.glasses] || st.look.glasses}
Socks: ${st.look.sock === '#ffffff' ? 'White tube socks' : 'Black dress socks (with sandals, obviously)'}`,
    choices: [
      { text: `Next shirt (${st.wardrobe.shirt.length} owned)`, disabled: st.wardrobe.shirt.length < 2, action: () => cycle('shirt', st.wardrobe.shirt) },
      { text: `Next hat (${st.wardrobe.hat.length} owned)`, disabled: st.wardrobe.hat.length < 2, action: () => cycle('hat', st.wardrobe.hat) },
      { text: `Next glasses (${st.wardrobe.glasses.length} owned)`, disabled: st.wardrobe.glasses.length < 2, action: () => cycle('glasses', st.wardrobe.glasses) },
      { text: 'Swap socks', disabled: st.wardrobe.sock.length < 2, action: () => cycle('sock', st.wardrobe.sock) },
      { text: 'Looking sharp. Done.', action: () => null },
    ],
  };
}

function clubhouseNode(g) {
  const hour = g.state.minutes / 60;
  return {
    name: 'Sunset Palms Clubhouse', title: `${fmtTime(g.state.minutes)}`,
    text: 'The clubhouse smells like coffee, chlorine and quiet desperation. A bulletin board advertises: WATER AEROBICS • BINGO WEDNESDAY • GRIEF SUPPORT (BYOB).',
    choices: [
      ...(g.state.quest.flags.teaShortage && !g.state.inv.antler ? [{ text: 'Sneak into the Grill Room and shave the moose antlers', disabled: hour > 5 && hour < 21, tag: hour > 5 && hour < 21 ? 'night only (9PM–5AM)' : 'heist', tagCls: 'bad', action: () => {
        g.state.inv.antler = 1;
        g.advanceTime(15);
        g.crime(g.player.x, g.player.z, 1.2, 'Defacing the clubhouse moose', 20, true);
        audio.play('pocketSand');
        return end('The Grill Room', 'You tiptoe past a sleeping bingo volunteer, climb onto a bar stool, and shave a generous pile of antler dust into a Ziploc. The moose watches. The moose judges.\n\n(Got ANTLER SHAVINGS)');
      } }] : []),
      { text: 'Browse the Resort Wear Boutique (outfits = STATUS)', action: () => { openShop(g, 'boutique'); g.ui.closeDialogue(); return 'keep'; } },
      { text: 'Water aerobics with the ladies (+STR, +CHA, 1 hour)', disabled: hour > 21 || hour < 6, action: () => {
        g.fadeOut(() => { g.advanceTime(60); g.xp('str', 3); g.xp('cha', 1); }, 1.5, '🏊 AEROBICS', 'You were the only man. You were a god among widows.');
        return null;
      } },
      { text: `Play Bingo (${money(10)} card, ${money(150)} pot)`, disabled: g.state.money < 10, action: () => { g.startMinigame('bingo', { bet: 10, pot: 150 }); g.ui.closeDialogue(); return 'keep'; } },
      { text: 'Leave', action: () => null },
    ],
  };
}

function dumpsterNode(g) {
  const night = g.state.minutes >= 21 * 60 || g.state.minutes < 5 * 60;
  return {
    name: 'Dumpster', title: night ? 'It\'s dark. Nobody\'s watching.' : 'Too many witnesses right now.',
    text: 'The HOA dumps its paperwork here. Also a surprising number of adult diapers.',
    choices: [
      { text: 'Dig through it', disabled: !night || g.state.flags.dumpsterDay === g.state.day, tag: !night ? 'night only (9PM-5AM)' : '', tagCls: 'bad', action: () => {
        g.state.flags.dumpsterDay = g.state.day;
        g.advanceTime(20);
        if (!g.state.hoa.dirt && Math.random() < 0.45) {
          g.state.hoa.dirt = true;
          g.toast('📁 Found DIRT ON KAREN. Go have a little chat with her.', 'quest', 6);
          return end('Dumpster', 'Under a pile of shredded memos you find a half-burned ledger: "BINGO — REAL CAGE IN TRUNK. BEAUTIFICATION FUND → DENTIST." Signed, K.W.\n\nYou now have DIRT ON KAREN.');
        }
        const r = Math.random();
        if (r < 0.4) { g.state.inv.balls = Math.min(g.ballCap(), g.state.inv.balls + 5); return end('Dumpster', 'A bag of old golf balls! (+5 balls, space permitting)'); }
        if (r < 0.7) { g.addMoney(randInt(5, 30), 'dumpster'); return end('Dumpster', 'A few crumpled bills and a coupon for a free colonoscopy.'); }
        g.state.inv.beer += 2;
        return end('Dumpster', 'Two unopened Geezer Lights. Warm. Perfect.');
      } },
      { text: 'Leave', action: () => null },
    ],
  };
}

function hoaNode(g) {
  const h = g.state.hoa;
  const choices = [];
  const days = (6 - g.state.dow + 7) % 7;
  if (!h.president && !h.puppet) {
    if (!h.registered) choices.push({ text: 'Register as a candidate for HOA President ($250 filing fee)', disabled: g.state.money < 250, action: () => { g.spend(250); h.registered = true; g.toast('🗳️ You\'re running for HOA President! Campaign by talking to residents.', 'quest', 6); return end('HOA Office', '"Filing accepted." Deb stamps your form with visible disgust. "The election is Sunday at 7 PM in the clubhouse. Good luck. You\'ll need it."'); } });
    else {
      const proj = g.hoaProjection();
      choices.push({ text: 'Check the polls', action: () => end('HOA Office', `Election: ${days === 0 ? 'TODAY' : `in ${days} day${days > 1 ? 's' : ''}`} (Sunday 7 PM)\n\n${g.state.name}: ~${proj.you} votes\nKaren Whitmore: ~${proj.karen} votes\n\nYour votes come from campaigning (talk to residents), CHARISMA, STATUS and your romantic conquests. Heat and INTIMIDATION scare voters off.`) });
    }
  }
  if (h.president || h.puppet) {
    choices.push({ text: `Issue decrees (${h.decrees.length}/3 active)`, action: () => decreeNode(g) });
  }
  if (g.heat.value > 0.2) {
    const fine = g.fineAmount();
    choices.push({ text: `Pay violations (${money(fine)}) — clears heat`, disabled: g.state.money < fine, action: () => { g.spend(fine); g.heat.value = 0; return end('HOA Office', '"Paid." Deb doesn\'t even look up.'); } });
  }
  choices.push({ text: 'Leave', action: () => null });
  return {
    name: 'HOA Office', title: h.president ? 'President\'s Office' : h.puppet ? 'Shadow Government HQ' : 'Deb, Secretary',
    text: h.president ? '"Good morning, Mr. President," Deb says, through clenched teeth.' : h.puppet ? 'Karen is "out sick." Deb slides you the decree binder without a word.' : '"Take a number." There is only one number. It is yours. "Now wait."',
    choices,
  };
}

function decreeNode(g) {
  const h = g.state.hoa;
  return {
    name: 'Official Decrees', title: 'Sunset Palms HOA',
    text: 'Choose up to 3 decrees. The residents will complain. You will not care.',
    choices: [
      ...DECREES.map((d) => {
        const on = h.decrees.includes(d.id);
        return { text: `${on ? '✅' : '⬜'} ${d.name} — ${d.desc}`, disabled: !on && h.decrees.length >= 3, action: () => {
          if (on) h.decrees = h.decrees.filter((x) => x !== d.id);
          else { h.decrees.push(d.id); g.toast(`📜 DECREE: ${d.name}`, 'quest'); }
          return decreeNode(g);
        } };
      }),
      { text: 'Done', action: () => null },
    ],
  };
}

// ---------------------------------------------------------------- shops
function openShop(g, id) {
  const def = SHOPS[id];
  const st = g.state;
  const greet = pick(def.greet);
  if (id === 'proshop' && !st.quest.flags.metGus) {
    st.quest.flags.metGus = true;
    return {
      name: 'Gus', title: 'Pro Shop',
      text: `"New guy, huh? Pension doesn't cover squat around here. Here's the deal: golfers around here are TERRIBLE. Balls everywhere. Roughs, bunkers, ponds.\n\nYou bring 'em to me, I pay two bucks a ball. No questions."\n\n*He leans in.*\n\n"Pockets only hold one ball, genius. Buy a bucket. And if you want REAL money... there's a guy. Behind the maintenance shed. Calls himself Doc."`,
      choices: [{ text: 'Browse the shop', action: () => { openShop(g, id); g.ui.closeDialogue(); return 'keep'; } }, { text: 'Leave', action: () => null }],
    };
  }
  if (id === 'doc' && st.quest.flags.teaShortage && !st.quest.flags.c2Doc) {
    st.quest.flags.c2Doc = true;
    return {
      name: 'Doc Pratt', title: 'Mobile Wellness Provider (panicking)',
      text: `"They raided my guy in Hialeah. Feds, fish & wildlife, a very angry botanist. The Rhino Tea pipeline is DRY, and what's left costs double.

But. I have the original recipe. Three ingredients:

1. Earl Grey tea bags. Liquor Barrel, four bucks.
2. Antler shavings. There's a moose head in the clubhouse Grill Room. Nobody's looked at it since 1994. Go at night.
3. A tooth. From Mr. Chompers. He sheds 'em on his sunning rock at Gator Pond. He does NOT like people touching his rock.

Brew it at your place. Low heat. Patience. Then we never pay retail again."`,
      choices: [{ text: '"A gator tooth. Sure. Totally normal Tuesday."', action: () => null }, { text: 'Browse the van anyway', action: () => { openShop(g, id); g.ui.closeDialogue(); return 'keep'; } }],
    };
  }
  if (id === 'doc' && !st.quest.flags.metDoc) {
    st.quest.flags.metDoc = true;
    st.inv.pills += 5;
    return {
      name: 'Doc Pratt', title: 'Mobile Wellness Provider',
      text: '"Well, well. Gus sent you? Name\'s Doc. Dr. Marvin Pratt. The \'Dr.\' is honorary. The state took the rest.\n\nHere\'s what I got: BLUE BOYS. Little blue pills. Every man in this zip code wants \'em and none of \'em want their doctor to know.\n\nFirst five are on the house. Look for the fellas with that... hungry look. You sell \'em, you come back, we both get rich."\n\n(Got 5 Blue Boys 💊)',
      choices: [{ text: '"What else you got?"', action: () => { openShop(g, id); g.ui.closeDialogue(); return 'keep'; } }, { text: 'Leave', action: () => null }],
    };
  }
  const wholesale = st.perks.legend ? 0.7 : 1;
  g.ui.openShop(def, g, {
    greet,
    info: (it) => {
      if (it.id === 'sellballs') return { label: `+${money(st.inv.balls * 2)}`, disabled: st.inv.balls <= 0, desc: `You have ${st.inv.balls} ball${st.inv.balls === 1 ? '' : 's'}. $2 each.` };
      if (it.id === 'detector') return { owned: st.owned.detector, label: st.owned.detector ? 'OWNED' : null, disabled: st.owned.detector };
      if (id === 'pelican' && st.perks.freebar && it.id !== 'towel') return { price: 0, label: "FREE (Rhonda's tab)" };
      if (it.id === 'bucket') return { owned: st.ballCap >= 20, label: st.ballCap >= 20 ? 'OWNED' : null, disabled: st.ballCap >= 20 };
      if (it.id === 'hopper') return { owned: st.hopper, label: st.hopper ? 'OWNED' : null, disabled: st.hopper };
      if (it.id === 'drone') return { desc: `${it.desc} Own: ${st.drones}/5`, disabled: st.drones >= 5 };
      if (it.id === 'polo') return { owned: st.owned.polo, label: st.owned.polo ? 'OWNED' : null, disabled: st.owned.polo };
      if (it.id === 'chain' || it.id === 'rolex') return { owned: st.owned[it.id], label: st.owned[it.id] ? 'OWNED' : null, disabled: st.owned[it.id] };
      if (it.id.startsWith('w_')) { const w = it.id.slice(2); return { owned: st.weapons.includes(w), label: st.weapons.includes(w) ? 'OWNED' : null, disabled: st.weapons.includes(w) }; }
      if (id === 'boutique') {
        const [kind, val] = it.id.split('_');
        const v = kind === 'shirt' ? +val : kind === 'socks' ? '#ffffff' : val;
        const key = kind === 'socks' ? 'sock' : kind;
        const has = st.wardrobe[key].includes(v);
        const wearing = st.look[key] === v;
        return { owned: has, label: wearing ? 'WEARING' : has ? 'WEAR' : null, price: has ? 0 : it.price };
      }
      if (id === 'buffet') { const early = st.minutes >= 15 * 60 && st.minutes < 17 * 60; return { price: early ? 9 : 18, label: early ? '$9 EARLY BIRD' : '$18' }; }
      if (id === 'tiki' && st.minutes >= 16 * 60 && st.minutes < 18 * 60) return { price: Math.ceil(it.price / 2), label: `${money(Math.ceil(it.price / 2))} HAPPY HR` };
      if (id === 'doc') return { price: Math.round(it.price * wholesale * (it.id.startsWith('tea') && st.quest.flags.teaShortage && !st.quest.flags.homebrew ? 2 : 1)) };
      return {};
    },
    buy: (it) => {
      let price = it.price;
      if (id === 'buffet') price = st.minutes >= 15 * 60 && st.minutes < 17 * 60 ? 9 : 18;
      if (id === 'tiki' && st.minutes >= 16 * 60 && st.minutes < 18 * 60) price = Math.ceil(price / 2);
      if (id === 'pelican' && st.perks.freebar && it.id !== 'towel') price = 0;
      if (id === 'doc') price = Math.round(price * wholesale * (it.id.startsWith('tea') && st.quest.flags.teaShortage && !st.quest.flags.homebrew ? 2 : 1));
      if (it.id === 'sellballs') {
        const n = st.inv.balls;
        if (!n) return;
        st.inv.balls = 0;
        st.counters.ballsSold += n;
        g.addMoney(n * 2, 'golf balls');
        return;
      }
      if (id === 'boutique') {
        const [kind, val] = it.id.split('_');
        const v = kind === 'shirt' ? +val : kind === 'socks' ? '#ffffff' : val;
        const key = kind === 'socks' ? 'sock' : kind;
        if (!st.wardrobe[key].includes(v)) {
          if (price > st.money) { audio.play('fail'); g.ui.hint('Pierre does not do layaway.'); return; }
          if (price) g.spend(price);
          st.wardrobe[key].push(v);
          g.xp('stat', price >= 60 ? 2 : price > 0 ? 1 : 0);
          audio.play('buy');
        }
        st.look[key] = v;
        g.player.setLook(st.look);
        return;
      }
      if (price > st.money) { audio.play('fail'); g.ui.hint("You can't afford that. Fixed income, remember?"); return; }
      g.spend(price);
      audio.play('buy');
      const add = (k, n) => (st.inv[k] += n);
      switch (it.id) {
        case 'beer6': add('beer', 6); st.quest.flags.boughtBeer = true; break;
        case 'beer24': add('beer', 24); st.quest.flags.boughtBeer = true; break;
        case 'beer1': add('beer', 1); st.quest.flags.boughtBeer = true; break;
        case 'wine': add('wine', 1); break;
        case 'flowers': add('flowers', 1); break;
        case 'teabags': add('teabags', 1); break;
        case 'beer2': add('beer', 2); st.quest.flags.boughtBeer = true; break;
        case 'bushwacker': st.buffs.colada = 240; st.buzz = Math.min(100, st.buzz + 32); g.ui.hint('🥤 Brain freeze AND a buzz. Efficient.', 2.5); break;
        case 'towel': add('towel', 1); break;
        case 'detector': st.owned.detector = true; g.toast('🔍 Metal detector acquired! Walk the sand and listen for the beeps.', 'quest', 6); break;
        case 'sunscreen': g.player.hp = Math.min(g.maxHp(), g.player.hp + 20); break;
        case 'lotto': {
          const r = Math.random();
          const win = r < 0.004 ? 1000 : r < 0.05 ? 50 : r < 0.2 ? 10 : 0;
          if (win) { g.addMoney(win, 'scratch-off'); g.ui.hint(`🎟️ WINNER! ${money(win)}!`); } else g.ui.hint(pick(['🎟️ Loser. Barb snorts.', '🎟️ "Better luck next time, hon." There is no better luck.']));
          break;
        }
        case 'colada': st.buffs.colada = 180; st.buzz = Math.min(100, st.buzz + 25); break;
        case 'bucket': st.ballCap = 20; g.toast('🪣 Bucket acquired! Carry 20 balls.', 'quest'); break;
        case 'hopper': st.hopper = true; st.ballCap = 200; g.toast('🌀 Ball-Hopper installed! Drive over balls to vacuum them up.', 'quest'); break;
        case 'drone': st.drones++; g.spawnDrones(); g.toast('🛸 Drone deployed! It collects balls automatically.', 'quest'); break;
        case 'polo': st.owned.polo = true; g.xp('stat', 2); break;
        case 'chain': st.owned.chain = true; g.xp('stat', 3); break;
        case 'rolex': st.owned.rolex = true; g.xp('stat', 2); break;
        case 'pills5': add('pills', 5); break;
        case 'pills20': add('pills', 20); break;
        case 'tea': add('tea', 1); break;
        case 'tea5': add('tea', 5); break;
        case 'meal': g.player.hp = g.maxHp(); st.buzz = Math.max(0, st.buzz - 60); g.xp('str', 1); g.ui.hint('🍗 You ate 4 plates. The staff applauded.'); break;
        default:
          if (it.id.startsWith('w_')) { g.giveWeapon(it.id.slice(2)); }
      }
    },
  });
  return 'shop';
}

function openSal(g) {
  const st = g.state;
  const disc = st.perks.saldiscount ? 0.75 : 1;
  const items = () => [
    ...CART_MODS.map((m) => ({ ...m, icon: { governor: '⚡', lift: '🛞', rims: '💿', neon: '🌈', speakers: '🔊', horn: '📯', nuts: '🥜', flag: '🚩', turbo: '🔥', leather: '🛋️' }[m.id] })),
    { id: 'paint', name: 'Custom Paint Job', price: 100, icon: '🎨', desc: 'Cycle through Sal\'s finest colors.' },
    { id: 'repair', name: 'Fish Your Cart Out Of A Pond', price: 0, icon: '🐊', desc: 'Free if it\'s wet. Sal\'s seen it all.' },
  ];
  g.ui.openShop({ title: "SAL'S CART CUSTOMS" }, g, {
    greet: pick(['"Governor? I don\'t know her."', `"${st.perks.saldiscount ? "Gloria sent you? ...Fine. 25% off. Don't tell her I said hi." : "You break it, you bought it. You buy it, I'll break the law for it."}"`]),
    items,
    info: (it) => {
      if (it.id === 'paint') return { price: Math.round(100 * disc) };
      if (it.id === 'repair') return { label: g.playerCart.sunk ? 'FREE' : 'N/A', disabled: !g.playerCart.sunk };
      const has = g.playerCart.upgrades[it.id];
      return { owned: has, label: has ? 'INSTALLED' : money(Math.round(it.price * disc)), disabled: has, price: Math.round(it.price * disc) };
    },
    buy: (it) => {
      if (it.id === 'repair') { g.recoverCart(); return; }
      const price = Math.round(it.price * disc);
      if (price > st.money) { audio.play('fail'); g.ui.hint("Sal doesn't do layaway."); return; }
      g.spend(price);
      audio.play('buy');
      if (it.id === 'paint') {
        const i = (PAINTS.indexOf(st.cart.color) + 1) % PAINTS.length;
        st.cart.color = PAINTS[i];
        g.playerCart.setPaint(PAINTS[i]);
        return;
      }
      st.cart.upgrades[it.id] = true;
      g.playerCart.upgrades[it.id] = true;
      g.playerCart.rebuild();
      if (it.stat) g.xp('stat', it.stat * 2);
      g.toast(`🔧 Installed: ${it.name}`, 'quest');
      if (it.id === 'turbo') g.ui.hint('Hold SHIFT while driving for NITROUS. 🔥', 5);
      if (it.id === 'horn') g.ui.hint('Press H in the cart. Enjoy.', 4);
    },
  });
  return 'shop';
}

export { DAYS, WEAPONS, LADIES, RECRUITS, CONCESSION };
