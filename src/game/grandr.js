// GRANDR 💘 — the dating app for the recently widowed and the barely ambulatory.
// Swipe on silver singles (portraits rendered from the real 3D character system), match, and a date
// gets booked at a real place and time. She shows up in the world; the date is a three-round
// conversation with charm checks. Stand her up and she leaves you a one-star review.
import * as THREE from 'three';
import { Character, randomLook, randomName } from '../entities/character.js';
import { PLAYER_LOOK } from './player.js';
import { BEACH } from '../world/beach.js';
import { audio } from '../core/audio.js';
import { pick, chance, clamp, mulberry32, fmtTime, DAYS } from '../core/utils.js';

const BIOS = [
  'Recently widowed (third time). Not a black widow. Probably.',
  'Looking for a man with a working hip and a sense of humor. The hip is negotiable.',
  "I make a mean tuna casserole and I WILL outlive you.",
  'Ex-Rockette. Knees gone, attitude intact.',
  'Swipe right if you can still drive at night.',
  'I have eleven cats and zero regrets.',
  'My grandson made me this profile. Hi Tyler. Get off my phone.',
  'Seeking: a gentleman. Settling for: you, probably.',
  "I don't PLAY bingo. I DOMINATE bingo.",
  'Looking for someone to hold my purse while I play the slots.',
  "Former ER nurse. I've seen everything. Impress me.",
  'Allergic to shellfish, nonsense, and men named Gary.',
  "5'2\" in heels, 4'11\" without. Mostly without.",
  'I still have all my own teeth and I expect the same.',
  'Divorced four times. I know what I want: a fifth.',
];
const WANTS = ['Someone with a pulse', 'A man with his own teeth', 'Companionship & Wheel of Fortune', 'A dance partner (hips pending)', 'Somebody to drive me to the podiatrist', 'Trouble. Mild trouble.', 'A man who owns a golf cart. A NICE one.'];
export const INTERESTS = [
  { k: 'bingo', e: '🎱', t: 'Bingo' }, { k: 'cats', e: '🐈', t: 'Cats' }, { k: 'cruise', e: '🚢', t: 'Cruises' },
  { k: 'wine', e: '🍷', t: 'Boxed wine' }, { k: 'golf', e: '⛳', t: 'Golf' }, { k: 'church', e: '⛪', t: 'Church potlucks' },
  { k: 'slots', e: '🎰', t: 'Slots' }, { k: 'dance', e: '💃', t: 'Ballroom dancing' }, { k: 'buffet', e: '🍤', t: 'Early bird buffets' },
  { k: 'pills', e: '💊', t: '"Vitamins"' }, { k: 'gossip', e: '🗣️', t: 'Gossip' }, { k: 'garden', e: '🌺', t: 'Gardening' },
];
const TOPIC_LINES = {
  bingo: 'You tell her about the time you called a false bingo just to watch Karen\'s eye twitch.',
  cats: 'You ask about her cats. All eleven. By name. It takes forty minutes and she glows the entire time.',
  cruise: 'You swap cruise stories. Hers involve the Captain\'s table. Yours involve a lifeboat.',
  wine: 'You rank boxed wines. You both agree on Franzia Sunset Blush. It\'s fate.',
  golf: 'You explain your swing. She corrects your grip. Her hands are soft. Your slice is fixed.',
  church: 'You ask about the potluck circuit. She has OPINIONS about Barbara\'s seven-layer dip.',
  slots: 'You tell her you hit the Gam-Gam jackpot. She grabs your arm. "TEACH ME."',
  dance: 'You offer a dance. There\'s no music. She hums Glenn Miller. You both almost fall. It\'s perfect.',
  buffet: 'You share your buffet strategy: skip the salad, hit the shrimp, pocket the rolls. She\'s impressed.',
  pills: 'You mention you "know a guy" for vitamins. She winks. "Oh, I KNOW you know a guy."',
  gossip: 'You spill what you know about Chip Wainwright. She spills what she knows about Karen. You are both horrified and delighted.',
  garden: 'You ask about her hibiscus. She shows you 212 photos. You say "wow" at all of them.',
};
const LOCS = [
  { id: 'buffet', label: 'the Golden Coral', x: 203, z: 49 },
  { id: 'tiki', label: 'the Tiki Hut', x: 95, z: 8 },
  { id: 'gazebo', label: 'the Duck Pond gazebo', x: -97, z: 29 },
  { id: 'pelican', label: 'the Rusty Pelican', x: BEACH.bar.x + 9.5, z: BEACH.bar.z - 3 },
  { id: 'boat', label: 'the deck of the Lucky Lady', x: 505, z: 35.8, night: true },
];
const STREETS = ['Flamingo Dr', 'Egret Ln', 'Manatee Blvd', 'Heron Ct', 'Pelican Way', 'Palm Blvd'];

