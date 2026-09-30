// The phone's ACTIVITIES tab: everything there is to do in Sunset Palms, what's open right now, and a
// "📍 Go" button that drops a waypoint (it overrides the quest marker until you arrive).
import { BEACH } from '../world/beach.js';
import { BOAT } from '../world/casinoboat.js';
import { HOLES } from '../world/layout.js';
import { DAYS } from '../core/utils.js';

const hr = (g) => g.state.minutes / 60;
const between = (a, b) => (g) => hr(g) >= a && hr(g) < b;
const daily = (a, b) => ({ open: between(a, b), when: `Daily ${fmt(a)}–${fmt(b)}` });
function fmt(h) {
  const hh = Math.floor(h) % 24, ap = hh < 12 ? 'AM' : 'PM';
  return `${hh % 12 || 12}${ap}`;
}

export const ACTIVITIES = [
  { id: 'casino', cat: 'night', icon: '🎰', name: 'Lucky Lady Casino', desc: 'Blackjack with Bernadette, the Golden Gam-Gam slots, a bar. Off the end of Boca Pier.', open: (g) => hr(g) >= 18 || hr(g) < 2, when: 'Nightly 6PM–2AM', at: () => ({ x: BOAT.door.x, z: BOAT.door.z }) },
  { id: 'aqua', cat: 'games', icon: '💦', name: 'Aqua Jazz with Chad', desc: 'Water-aerobics rhythm game in the clubhouse pool. +STR, the ladies notice.', ...daily(10, 11.5), at: () => ({ x: 63, z: -11.6 }) },
  { id: 'karaoke', cat: 'night', icon: '🎤', name: 'Karaoke Night', desc: 'Sign up with DJ Manny at the Tiki Hut. Three original bangers.', ...daily(19, 23), at: (g) => g.world.pois.tiki },
  { id: 'earlybird', cat: 'hustle', icon: '🍤', name: 'Early Bird Rush', desc: 'The Golden Coral gets mobbed at 3PM. Do not get between a senior and the prime rib.', ...daily(15, 16), at: (g) => g.world.pois.buffet },
  { id: 'golf', cat: 'games', icon: '⛳', name: 'Closest to the Pin', desc: 'Challenge the golfers on the tees of Palmetto Links. Bet $50–$200.', open: () => true, when: 'Anytime', at: () => ({ x: HOLES[3].tee[0] + 1, z: HOLES[3].tee[1] }) },
  { id: 'pickle', cat: 'games', icon: '🏓', name: 'Pickleball Hustle', desc: 'A real rally on the community courts. Dink, smash, and stay out of the kitchen. Bet $40, or $150 vs the club champ.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.pickleball },
  { id: 'dealer', cat: 'drive', icon: '🚙', name: "Honest Abe's Pre-Owned Carts", desc: 'The Stretch, the Beach Buggy and the Hearse. Test drives welcome. Next to Sal’s.', open: () => true, when: 'Anytime', at: () => ({ x: -214, z: 51 }) },
  { id: 'fishing', cat: 'games', icon: '🎣', name: 'Pier fishing', desc: 'Borrow a rod from Fishin\' Phil on Boca Pier. Mullet to grouper; legend says the Silver King bites at night. Captain Roy buys your catch.', open: () => true, when: 'Anytime (best at dawn & dusk)', at: () => ({ x: 452, z: 19 }) },
  { id: 'derby', cat: 'drive', icon: '💥', name: 'Bumper Brawl', desc: 'Golf-cart demolition derby behind the strip. Six carts, one winner. Hit them in the side. See Derby Dan on Fairway Dr.', open: (g) => hr(g) >= 17 || hr(g) < 1, when: 'Nightly 5PM–1AM', at: () => ({ x: 205, z: -39 }) },
  { id: 'shuttle', cat: 'drive', icon: '🚐', name: 'Senior Shuttle', desc: 'Crazy Taxi, but it\'s a golf cart and everyone is 80. Fares, tips for air and drifts, and a shift clock. See Dispatcher Doris.', open: () => true, when: 'Anytime', at: () => ({ x: -31, z: 47 }) },
  { id: 'stunts', cat: 'drive', icon: '⭐', name: 'Unique Stunt Jumps', desc: 'Nine ramps, nine gaps. Slow-mo, glory, cash. Hold SPACE + steer in the air to spin. Some need a governor and nitrous.', open: () => true, when: 'Anytime', at: (g) => { const p = g.player, s = g.stunts?.pending().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; return s ? { x: s.x - s.sx * 12, z: s.z - s.sz * 12 } : null; } },
  { id: 'shuffle', cat: 'games', icon: '🥌', name: 'Shuffleboard Hustle', desc: 'A real frame on the courts against a shark.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.shuffle },
  { id: 'pong', cat: 'night', icon: '🥤', name: 'Beer Pong', desc: 'Six cups a side next to the Tiki Hut. Every cup you lose, you drink. Hit the Ballmer Peak.', open: (g) => hr(g) >= 11 || hr(g) < 2, when: 'Daily 11AM–2AM', at: (g) => g.world.pois.pong },
  { id: 'chug', cat: 'night', icon: '🍺', name: 'Chug-Off', desc: 'Challenge the Tiki Hut regulars.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.tiki },
  { id: 'race', cat: 'drive', icon: '🏁', name: 'Back Nine Grand Prix', desc: '"Rocket" Ron runs cart races from the clubhouse lot.', open: () => true, when: 'Anytime', at: (g) => g.named.ron },
  { id: 'bingo', cat: 'games', icon: '🎱', name: 'Bingo (rigged)', desc: 'Karen calls it at the clubhouse. A false bingo is an HOA violation.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.clubhouse },
  { id: 'detector', cat: 'hustle', icon: '🔍', name: 'Metal detecting', desc: 'Beep your way across Boca Beach for buried loot. Detectors at the bait shack.', open: () => true, when: 'Anytime', at: () => ({ x: BEACH.bait.x + 5.5, z: BEACH.bait.z }) },
  { id: 'garage', cat: 'hustle', icon: '🏷️', name: 'Garage sales', desc: 'Four driveways full of junk. Buy, haggle, or pocket it.', open: (g) => g.state.dow === 5 && between(8, 14)(g), when: 'Saturdays 8AM–2PM', at: (g) => { const s = g.garageSales?.sales[0]; return s ? { x: s.x, z: s.z } : null; } },
  { id: 'games', cat: 'games', icon: '🏅', name: 'Senior Games', desc: 'Shuffleboard, Closest to the Pin, Chug-Off, then the podium.', open: (g) => g.state.dow === 6 && between(9, 18)(g), when: 'Sundays 9AM–6PM', at: () => ({ x: 3.5, z: 14.5 }) },
  { id: 'election', cat: 'hustle', icon: '🗳️', name: 'HOA Election', desc: 'Register at the HOA Office and campaign; the vote is at the clubhouse.', open: (g) => g.state.dow === 6, when: 'Sundays 7PM', at: (g) => g.world.pois.hoa },
  { id: 'doc', cat: 'hustle', icon: '💊', name: "Doc's Van", desc: 'Blue Boys and Rhino Horn Tea, wholesale. No questions.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.doc },
  { id: 'sal', cat: 'drive', icon: '🔧', name: "Sal's Cart Customs", desc: 'Lift kits, spinners, neon, nitrous, truck nuts.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.sal },
];

const CATS = [['all', 'All'], ['drive', '🛺 Driving'], ['night', '🍺 Nightlife'], ['games', '🎯 Games'], ['hustle', '💰 Hustles']];

export function activitiesTab(g) {
  const f = g.actFilter || 'all';
  // what's open right now floats to the top
  const list = ACTIVITIES.filter((a) => f === 'all' || a.cat === f).map((a, i) => ({ a, i, open: a.open(g) })).sort((x, y) => (y.open - x.open) || (x.i - y.i));
  const chips = `<div class="act-cats">${CATS.map(([k, n]) => `<button class="act-cat ${k === f ? 'on' : ''}" data-cat="${k}">${n}</button>`).join('')}</div>`;
  const rows = list.map(({ a }) => {
    const open = a.open(g);
    const pos = a.at(g);
    return `<div class="act ${open ? 'open' : ''}"><div class="act-ic">${a.icon}</div><div class="act-body"><div class="act-name">${a.name} <span class="act-when">${a.when}</span></div><div class="act-desc">${a.desc}</div></div><div class="act-side"><span class="act-st">${open ? 'OPEN NOW' : 'closed'}</span>${pos ? `<button class="btn act-go" data-act="${a.id}">📍 Go</button>` : ''}</div></div>`;
  }).join('');
  const now = `${DAYS[g.state.dow]} ${fmt(hr(g))}`;
  return `<h3>Things to do <span style="opacity:.6;font-size:13px">— it's ${now}</span></h3>${chips}${g.waypoint ? `<div class="act-wp">📍 Waypoint set: <b>${g.waypoint.label}</b> <button class="btn" id="act-clear">clear</button></div>` : ''}<div class="acts">${rows}</div>`;
}

export function bindActivities(g, rerender) {
  for (const b of document.querySelectorAll('.act-go')) {
    b.onclick = () => {
      const a = ACTIVITIES.find((x) => x.id === b.dataset.act);
      const p = a.at(g);
      if (!p) return;
      g.waypoint = { x: p.x, z: p.z, label: `${a.icon} ${a.name}` };
      g.ui.toast(`📍 Waypoint set: ${a.name}`, 'quest', 3);
      rerender();
    };
  }
  for (const b of document.querySelectorAll('.act-cat')) b.onclick = () => { g.actFilter = b.dataset.cat; rerender(); };
  const c = document.getElementById('act-clear');
  if (c) c.onclick = () => { g.waypoint = null; rerender(); };
}
