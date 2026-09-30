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
  { id: 'casino', icon: '🎰', name: 'Lucky Lady Casino', desc: 'Blackjack with Bernadette, the Golden Gam-Gam slots, a bar. Off the end of Boca Pier.', open: (g) => hr(g) >= 18 || hr(g) < 2, when: 'Nightly 6PM–2AM', at: () => ({ x: BOAT.door.x, z: BOAT.door.z }) },
  { id: 'aqua', icon: '💦', name: 'Aqua Jazz with Chad', desc: 'Water-aerobics rhythm game in the clubhouse pool. +STR, the ladies notice.', ...daily(10, 11.5), at: () => ({ x: 63, z: -11.6 }) },
  { id: 'karaoke', icon: '🎤', name: 'Karaoke Night', desc: 'Sign up with DJ Manny at the Tiki Hut. Three original bangers.', ...daily(19, 23), at: (g) => g.world.pois.tiki },
  { id: 'earlybird', icon: '🍤', name: 'Early Bird Rush', desc: 'The Golden Coral gets mobbed at 3PM. Do not get between a senior and the prime rib.', ...daily(15, 16), at: (g) => g.world.pois.buffet },
  { id: 'golf', icon: '⛳', name: 'Closest to the Pin', desc: 'Challenge the golfers on the tees of Palmetto Links. Bet $50–$200.', open: () => true, when: 'Anytime', at: () => ({ x: HOLES[3].tee[0] + 1, z: HOLES[3].tee[1] }) },
  { id: 'pickle', icon: '🏓', name: 'Pickleball Hustle', desc: 'A real rally on the community courts. Dink, smash, and stay out of the kitchen. Bet $40, or $150 vs the club champ.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.pickleball },
  { id: 'shuffle', icon: '🥌', name: 'Shuffleboard Hustle', desc: 'A real frame on the courts against a shark.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.shuffle },
  { id: 'chug', icon: '🍺', name: 'Chug-Off', desc: 'Challenge the Tiki Hut regulars.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.tiki },
  { id: 'race', icon: '🏁', name: 'Back Nine Grand Prix', desc: '"Rocket" Ron runs cart races from the clubhouse lot.', open: () => true, when: 'Anytime', at: (g) => g.named.ron },
  { id: 'bingo', icon: '🎱', name: 'Bingo (rigged)', desc: 'Karen calls it at the clubhouse. A false bingo is an HOA violation.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.clubhouse },
  { id: 'detector', icon: '🔍', name: 'Metal detecting', desc: 'Beep your way across Boca Beach for buried loot. Detectors at the bait shack.', open: () => true, when: 'Anytime', at: () => ({ x: BEACH.bait.x + 5.5, z: BEACH.bait.z }) },
  { id: 'garage', icon: '🏷️', name: 'Garage sales', desc: 'Four driveways full of junk. Buy, haggle, or pocket it.', open: (g) => g.state.dow === 5 && between(8, 14)(g), when: 'Saturdays 8AM–2PM', at: (g) => { const s = g.garageSales?.sales[0]; return s ? { x: s.x, z: s.z } : null; } },
  { id: 'games', icon: '🏅', name: 'Senior Games', desc: 'Shuffleboard, Closest to the Pin, Chug-Off, then the podium.', open: (g) => g.state.dow === 6 && between(9, 18)(g), when: 'Sundays 9AM–6PM', at: () => ({ x: 3.5, z: 14.5 }) },
  { id: 'election', icon: '🗳️', name: 'HOA Election', desc: 'Register at the HOA Office and campaign; the vote is at the clubhouse.', open: (g) => g.state.dow === 6, when: 'Sundays 7PM', at: (g) => g.world.pois.hoa },
  { id: 'doc', icon: '💊', name: "Doc's Van", desc: 'Blue Boys and Rhino Horn Tea, wholesale. No questions.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.doc },
  { id: 'sal', icon: '🔧', name: "Sal's Cart Customs", desc: 'Lift kits, spinners, neon, nitrous, truck nuts.', open: () => true, when: 'Anytime', at: (g) => g.world.pois.sal },
];

export function activitiesTab(g) {
  const rows = ACTIVITIES.map((a) => {
    const open = a.open(g);
    const pos = a.at(g);
    return `<div class="act ${open ? 'open' : ''}"><div class="act-ic">${a.icon}</div><div class="act-body"><div class="act-name">${a.name} <span class="act-when">${a.when}</span></div><div class="act-desc">${a.desc}</div></div><div class="act-side"><span class="act-st">${open ? 'OPEN NOW' : 'closed'}</span>${pos ? `<button class="btn act-go" data-act="${a.id}">📍 Go</button>` : ''}</div></div>`;
  }).join('');
  const now = `${DAYS[g.state.dow]} ${fmt(hr(g))}`;
  return `<h3>Things to do <span style="opacity:.6;font-size:13px">— it's ${now}</span></h3>${g.waypoint ? `<div class="act-wp">📍 Waypoint set: <b>${g.waypoint.label}</b> <button class="btn" id="act-clear">clear</button></div>` : ''}<div class="acts">${rows}</div>`;
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
  const c = document.getElementById('act-clear');
  if (c) c.onclick = () => { g.waypoint = null; rerender(); };
}