// ---------------------------------------------------------------- portraits (their own tiny renderer)
let pr = null;
const portraitCache = new Map();
export function portrait(key, look) {
  if (portraitCache.has(key)) return portraitCache.get(key);
  try {
    if (!pr) {
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 240;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
      renderer.setSize(200, 240, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xfff2e0, 0x6a4a5a, 1.6));
      const key1 = new THREE.DirectionalLight(0xffffff, 2.2);
      key1.position.set(1.2, 2.2, 2.4);
      scene.add(key1);
      const rim = new THREE.DirectionalLight(0xff9ec7, 1.6);
      rim.position.set(-2, 2, -1.5);
      scene.add(rim);
      const cam = new THREE.PerspectiveCamera(26, 200 / 240, 0.1, 20);
      pr = { renderer, scene, cam, canvas };
    }
    const ch = new Character(look);
    ch.setNear?.(true);
    pr.scene.add(ch.root);
    for (let i = 0; i < 20; i++) ch.update(1 / 30);
    const h = 1.5 * (look.height || 1);
    pr.cam.position.set(0.35, h + 0.12, 1.55);
    pr.cam.lookAt(0, h, 0);
    pr.scene.background = new THREE.Color(pick(['#ffd6e0', '#ffe8c2', '#d7f0ff', '#e6dcff']));
    pr.renderer.render(pr.scene, pr.cam);
    const url = pr.canvas.toDataURL('image/png');
    pr.scene.remove(ch.root);
    ch.dispose();
    portraitCache.set(key, url);
    return url;
  } catch (e) {
    portraitCache.set(key, '');
    return '';
  }
}

// ---------------------------------------------------------------- profiles
function makeProfiles(day) {
  const rnd = mulberry32(9001 + day * 31);
  const r = (a) => a[Math.floor(rnd() * a.length)];
  const out = [];
  for (let i = 0; i < 6; i++) {
    const look = randomLook(true);
    look.hat = rnd() < 0.3 ? r(['sunhat', 'visor']) : 'none';
    const ints = [];
    while (ints.length < 3) { const x = r(INTERESTS).k; if (!ints.includes(x)) ints.push(x); }
    out.push({
      id: `d${day}_${i}`, name: randomName(true), age: 66 + Math.floor(rnd() * 28), look,
      bio: r(BIOS), wants: r(WANTS), interests: ints, street: r(STREETS), miles: (0.1 + rnd() * 2.4).toFixed(1),
      picky: 0.1 + rnd() * 0.35,
    });
  }
  return out;
}

export class Grandr {
  constructor(g) {
    this.g = g;
    const s = g.state;
    s.grandr ||= { day: -1, profiles: [], i: 0, dates: [], reviews: [] };
    this.live = new Map(); // date id -> spawned NPC (never stored in the save)
  }

  get st() { return this.g.state.grandr; }

  ensureProfiles() {
    const st = this.st;
    if (st.day !== this.g.state.day) {
      st.day = this.g.state.day;
      st.profiles = makeProfiles(st.day);
      st.i = 0;
    }
  }

  rating() {
    const rv = this.st.reviews;
    if (!rv.length) return null;
    return rv.reduce((a, b) => a + b.stars, 0) / rv.length;
  }

