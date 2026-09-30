# 🌴 SUNSET PALMS — *Retirement Is a Crime*

A 3D open-world retirement sim built on **three.js**. You're Lee (or whoever you name him), 72, freshly "relocated" to a 55+ gated community after The Incident in Boca. Drive golf carts. Drink beer. Deal boner pills. Flirt with widows. Brawl with the country-club set. Take over the HOA.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Add `?play` to the URL to skip the title screen and jump straight in.

**Shareable build:** `npm run build` produces `dist/index.html`, one self-contained ~850 KB file. Double-click it and it runs, no server needed.

## Controls

| Key | Action | Key | Action |
|---|---|---|---|
| WASD | Walk / drive | Mouse | Look (click to lock) |
| Shift | Brisk shuffle / Nitrous | Space | Hop / handbrake drift |
| E | Interact / enter & exit carts | Click / F | Swing club / punch |
| Right-click / G | Pocket sand (sand wedge) | Q / 1-6 | Switch club |
| B | Drink a beer | P (hold) | Pee. Anywhere. |
| H | Horn | R | Cart radio |
| Tab | Phone: stats, bag, romance, empire | M | Map |
| Esc | Pause / settings | | |

**Gamepad:** left stick move/steer • right stick look • RT/LT gas & brake • A interact • X swing • Y drink • B hop/drift • LB switch club • RB pocket sand • L3 sprint/nitrous • R3 horn • D-pad: radio / pee / map • Start pause • Back phone. Menus: D-pad or arrow keys + A/Enter.

**Reviewer shortcuts:** `]` = +$1,000 • `[` = +1 to all stats • `` ` `` (backtick) = skip 3 hours

## What's in the demo

**The map.** A 600×600 m gated community:
- Palmetto Links, a 6-hole golf course with 3 ponds (one has a gator warning), bunkers, rolling mounds and 4 plywood jump ramps
- Clubhouse with pool, tiki bar, shuffleboard and pickleball
- A commercial strip: Liquor Barrel, Golden Coral buffet, HOA Office
- The shady maintenance lot: Sal's Cart Customs, and Doc's van
- 72 pastel stucco houses with flamingos, gnomes, mailboxes and parked carts
- A full day/night cycle (one day is 12 real minutes) with street lamps, neon and headlights

**Core loops**
- **Golf carts.** Arcade handling with drift, suspension, speed-bump hops, jump ramps and pond splashdowns. Hop into any cart, or yank a senior out of theirs, GTA-style. 10 visual mods at Sal's: lift kit, chrome spinners, neon underglow, bass speakers, nitrous, La Cucaracha horn, and truck nuts with pendulum physics.
- **Beer.** Buzz raises CHA and STR as liquid courage, then you start to slur. The screen wobbles, doubles and tilts. At 100 you black out and wake up somewhere embarrassing. Your bladder fills; press P.
- **Legal money.** Golf balls go from pockets (1 ball) to a bucket (20) to a cart vacuum hopper (200) to autonomous drones. Gus buys them at $2 each. Golfers keep slicing new ones into the ponds.
- **Illegal money.** Doc sells Blue Boys and Rhino Horn Tea wholesale. Sell them to residents marked 💊/🍵. Stat checks show their odds up front: upsell with CHA, strong-arm with INT.
- **Beverage cart empire.** Take over Chip's 3 course carts by undercutting him ($) or intimidating the operator. Keep them stocked and they pay out every hour.
- **Romance.** Six ladies across 3 tiers, each with likes, hates, pickup lines, dates and perks. Married ones come with jealous husbands: stare them down for loot, or brawl. The top tier is Tammy the Cart Girl.
- **Brawling.** Fists, putter, sand wedge (with pocket sand), 7-iron, driver, and Frank's titanium driver. Knockback, launches, hit-stop, KO stars. Nobody dies; they nap. You can loot their wallets.
- **HOA heat.** Witnesses (Security, Karen, snitchy neighbors) report you. Officer Dale chases you in his cart, bails out to pursue on foot, and busts you for a fine and confiscation. Deputy Earl joins at 3 heat.
- **Gang.** Recruit 4 geezer enforcers: an ex-boxer, a man with two titanium hips, a Korean War vet, and a guy whose walker is a weapon. They follow you, fight for you, or guard turf.
- **Rival sabotage.** After you humble Chip, his goons raid your carts and drones on a timer.
- **HOA takeover.** Win Sunday's election (campaign door to door, buy votes), or blackmail Karen with dirt from Linda or a late-night dumpster dive. Then issue decrees like the Bingo Levy, the Rival Colors Ban and the Security Budget Cut.
- **Golf cart races.** "Rocket" Ron runs the Back Nine Grand Prix out of the clubhouse lot: a 17-checkpoint lap with AI rivals and three bet tiers ($50 is winnable stock; $500 needs nitrous).
- **Mini-games.** Chug-Off at the Tiki Hut (or vs. Millie), interactive Bingo at the clubhouse (Karen calls it, it's rigged, and a false bingo is an HOA violation), and a Rhino Tea brewing thermostat.
- **Lawn parties.** Throw one from your front door: neighbors dance under string lights, you earn Status and votes, and Karen shows up with a noise complaint.
- **Wardrobe.** The clubhouse boutique sells 7 Hawaiian shirts, hats, shades and white tube socks. Change outfits at home; style adds Status.
- **Weather.** Florida afternoon thunderstorms bring rain, lightning, thunder, slick roads and residents panicking about their perms.
- **Voices.** Every resident mumbles in Animal Crossing-style old-folks gibberish.
- **Chapter 1 story** runs through 12 quest steps, then **Chapter 2: Rhino Rising** (7 steps): a tea shortage, a night-time antler heist, stealing a tooth from Mr. Chompers the gator, home brewing, and a boss fight with Chip's father "The Deuce". Free-roam goals follow.
- 22 achievements, graphics quality presets (Low/Medium/High), auto-save when you sleep, and three procedural radio stations plus a text-to-speech talk-radio station.

Everything is procedural: all models, textures, music and sound effects are generated in code, with no asset files.

## Code map

```
src/
  main.js            boot, title/intro, main loop, menus
  core/              input, audio synth + radio, camera rig, utils
  gfx/               canvas textures, materials (wind shader), batching, sky, water, particles, post FX
  world/             layout data (map), terrain/height, collision, world builder
  entities/          characters (procedural rig), carts (physics), props/balls/pickups
  game/              game state + systems, NPC AI, player, traffic AI, dialogue, quests, data
  ui/                HUD/dialogue/shops/menus, minimap
```

Most tuning lives in `src/game/data.js` (prices, weapons, mods, ladies, recruits) and at the top of `src/game/game.js` (time scale, default state).
