# 🌴 SUNSET PALMS — *Retirement Is a Crime*

A 3D open-world retirement sim built on **three.js**. You're Lee (or whoever you name him), 72, freshly "relocated" to a 55+ gated community after The Incident in Boca. Drive golf carts. Drink beer. Deal boner pills. Flirt with widows. Brawl with the country-club set. Take over the HOA.

## Play it on a new computer

The game runs in any modern desktop browser (Chrome, Edge, Firefox or Safari) with WebGL, so no game install is needed. There are two ways to get it running.

### Option 1: download the ready-to-play file (easiest, no setup)

1. Sign in to GitHub. The repo is private, so you need an account with access.
2. Open the repo's **[Releases](https://github.com/josiahw11/Lee-s-Retirement-Sim/releases)** page and download **`sunset-palms.html`** from the latest release.
3. Double-click the file. It opens in your browser and plays. There's nothing to install and it needs no internet connection.

### Option 2: run it from the source code

This is the way to go if you want the newest version or plan to change the game.

1. **Install Node.js.** Get the **LTS** version from [nodejs.org](https://nodejs.org) (version 20.19 or newer; 22 or 24 recommended) and run the installer with the default options. To check it worked, open a terminal (Windows: *Command Prompt* or *PowerShell*; Mac: *Terminal*) and run `node -v`. It should print a version number.
2. **Get the code.** The newest version lives on the **`dev`** branch; `main` still holds the original v0.1 demo.
   - **With Git:**
     ```bash
     git clone -b dev https://github.com/josiahw11/Lee-s-Retirement-Sim.git
     ```
   - **Without Git:** on the GitHub page, switch the branch dropdown from `main` to `dev`, then choose **Code → Download ZIP** and unzip it anywhere.
3. **Start the game.**
   - **Windows:** double-click **`Play Sunset Palms (Windows).bat`** in the game folder.
   - **Mac:** double-click **`Play Sunset Palms (Mac).command`**. The first time, macOS may block it; right-click it, choose **Open**, then **Open** again. If it says it isn't executable, run `chmod +x "Play Sunset Palms (Mac).command"` once in Terminal from the game folder.
   - **Any computer, from a terminal:** in the game folder, run:
     ```bash
     npm install
     npm run play
     ```

   The first launch installs the game's tools (about a minute, needs internet). After that it starts in a few seconds. Your browser opens **http://localhost:5173** automatically; if it doesn't, open that address yourself. Keep the terminal window open while you play, and close it (or press Ctrl+C) to stop the game.

**Tips**
- Add `?play` to the address (`http://localhost:5173/?play`) to skip the title screen.
- **Play from a phone or tablet on the same Wi-Fi:** the terminal prints a `Network:` address such as `http://192.168.1.20:5173`. Open that on the other device, in landscape. Touch controls appear on first touch.
- **Make your own single-file copy:** run `npm run build`, and it writes `dist/index.html`. That one ~1 MB file has everything inlined, so you can double-click it, email it or put it on a USB stick.
- **Saves** live in the browser's storage, so they're per browser and per address: `localhost:5173` and the downloaded file keep separate saves, and saves don't follow you to another computer.

**Troubleshooting**
- *`node` / `npm` is not recognized:* Node.js isn't installed, or the terminal was opened before installing it. Install it, then open a new terminal.
- *"Vite requires Node.js version 20.19+":* your Node is too old. Install the current LTS from nodejs.org.
- *Port 5173 is already in use:* another copy is running, so close that terminal. Or use the other address Vite prints (for example `http://localhost:5174`).
- *Black or blank screen:* turn on hardware acceleration in the browser settings, update your graphics drivers, or try Chrome or Edge. In the game's Esc menu, the **Low** graphics preset helps older laptops.
- *The mouse doesn't turn the camera:* some browsers and embedded panes block mouse capture. Click and drag to look around instead, or use Z / C to rotate the camera.

## Controls

| Key | Action | Key | Action |
|---|---|---|---|
| WASD | Walk / drive | Mouse | Look (click to lock; click-drag where the browser blocks mouse capture) |
| Shift | Brisk shuffle / Nitrous | Space | Hop / handbrake drift |
| E | Interact / enter & exit carts | Click / F | Swing club / punch |
| Right-click / G | Pocket sand (sand wedge) | Q / 1-6 | Switch club |
| B | Drink a beer | P (hold) | Pee. Anywhere. |
| H | Horn | R | Cart radio |
| Tab | Phone: stats, bag, romance, empire | M | Map |
| Esc | Pause / settings | V | Photo mode (free camera, no HUD) |
| Z / C | Rotate camera | Scroll | Zoom |

**Touchscreen (phones & tablets, landscape):** controls appear on first touch: a floating stick on the left half walks and drives, dragging the right half looks around, and thumb buttons cover USE, swing, hop/drift, beer, sprint, horn, radio, clubs, pocket sand and pee, plus pause / phone / map up top.

**Gamepad:** left stick move/steer • right stick look • RT/LT gas & brake • A interact • X swing • Y drink • B hop/drift • LB switch club • RB pocket sand • L3 sprint/nitrous • R3 horn • D-pad: radio / pee / map • Start pause • Back phone. Menus: D-pad or arrow keys + A/Enter.

**Reviewer shortcuts:** `]` = +$1,000 • `[` = +1 to all stats • `` ` `` (backtick) = skip 3 hours. The pause menu (Esc) also has **Jump to Chapter 2 / 3 / 4** and **Summon Hurricane** buttons.

## What's in the demo

**The map.** A 600×600 m gated community:
- Palmetto Links, a 6-hole golf course with 3 ponds (one has a gator warning), bunkers, rolling mounds and plywood jump ramps (9 ramps in total around town)
- Clubhouse with pool, tiki bar, shuffleboard and pickleball
- A commercial strip: Liquor Barrel, Golden Coral buffet, HOA Office
- The shady maintenance lot: Sal's Cart Customs, and Doc's van
- 72 pastel stucco houses with flamingos, gnomes, mailboxes and parked carts
- **Boca Beach Club** (second map, through the front gate): sand, ocean, a drivable pier you can launch off, the Rusty Pelican beach bar, a bait & tackle shack, a lifeguard tower, seagulls
- A full day/night cycle (one day is 12 real minutes) with street lamps, neon and headlights

**Core loops**
- **Golf carts.** Arcade handling with drift, suspension, speed-bump hops, jump ramps and pond splashdowns. Hop into any cart, or yank a senior out of theirs, GTA-style. 10 visual mods at Sal's: lift kit, chrome spinners, neon underglow, bass speakers, nitrous, La Cucaracha horn, and truck nuts with pendulum physics.
- **Honest Abe's Pre-Owned Carts** (next to Sal's) sells three new models, and test drives are welcome. Sal's mods carry over to whichever cart you drive.
  - **The Stretch** is a limo cart; Senior Shuttle passengers tip 50% more.
  - **The Beach Buggy** has a roll cage and fat tires, and loves sand.
  - **The Hearse** is the fastest thing on the lot ("previous owner no longer needs it").
- **Unique Stunt Jumps.** Nine ramps around town, from the Grandkids Ramp to clearing the whole Duck Pond, a leap over Palm Blvd, porta-potties on the beach and a Pool Party Plunge (land it *in* the pool). Each has a slow-motion side camera, a verdict (short, clipped, in the drink, crooked) and a cash reward. They come in three tiers: stock cart, governor removed, governor plus nitrous. Hold Space and steer in the air to spin the cart, and land a clean 360 or 720 for a bonus.
- **Beer.** Buzz raises CHA and STR as liquid courage, then you start to slur. The screen wobbles, doubles and tilts. At 100 you black out and wake up somewhere embarrassing. Your bladder fills; press P.
- **Legal money.** Golf balls go from pockets (1 ball) to a bucket (20) to a cart vacuum hopper (200) to autonomous drones. Gus buys them at $2 each. Golfers keep slicing new ones into the ponds.
- **Illegal money.** Doc sells Blue Boys (side effects include a bow-legged waddle and a *very* strategically held newspaper) and Rhino Horn Tea wholesale. Sell them to residents marked 💊/🍵. Stat checks show their odds up front: upsell with CHA, strong-arm with INT.
- **Beverage cart empire.** Take over Chip's 3 course carts by undercutting him ($) or intimidating the operator. Keep them stocked and they pay out every hour.
- **Romance.** Seven ladies across 3 tiers, each with likes, hates, pickup lines, dates and perks. Married ones come with jealous husbands: stare them down for loot, or brawl. The top tier is Tammy the Cart Girl.
- **Brawling.** Fists, putter, sand wedge (with pocket sand), 7-iron, driver, and Frank's titanium driver. Knockback, launches, hit-stop, KO stars. Nobody dies; they nap. You can loot their wallets.
- **HOA heat.** Witnesses (Security, Karen, snitchy neighbors) report you. Officer Dale chases you in his cart, bails out to pursue on foot, and busts you for a fine and confiscation. Deputy Earl joins at 3 heat.
- **Gang.** Recruit 4 geezer enforcers: an ex-boxer, a man with two titanium hips, a Korean War vet, and a guy whose walker is a weapon. They follow you, fight for you, or guard turf.
- **Rival sabotage.** After you humble Chip, his goons raid your carts and drones on a timer.
- **HOA takeover.** Win Sunday's election (campaign door to door, buy votes), or blackmail Karen with dirt from Linda or a late-night dumpster dive. Then issue decrees like the Bingo Levy, the Rival Colors Ban and the Security Budget Cut.
- **Golf cart races.** "Rocket" Ron runs the Back Nine Grand Prix out of the clubhouse lot: a 17-checkpoint lap with AI rivals and three bet tiers ($50 is winnable stock; $500 needs nitrous).
- **Mini-games.** Chug-Off at the Tiki Hut (or vs. Millie), interactive Bingo at the clubhouse (Karen calls it, it's rigged, and a false bingo is an HOA violation), a Rhino Tea brewing thermostat, and **3D Shuffleboard Hustle**: a real frame on the courts against a shark who draws to open spots, guards his tens and blasts yours into the gutter.
- **Lawn parties.** Throw one from your front door: neighbors dance under string lights, you earn Status and votes, and Karen shows up with a noise complaint.
- **Wardrobe.** The clubhouse boutique sells 7 Hawaiian shirts, hats, shades and white tube socks. Change outfits at home; style adds Status.
- **Metal detecting.** A second legal hustle on the beach: the signal meter and beeps speed up near buried loot (quarters, wedding rings, a real Rolex, dentures, a 1715 doubloon).
- **Weather.** Florida afternoon thunderstorms bring rain, lightning, thunder, slick roads and residents panicking about their perms.
- **Hurricane Mildred.** Every so often a hurricane comes with a day's warning:
  - gusting winds shove carts and bend the palms
  - lawn flamingos and patio chairs fly through the air (and hit you)
  - the power goes out, and the neighbors throw a hurricane party at the clubhouse
  - afterwards, the HOA pays a bounty for every stray flamingo you bring back
- **The Lucky Lady casino boat** (moored off the Boca pier, 6PM–2AM): blackjack at Bernadette's table (charm her and she flashes her hole card; drink and you fumble), the Golden Gam-Gam slots with a progressive jackpot, and a bar.
- **Keg stands at the Tiki Hut.** Two regulars hoist you upside-down over the keg while the crowd counts. Balance with A/D; it gets twitchier as the buzz climbs. Every second is a real gulp. Beat Manny's house record for a free tab.
- **Senior Shuttle.** Crazy Taxi, but it's a golf cart and everyone is 80. Dispatcher Doris puts you on a shift clock. Residents wave you down under green, yellow and red light pillars (short, medium and long fares). Race them to the Golden Coral or Doc's van before they bail ("I'll walk! It's faster!"). Air, drifts and near misses earn tips, and the back seat reviews your driving.
- **Bumper Brawl** (nightly, 5PM–1AM): a golf-cart demolition derby in a floodlit hay-bale arena. Five rivals try to T-bone you. Front bumpers are armored and sides crumple. Damaged carts smoke, then burn, and the last cart running takes the purse.
- **Pier fishing.** Borrow a rod from Fishin' Phil and cast off Boca Pier. Set the hook on the dunk, then work the tension meter. Catches range from mullet to grouper, and the legendary Tarpon bites at night; there's also junk, including somebody's dentures. Captain Roy buys it all.
- **The Sunset Palms Gazette** reports your derby wins, stunt jumps, shuttle shifts and pong victories the next morning, and talk radio runs ads for all of it.
- **Pickleball Hustle.** A real rally on the community courts: move and swing, dinks and smashes, outs, double bounces and kitchen violations. The opponent reads your shots, places the ball where you aren't and makes skill-scaled errors. Game to 5, win by 2, and the club champion is a coin flip.
- **Beer Pong at the Tiki Hut** (11AM–2AM): six solo cups a side with real ball physics (rim-outs, rim-ins, bounce shots worth two cups). Your aim sways with your buzz: shaky when sober, dead steady at the **Ballmer Peak**, chaos when hammered. Sink three in a row and you're ON FIRE. Every cup you lose, you drink.
- **Closest to the Pin.** Bet the golfers on any tee. Three-press swing, real ball flight with wind and sidespin, and it bounces and rolls differently on green, fringe, rough, sand and water. A hole-in-one pays $500 extra.
- **Aqua Jazz with Chad** (10AM daily at the pool): a 71-year-old former Chippendale leads water aerobics. Join in for a rhythm game over the live class to earn STR, and the ladies notice.
- **GRANDR** on your phone. It's a senior dating app:
  - swipe on singles with live-rendered 3D portraits
  - a match books a date at a real place and time, and she shows up
  - win her over with the right topics
  - stand her up and she leaves you a one-star review
- **Mobility scooters** putter along at 9 mph and hold up traffic. You can yank a resident off one and steal it.
- **Karaoke Night at the Tiki Hut** (7–11PM): three original songs. Hit the bouncing ball on each word. The crowd cheers or boos, and text-to-speech croons along.
- **Garage Sale Saturdays** (8AM–2PM): four driveways full of junk. Buy it, haggle, or pocket it. Some of it is useful: a club, shirts, free cart speakers, a detector.
- **The Senior Games** (Sundays): Shuffleboard, Closest to the Pin and a Chug-Off, then a medal ceremony on a podium with fireworks.
- **Florida wildlife.** Ibis flocks forage on the lawns and scatter when you approach. Residents walk poodles, chihuahuas and dachshunds, and the chihuahuas defend their owners.
- **The phone's TO DO tab** lists every activity, filters them by category, puts what's open right now at the top, and sets waypoints.
- **Voices.** Every resident mumbles in Animal Crossing-style old-folks gibberish.
- **Chapter 1 story** runs through 12 quest steps.
- **Chapter 2: Rhino Rising** (7 steps): a tea shortage, a night-time antler heist, stealing a tooth from Mr. Chompers the gator, home brewing, and a boss fight with Chip's father "The Deuce".
- **Chapter 3: High Rollers** (6 steps):
  - board the Lucky Lady and win at blackjack
  - bribe "Fingers" Fanucci to rig machine #3, then hit the jackpot
  - face Captain Dom Moretti: a blackjack duel where the loser goes overboard, a boss brawl, or a bluff
  - crack his safe, then decide the fate of $48,211 in stolen pensions: return them, split them, or keep them all
- **Chapter 4: Crash Course** (5 steps): Karen hires Buck Thunderhill, a washed-up stock-car driver, as "Head of Cart Safety". He's impounding carts, including Earl's scooter, with Earl still on it. Beat him at the Bumper Brawl, win the neighborhood back with a Senior Shuttle shift, clear the Duck Pond jump, and take him down in the $500 Grand Prix.
- Free-roam goals follow.
- 55+ achievements, graphics quality presets (Low/Medium/High), auto-save when you sleep, and three procedural radio stations plus a text-to-speech talk-radio station.

**Characters.** Every resident is a skinned mesh on an 18-bone skeleton (knees, elbows, ankles, blinking eyes, head tracking), with a sculpted lathe torso, pot bellies, set-and-curl bobs, horseshoe fringes, pearls, readers, and socks with sandals. Near and far LODs share one skeleton.

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