  swipe(right) {
    const g = this.g;
    const st = this.st;
    const p = st.profiles[st.i];
    if (!p) return;
    st.i++;
    if (!right) { audio.play('click'); return null; }
    const rating = this.rating();
    const odds = clamp(0.25 + g.stat('cha') * 0.06 + g.stat('stat') * 0.05 - p.picky + (rating !== null ? (rating - 3) * 0.08 : 0) + (g.state.buffs.blue > 0 ? 0.1 : 0), 0.08, 0.92);
    if (Math.random() > odds) { audio.play('click'); return { match: false, p }; }
    // book a date
    const now = g.absMinutes();
    const dayStart = now - g.state.minutes;
    const loc = pick(LOCS.filter((l) => !l.night || g.state.quest.flags.c3Boarded || chance(0.3)));
    const hours = loc.night ? [20, 21] : [12, 16, 19];
    let when = null;
    for (const d of [0, 1440]) for (const hr of hours) if (when === null && dayStart + d + hr * 60 >= now + 75) when = dayStart + d + hr * 60;
    st.dates.push({ id: p.id, profile: p, loc: loc.id, when, status: 'pending' });
    audio.play('heart');
    return { match: true, p, loc, when };
  }

  update() {
    const g = this.g;
    const now = g.absMinutes();
    // dates that are over wander off once the conversation closes
    for (const [id, n] of this.live) {
      const d = this.st.dates.find((x) => x.id === id);
      if ((!d || d.status !== 'pending') && !n.talking) { g.removeNPC(n); this.live.delete(id); }
    }
    for (const d of this.st.dates) {
      if (d.status !== 'pending') continue;
      const loc = LOCS.find((l) => l.id === d.loc);
      if (!d.reminded && now >= d.when - 60) {
        d.reminded = true;
        g.ui.toast(`📱 Grandr: Your date with ${d.profile.name} is at ${fmtTime(d.when % 1440)} at ${loc.label}. Don't be late. Don't be weird.`, 'love', 7);
      }
      if (!this.live.has(d.id) && now >= d.when - 20 && now < d.when + 90) {
        const n = g.spawnNPC({ name: d.profile.name, female: true, role: 'date', x: loc.x, z: loc.z, state: 'static', look: d.profile.look, homePt: { x: loc.x, z: loc.z } });
        n.data.date = d;
        n.data.quiet = true;
        this.live.set(d.id, n);
      }
      if (now >= d.when + 90) {
        d.status = 'stood';
        this.review(d, 1, pick(['Stood me up. I did my HAIR.', 'Never showed. His cart was seen at the Tiki Hut. Coward.', 'No-show. I ate the whole shrimp tower alone. Worth it, honestly.']));
        g.ui.toast(`📱 Grandr: ${d.profile.name} left you a review. ★☆☆☆☆ "${this.st.reviews[this.st.reviews.length - 1].text}"`, 'heat', 7);
        this.despawn(d);
      }
    }
    // finished dates only live on as reviews: keep the save from growing forever
    if (this.st.dates.some((d) => d.status !== 'pending' && !this.live.has(d.id))) this.st.dates = this.st.dates.filter((d) => d.status === 'pending' || this.live.has(d.id));
  }

  despawn(d) {
    const n = this.live.get(d.id);
    if (n && !n.talking) { this.g.removeNPC(n); this.live.delete(d.id); }
  }

  clear() {
    for (const n of this.live.values()) this.g.removeNPC(n);
    this.live.clear();
  }

  review(d, stars, text) {
    this.st.reviews.push({ name: d.profile.name, stars, text });
    if (this.st.reviews.length > 12) this.st.reviews.shift();
  }

