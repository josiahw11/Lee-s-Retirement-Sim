// Ambient life: NPC-to-NPC gossip conversations and time-of-day routines.
import { pick, chance, rand } from '../core/utils.js';

const CONVOS = [
  ['Did you hear about Phyllis?', 'The hip or the pool boy?', 'Both. Same day.'],
  ["They're raising the HOA dues again.", "Karen needs new teeth.", 'Again?!'],
  ['My grandson started a podcast.', 'What\'s a podcast?', 'Nobody knows, Marv.'],
  ['Is it hot today?', "It's Florida.", 'So... yes?'],
  ['I saw that new fella drink a beer at 9 AM.', 'Hero.', 'Absolute hero.'],
  ['The early bird moved to 3:15.', 'THIS is how civilizations fall.', 'I blame the Democrats.', 'I blame the Republicans.', 'I blame Karen.', 'Yeah, Karen.'],
  ['My doctor says I need to cut back on salt.', 'What does he know?', "He's 34."],
  ['Somebody knocked over all the flamingos on Egret.', 'Kids.', "There are no kids here, Herb."],
  ['I love your hat.', "It's a lampshade.", 'Still.'],
  ['Did you take your pills?', 'Which ones?', 'ALL of them.'],
  ['Walker Wallace did a wheelie on his walker yesterday.', 'Show-off.', "He's 93!", 'Show-off.'],
  ["Tammy gave me a free hot dog.", 'She likes you.', "She said I remind her of her grandfather."],
];

export class Life {
  constructor(g) {
    this.g = g;
    this.t = 0;
    this.convos = [];
  }

  update(dt) {
    const g = this.g;
    this.t -= dt;
    // run active conversations
    for (const c of this.convos) {
      c.t -= dt;
      if (c.t <= 0) {
        if (c.i >= c.lines.length || c.a.state !== 'chat' || c.b.state !== 'chat') {
          c.done = true;
          for (const n of [c.a, c.b]) if (n.state === 'chat') n.resumeBase();
          continue;
        }
        const speaker = c.i % 2 ? c.b : c.a;
        speaker.say(c.lines[c.i], 2.6);
        speaker.char.play(pick(['shake', 'point', 'wave']), 1);
        c.i++;
        c.t = 2.8;
      }
    }
    this.convos = this.convos.filter((c) => !c.done);
    if (this.t > 0) return;
    this.t = 1.5;
    // start a new chat between two wanderers who happen to be close
    const p = g.player;
    if (this.convos.length >= 3) return;
    const cands = g.npcs.filter((n) => n.role === 'resident' && n.state === 'wander' && !n.cart && Math.hypot(n.x - p.x, n.z - p.z) < 40);
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        const a = cands[i], b = cands[j];
        if (Math.hypot(a.x - b.x, a.z - b.z) > 5 || !chance(0.35)) continue;
        for (const n of [a, b]) { n.state = 'chat'; n.target = null; }
        a.data.chatWith = b;
        b.data.chatWith = a;
        this.convos.push({ a, b, lines: pick(CONVOS), i: 0, t: 0.4 });
        return;
      }
    }
  }
}

// Where residents like to be at a given hour (used when picking a new wander target).
export function routineZone(g, npc) {
  const h = g.state.minutes / 60;
  if (npc.homePt && (h >= 22.5 || h < 6.5)) return 'home';
  if (h >= 17.5 && h < 22.5 && chance(0.45)) return pick(['pool', 'tiki', 'clubhouse']);
  if (h >= 7 && h < 10 && chance(0.3)) return 'shuffle';
  return null;
}

export const ROUTINE_ZONES = {
  pool: { x0: 47, x1: 82, z0: -18, z1: 10 },
  tiki: { x0: 88, x1: 110, z0: 4, z1: 14 },
  clubhouse: { x0: -8, x1: 40, z0: 8, z1: 16 },
  shuffle: { x0: 48, x1: 80, z0: 28, z1: 44 },
};

export { rand };