  // ---------------------------------------------------------------- phone tab
  renderTab() {
    const g = this.g;
    this.ensureProfiles();
    const st = this.st;
    const p = st.profiles[st.i];
    const rating = this.rating();
    const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
    let h = `<div class="gr-head"><span class="gr-logo">GRANDR 💘</span><span class="gr-rate">${rating === null ? 'No reviews yet' : `Your rating: ${stars(rating)} (${st.reviews.length})`}</span></div>`;
    if (p) {
      const img = portrait(p.id, p.look);
      h += `<div class="gr-card">
        <div class="gr-photo">${img ? `<img src="${img}" alt="">` : '👵'}</div>
        <div class="gr-info">
          <div class="gr-name">${p.name}, <b>${p.age}</b></div>
          <div class="gr-dist">📍 ${p.miles} mi away • ${p.street}</div>
          <p class="gr-bio">"${p.bio}"</p>
          <div class="gr-tags">${p.interests.map((k) => { const it = INTERESTS.find((x) => x.k === k); return `<span>${it.e} ${it.t}</span>`; }).join('')}</div>
          <div class="gr-wants"><b>Looking for:</b> ${p.wants}</div>
        </div>
      </div>
      <div class="gr-btns"><button class="gr-no" id="gr-no">✖</button><button class="gr-yes" id="gr-yes">💘</button></div>
      <div class="gr-left">${st.profiles.length - st.i - 1} more singles nearby today</div>`;
    } else {
      h += `<div class="gr-empty">You've swiped through every single within five miles. Twice. Come back tomorrow — people pass away, new ones move in. 🕊️</div>`;
    }
    const upcoming = st.dates.filter((d) => d.status === 'pending');
    if (upcoming.length) {
      h += `<h3>Upcoming dates</h3>${upcoming.map((d) => { const loc = LOCS.find((l) => l.id === d.loc); const day = Math.floor(d.when / 1440) === g.state.day ? 'Today' : 'Tomorrow'; return `<div class="gr-date">💘 <b>${d.profile.name}</b> • ${day} ${fmtTime(d.when % 1440)} • ${loc.label}</div>`; }).join('')}`;
    }
    if (st.reviews.length) h += `<h3>What the ladies say</h3>${st.reviews.slice(-4).reverse().map((r) => `<div class="gr-review"><span>${stars(r.stars)}</span> "${r.text}" <i>— ${r.name}</i></div>`).join('')}`;
    return h;
  }

  bindTab(rerender) {
    const yes = document.getElementById('gr-yes'), no = document.getElementById('gr-no');
    const go = (right) => {
      const res = this.swipe(right);
      rerender();
      if (res && res.match) {
        const loc = res.loc;
        const day = Math.floor(res.when / 1440) === this.g.state.day ? 'today' : 'tomorrow';
        const me = portrait('player', { ...PLAYER_LOOK, ...this.g.state.look });
        const her = portrait(res.p.id, res.p.look);
        const body = document.getElementById('menu-body');
        const ov = document.createElement('div');
        ov.className = 'gr-match';
        ov.innerHTML = `<div class="gr-match-t">IT'S A MATCH!</div><div class="gr-match-ph"><img src="${me}"><span>💘</span><img src="${her}"></div><p><b>${res.p.name}</b> wants to meet you ${day} at <b>${fmtTime(res.when % 1440)}</b>, at ${loc.label}.</p><p class="gr-small">"Don't be late. Don't be weird. Bring breath mints."</p><button class="btn" id="gr-ok">💃 It's a date</button>`;
        body.appendChild(ov);
        document.getElementById('gr-ok').onclick = () => ov.remove();
      } else if (res && res.match === false) {
        this.g.ui.toast(pick(['💔 No match. She swiped left so hard her phone flew into the pool.', '💔 No match. "Too young," apparently.', '💔 She left you on read. Rude.']), '', 3);
      }
    };
    if (yes) yes.onclick = () => go(true);
    if (no) no.onclick = () => go(false);
  }
}

// ---------------------------------------------------------------- the date itself
export function talkDate(g, n) {
  const d = n.data.date;
  const p = d.profile;
  const loc = LOCS.find((l) => l.id === d.loc);
  let score = 0;
  const topics = [...p.interests.slice(0, 1), ...INTERESTS.filter((i) => !p.interests.includes(i.k)).sort(() => Math.random() - 0.5).slice(0, 2).map((i) => i.k)].sort(() => Math.random() - 0.5);
  const C = (stat, diff) => ({ label: stat.toUpperCase().replace('INTIM', 'INT').replace('STAT', 'STA'), chance: g.chance(stat, diff) });
  const finale = () => {
    const tier = score >= 2 ? 'great' : score === 1 ? 'ok' : 'bad';
    d.status = 'done';
    const grandr = g.grandr;
    const close = () => { grandr.despawn(d); };
    if (tier === 'great') {
      return {
        name: p.name, title: 'The end of the date',
        text: `*She leans in.* "My place has a recliner with a heated seat and a view of the retention pond. Want to see it?"`,
        choices: [{ text: '"Lead the way."', action: () => {
          g.fadeOut(() => {
            const m = g.state.minutes;
            g.advanceTime((m < 7.5 * 60 ? 0 : 1440) + 7.5 * 60 - m); // wake up at 7:30 the next morning
            g.state.counters.conquests++;
            g.xp('stat', 2);
            g.xp('cha', 1);
            g.achievement('grandr');
            grandr.review(d, 5, pick(['Five stars. Would ride his golf cart again.', 'A gentleman. A scoundrel. Both. ★★★★★', 'He knew all eleven of my cats by the end. Marry me.']));
            close();
          }, 3, 'THE NEXT MORNING...', `${p.name} left her number on your bathroom mirror in lipstick. And a casserole.`, '#ff6fa8');
          return null;
        } }],
      };
    }
    if (tier === 'ok') {
      grandr.review(d, 3, pick(['Pleasant. Talked about his golf cart for forty minutes.', 'Nice enough. Tipped 10%. At a buffet.', 'Sweet man. Smells like beer and Bengay.']));
      g.xp('cha', 1);
      close();
      return { name: p.name, title: 'The end of the date', text: '*She pats your hand.* "This was nice. Let\'s do it again sometime." *She says "sometime" the way people say "never."*', choices: [{ text: 'Leave', action: () => null }] };
    }
    grandr.review(d, 1, pick(['He ordered for me. At a BUFFET.', 'Spent the whole date staring at the waitress.', 'Asked if I had a "rich sister." I do. Hands OFF.']));
    close();
    audio.play('splash', { vol: 0.4 });
    return { name: p.name, title: 'The end of the date', text: '*She throws her drink in your face.* "I have eleven cats and I\'ve NEVER been so insulted." *She leaves. The cats would\'ve been proud.*', choices: [{ text: 'Wipe your face. Leave.', action: () => null }] };
  };
  const round2 = () => ({
    name: p.name, title: `Date at ${loc.label}`,
    text: '"So what did you do before you retired? And what do you do NOW, Mr. Mysterious?"',
    choices: [
      { text: '"I sell... vitamins. Special vitamins."', tag: p.interests.includes('pills') ? '💊 her thing!' : 'risky', action: () => { if (p.interests.includes('pills') || chance(0.35)) score++; return finale(); } },
      { text: '"Retired astronaut. I don\'t like to talk about the moon."', check: C('cha', 5), action: () => { if (g.roll('cha', 5)) score++; return finale(); } },
      { text: '"I run this community."', tag: g.state.hoa.president ? 'you do!' : 'you don\'t', action: () => { if (g.state.hoa.president || g.roll('intim', 6)) score++; return finale(); } },
    ],
  });
  const round1 = {
    name: p.name, title: `Date at ${loc.label} • ${p.age} • ${p.interests.map((k) => INTERESTS.find((i) => i.k === k).e).join('')}`,
    text: `*${p.name} is here, right on time, in her good cardigan. She looks you up and down.*\n\n"Well. You look taller than your pictures. That's a first around here."`,
    choices: [
      ...topics.map((k) => {
        const it = INTERESTS.find((i) => i.k === k);
        return { text: `Talk about ${it.t.toLowerCase()} ${it.e}`, action: () => {
          if (p.interests.includes(k)) { score += 1; audio.play('heart'); return { name: p.name, title: 'Nailed it', text: `*${TOPIC_LINES[k]}*`, choices: [{ text: 'Keep going', action: () => round2() }] }; }
          return { name: p.name, title: 'Hmm.', text: `*She nods politely. She does not care about ${it.t.toLowerCase()}. At all.*`, choices: [{ text: 'Keep going', action: () => round2() }] };
        } };
      }),
      { text: '"You\'re even prettier than your profile."', check: C('cha', 4), action: () => { if (g.roll('cha', 4)) score++; return round2(); } },
    ],
  };
  return round1;
}

export { DAYS };
