// Tunable game data: prices, weapons, upgrades, cast of characters.
import { HOUSES } from '../world/layout.js';

export const WEAPONS = {
  fists: { name: 'Fists', icon: '👊', dmg: 6, range: 1.5, arc: 1.3, cd: 0.32, dur: 0.28, knock: 3.5, anim: 'punch', desc: 'Fast, free, arthritic.' },
  putter: { name: 'Putter', icon: '🏌️', dmg: 9, range: 2.0, arc: 1.1, cd: 0.38, dur: 0.34, knock: 4.5, anim: 'swing', price: 60, desc: 'Quick pokes. Great for interrupting swings.' },
  wedge: { name: 'Sand Wedge', icon: '⛱️', dmg: 12, range: 2.0, arc: 1.3, cd: 0.6, dur: 0.44, knock: 6, anim: 'swing', price: 150, desc: 'Right-click / G: POCKET SAND (blinds foes).' },
  iron: { name: '7-Iron', icon: '🏑', dmg: 17, range: 2.2, arc: 1.7, cd: 0.7, dur: 0.5, knock: 8, anim: 'swing', price: 220, desc: 'Balanced damage, wide arc for crowd control.' },
  driver: { name: 'Driver', icon: '🔨', dmg: 28, range: 2.4, arc: 1.4, cd: 1.25, dur: 0.72, knock: 17, anim: 'swing', price: 450, desc: 'Slow. Launches geezers into ponds.' },
  titanium: { name: "Frank's Titanium Driver", icon: '⚡', dmg: 34, range: 2.5, arc: 1.5, cd: 0.85, dur: 0.58, knock: 19, anim: 'swing', desc: 'Liberated from a cuckold. Titanium shaft: 30% faster.' },
};
export const WEAPON_ORDER = ['fists', 'putter', 'wedge', 'iron', 'driver', 'titanium'];

export const CART_MODS = [
  { id: 'governor', name: 'Governor Removal', price: 350, stat: 2, desc: 'Top speed 25 → 36 mph. The HOA hates this one trick.' },
  { id: 'lift', name: 'Lift Kit + Mud Tires', price: 500, stat: 2, desc: 'Big tires, better off-road, looks like a lunar rover.' },
  { id: 'rims', name: 'Chrome Spinners', price: 400, stat: 2, desc: 'They keep spinning when you stop. Like your head.' },
  { id: 'neon', name: 'Neon Underglow', price: 300, stat: 1, desc: 'Pink underglow. Visible from space and the HOA office.' },
  { id: 'speakers', name: 'Bass Cannon Speakers', price: 600, stat: 2, desc: 'Radio at 11. Rattles dentures within 30 feet.' },
  { id: 'horn', name: 'La Cucaracha Horn', price: 120, stat: 1, desc: 'Plays the classic. Every. Single. Time.' },
  { id: 'nuts', name: 'Truck Nuts', price: 69, stat: 1, desc: 'Chrome. Swinging. Tasteful.' },
  { id: 'flag', name: 'Safety Whip Flag', price: 40, stat: 0, desc: 'Tall orange flag so the HOA can find you.' },
  { id: 'turbo', name: 'Nitrous Kit', price: 900, stat: 3, desc: 'Hold SHIFT in the cart. Totally street legal.' },
  { id: 'leather', name: 'Leather Seats', price: 250, stat: 1, desc: 'Sticks to your thighs in July. Classy.' },
];
export const PAINTS = ['#ffffff', '#e84a5f', '#1f8a8a', '#f2c94c', '#23408e', '#111111', '#f7a1c4', '#7d3cff', '#2f6b4a', '#ff6b1a'];

export const SHOPS = {
  liquor: {
    title: 'LIQUOR BARREL', keeper: 'Barb', greet: ["Barb doesn't look up from her crossword. \"Six pack again, hon?\"", '"If you\'re gonna puke, do it outside. The last guy did it in the lotto machine."'],
    items: [
      { id: 'beer6', name: 'Geezer Light (6-pack)', price: 12, icon: '🍺', desc: 'Watery. Cheap. Perfect.' },
      { id: 'beer24', name: 'Geezer Light (Case of 24)', price: 40, icon: '📦', desc: 'Buy in bulk. You\'re on a fixed income.' },
      { id: 'wine', name: 'Box Wine (Franzia-ish)', price: 18, icon: '🍷', desc: 'The ladies go wild for it.' },
      { id: 'flowers', name: 'Gas Station Flowers', price: 9, icon: '💐', desc: 'Slightly wilted. Still romantic.' },
      { id: 'lotto', name: 'Scratch-Off Ticket', price: 5, icon: '🎟️', desc: "Your retirement plan." },
      { id: 'teabags', name: 'Earl Grey Tea Bags (box)', price: 4, icon: '🫖', desc: 'For tea. Obviously. Just tea.' },
    ],
  },
  tiki: {
    title: 'TIKI HUT', keeper: 'Manny', greet: ['"Welcome to paradise, amigo. Paradise costs six bucks a beer."'],
    items: [
      { id: 'beer1', name: 'Poolside Beer', price: 6, icon: '🍺', desc: 'One beer. Resort pricing.' },
      { id: 'colada', name: 'Piña Colada', price: 9, icon: '🍹', desc: 'Strong. +buzz, +CHA for a bit.' },
    ],
  },
  proshop: {
    title: 'PRO SHOP', keeper: 'Gus', greet: ['"Balls? I buy \'em two bucks apiece. Don\'t ask what I sell \'em for."'],
    items: [
      { id: 'sellballs', name: 'Sell all golf balls', price: 0, icon: '⛳', desc: '$2 per ball.' },
      { id: 'bucket', name: 'Five-Gallon Bucket', price: 40, icon: '🪣', desc: 'Carry 20 balls instead of 1. Game changer.' },
      { id: 'hopper', name: 'Cart Ball-Hopper Vacuum', price: 450, icon: '🌀', desc: 'Auto-sucks balls you drive past. Holds 200.' },
      { id: 'drone', name: 'Ball Retrieval Drone', price: 900, icon: '🛸', desc: 'Patrols the course, earns while you nap.' },
      { id: 'w_putter', name: 'Putter', price: 60, icon: '🏌️', desc: WEAPONS.putter.desc },
      { id: 'w_wedge', name: 'Sand Wedge', price: 150, icon: '⛱️', desc: WEAPONS.wedge.desc },
      { id: 'w_iron', name: '7-Iron', price: 220, icon: '🏑', desc: WEAPONS.iron.desc },
      { id: 'w_driver', name: 'Driver', price: 450, icon: '🔨', desc: WEAPONS.driver.desc },
      { id: 'polo', name: 'Pastel Polo Collection', price: 300, icon: '👕', desc: '+STATUS. Pop the collar.' },
    ],
  },
  doc: {
    title: "DOC'S VAN", keeper: 'Doc Pratt', greet: ['"Keep your voice down. The van has ears. Well, it has a guy named Leonard in the back."', '"Cash only. No returns. No refunds. No questions. Mostly no questions."'],
    items: [
      { id: 'pills5', name: 'Blue Boys ×5 (wholesale)', price: 30, icon: '💊', desc: 'Street value $20-35 each.' },
      { id: 'pills20', name: 'Blue Boys ×20 (wholesale)', price: 110, icon: '💊', desc: 'Bulk discount. Doc loves you.' },
      { id: 'tea', name: 'Rhino Horn Tea ×1', price: 45, icon: '🍵', desc: '100% authentic. Do NOT ask which rhino. Sells $130+.' },
      { id: 'tea5', name: 'Rhino Horn Tea ×5', price: 200, icon: '🍵', desc: 'Bulk. The rhino is fine. Probably.' },
      { id: 'chain', name: 'Gold Chain (14k-ish)', price: 400, icon: '📿', desc: '+STATUS. Turns your neck green.' },
      { id: 'rolex', name: '"Rolax" Watch', price: 250, icon: '⌚', desc: '+STATUS. Ticks loudly.' },
    ],
  },
  boutique: {
    title: 'RESORT WEAR BOUTIQUE', keeper: 'Pierre', greet: ['"Monsieur, zat shirt is... a choice. Let me help you make a better one."', '"Everyzing here is linen, silk, or regret."'],
    items: [
      { id: 'shirt_1', name: 'Hibiscus Red Silk Shirt', price: 45, icon: '🌺', desc: 'Says "I own a boat." You do not.' },
      { id: 'shirt_2', name: 'Navy Palms Shirt', price: 45, icon: '🌴', desc: 'Yacht club energy.' },
      { id: 'shirt_3', name: 'Sunshine Orange Shirt', price: 45, icon: '🌞', desc: 'Visible from the space station.' },
      { id: 'shirt_4', name: 'Flamingo Pink Shirt', price: 45, icon: '🦩', desc: 'Real men wear pink. Karen hates it.' },
      { id: 'shirt_5', name: 'Purple Reign Shirt', price: 60, icon: '👑', desc: 'For the HOA royalty you will become.' },
      { id: 'shirt_6', name: 'Cream Linen Shirt', price: 60, icon: '🥂', desc: 'Old money. Very old. Like you.' },
      { id: 'shirt_7', name: 'Electric Blue Shirt', price: 45, icon: '⚡', desc: 'Pairs well with nitrous.' },
      { id: 'hat_bucket', name: 'Bucket Hat', price: 25, icon: '🪣', desc: 'Fisherman chic.' },
      { id: 'hat_cap', name: 'Trucker Cap', price: 20, icon: '🧢', desc: 'Says VETERAN. Of what, nobody asks.' },
      { id: 'hat_fedora', name: 'Straw Fedora', price: 80, icon: '🎩', desc: 'Sinatra, if Sinatra shopped at Costco.' },
      { id: 'hat_none', name: 'Go Hatless (free)', price: 0, icon: '🦲', desc: 'Let the scalp breathe.' },
      { id: 'glasses_big', name: 'Jackie O Sunglasses', price: 35, icon: '🕶️', desc: 'Enormous. Mysterious.' },
      { id: 'glasses_readers', name: 'Drugstore Readers', price: 10, icon: '👓', desc: '+2.50. For reading menus and rap sheets.' },
      { id: 'socks_white', name: 'Crisp White Tube Socks', price: 8, icon: '🧦', desc: 'Pulled up to the knee. Bold.' },
    ],
  },
  pelican: {
    title: 'THE RUSTY PELICAN', keeper: 'Skip', greet: ['"Welcome to the Pelican! Shoes optional, dentures recommended."', '"Two-for-one Bushwackers till the sun goes down. Or till you do."'],
    items: [
      { id: 'beer2', name: 'Beach Beer (2)', price: 8, icon: '🍺', desc: 'Two cold ones in a koozie.' },
      { id: 'bushwacker', name: 'Bushwacker', price: 10, icon: '🥤', desc: 'Rum milkshake. Huge buzz, +CHA for a while.' },
      { id: 'towel', name: 'Beach Towel (gift)', price: 15, icon: '🏖️', desc: 'Rhonda would like this.' },
    ],
  },
  bait: {
    title: 'BAIT • TACKLE • DETECTORS', keeper: 'Captain Roy', greet: [`"Metal detector? Found my third wife's ring with one of these. Then I lost her too."`],
    items: [
      { id: 'detector', name: 'Metal Detector', price: 150, icon: '🔍', desc: 'Legal hustle: beeps near buried loot on the sand. Press E to dig.' },
      { id: 'sunscreen', name: 'SPF 100 Sunscreen', price: 8, icon: '🧴', desc: 'Heals a bit. Smells like coconut and regret.' },
    ],
  },
  buffet: {
    title: 'GOLDEN CORAL', keeper: 'Flo', greet: ['"Table for one? The prime rib is \'prime\' in the legal sense only."'],
    items: [
      { id: 'meal', name: 'All-U-Can-Eat Buffet', price: 18, icon: '🍗', desc: 'Full heal. Sobers you up. Early bird 3-5PM: $9.' },
    ],
  },
};

// Named romance targets.
export const LADIES = [
  {
    id: 'doris', name: 'Doris Kleinfeld', tier: 1, title: 'Widow', reqCha: 1, reqStat: 1,
    look: { female: true, skin: '#f1c7a5', hair: '#b9c7f0', shirt: 4, hat: 'sunhat', hatColor: '#ffffff', glasses: 'big', belly: 1.1, height: 0.94, sock: '#fff', shoe: '#f7cad0' },
    spot: 'pool', likes: ['flowers'], dislikes: ['beer'],
    perk: 'Home-cooked casseroles: visit her for a full heal once a day.', perkId: 'casserole',
    bio: 'Widowed twice. Both husbands died "peacefully." Makes a tuna casserole that could raise the dead.',
  },
  {
    id: 'millie', name: 'Mildred "Millie" Rausch', tier: 1, title: 'Widow', reqCha: 2, reqStat: 1,
    look: { female: true, skin: '#e8b996', hair: '#c9b3e6', shirt: 5, hat: 'visor', hatColor: '#e84a5f', glasses: 'readers', belly: 1.0, height: 0.9, sock: '#fff', shoe: '#ffffff' },
    spot: 'shuffle', likes: ['beer'], dislikes: ['flowers'],
    perk: 'Bingo shark: tips you off to security patrols. Heat cools 30% faster.', perkId: 'heatcool',
    bio: 'Banned from three bingo halls in Broward County. Drinks you under the table.',
  },
  {
    id: 'gloria', name: 'Gloria Vance', tier: 1, title: 'Divorced ×4', reqCha: 3, reqStat: 2,
    look: { female: true, skin: '#d9a07c', hair: '#d96d3b', shirt: 3, hat: 'none', hatColor: '#000', glasses: 'big', belly: 0.95, height: 1.0, sock: '#fff', shoe: '#d9c7b0' },
    spot: 'tiki', likes: ['wine'], dislikes: [],
    perk: "Ex-husband #3 is Sal. She's got dirt on him: 25% off all cart mods.", perkId: 'saldiscount',
    bio: 'Four divorces, four alimony checks. Leopard print is a lifestyle.',
  },
  {
    id: 'bev', name: 'Bev Mancuso', tier: 2, title: 'Married (to Big Frank)', reqCha: 5, reqStat: 4, husband: 'frank',
    look: { female: true, skin: '#f5d3b8', hair: '#f0d7a1', shirt: 1, hat: 'visor', hatColor: '#ffffff', glasses: 'big', belly: 1.0, height: 0.97, sock: '#fff', shoe: '#ffffff' },
    spot: 'pickleball', likes: ['wine', 'flowers'], dislikes: [],
    perk: "Frank's garage key: his Titanium Driver is yours.", perkId: 'titanium',
    bio: "Pickleball champion. Married to Big Frank, who is big, and named Frank.",
  },
  {
    id: 'linda', name: 'Linda Wainwright', tier: 2, title: 'Married (to Chip)', reqCha: 6, reqStat: 5, husband: 'chip',
    look: { female: true, skin: '#f1c7a5', hair: '#f2f2f2', shirt: 6, hat: 'sunhat', hatColor: '#f7a1c4', glasses: 'big', belly: 0.9, height: 1.0, sock: '#fff', shoe: '#ffffff' },
    spot: 'clubhouse', likes: ['wine'], dislikes: ['beer'],
    perk: "Rival intel + DIRT ON KAREN (unlocks the blackmail route to HOA control).", perkId: 'dirt',
    bio: "Chip's wife. Bored out of her skull. Knows where every body in this HOA is buried.",
  },
  {
    id: 'rhonda', name: 'Rhonda Castellano', tier: 1, title: 'Divorcée from Jersey', reqCha: 3, reqStat: 2,
    look: { female: true, skin: '#c68863', hair: '#1c1c1c', shirt: 3, hat: 'none', hatColor: '#000', glasses: 'big', belly: 0.95, height: 0.98, sock: '#fff', shoe: '#d9c7b0' },
    spot: 'beach', likes: ['beer', 'towel'], dislikes: ['flowers'],
    perk: 'She runs a tab at the Rusty Pelican in your name. Beach drinks are free.', perkId: 'freebar',
    bio: `Moved down from Paramus with three ex-husbands' alimony and a tan you can see from space. Says "whaddaya" as a complete sentence.`,
  },
  {
    id: 'tammy', name: 'Tammy', tier: 3, title: 'The Fairway Cart Girl', reqCha: 8, reqStat: 8, needsPimpedCart: 3,
    look: { female: true, skin: '#e0ac8a', hair: '#f0d7a1', shirt: 7, hat: 'cap', hatColor: '#e84a5f', glasses: 'none', belly: 0.8, height: 1.03, sock: '#fff', shoe: '#ffffff' },
    spot: 'cart', likes: ['wine', 'flowers', 'beer'], dislikes: [],
    perk: 'LEGENDARY: Massive status, wholesale costs -30%, gang morale through the roof.', perkId: 'legend',
    bio: "58 years young. The youngest woman in Sunset Palms. Every man here has proposed to her at least twice.",
  },
];

export const PICKUP_LINES = [
  { line: "Are you my Medicare card? Because I can't leave the house without you.", diff: 3 },
  { line: "Is that a hip replacement? Because you're really moving me.", diff: 3 },
  { line: "They say the heart's the first thing to go. Mine went the second I saw you.", diff: 4 },
  { line: "I may be on blood thinners, but you still make it rush.", diff: 4 },
  { line: "Are you a cataract? Because everything goes blurry when I look at you.", diff: 5 },
  { line: "I've got a pacemaker, and you're making it work overtime.", diff: 4 },
  { line: "Forget the early bird special. I'd skip dinner entirely for you.", diff: 3 },
  { line: "My doctor says I need more fiber in my life. You look like a whole bran muffin.", diff: 6 },
  { line: "I own a golf cart with no governor. I think you know what that means.", diff: 5 },
  { line: "You remind me of my late wife. That's a compliment. She was a ten. Mostly.", diff: 6 },
  { line: "I've still got all my original teeth. Wanna count 'em?", diff: 5 },
  { line: "Let's go back to my place and not sleep through Jeopardy.", diff: 4 },
];

export const LADY_REACTIONS = {
  success: ['*giggles like it\'s 1962*', '"Oh, stop it. No— keep going."', '"Well aren\'t YOU a smooth talker."', '*fans herself with a bingo card*', '"You\'re trouble. I like trouble."'],
  fail: ['"I\'ve heard better from my parrot."', '"Did you get that off a cereal box?"', '"Honey, my late husband said that. He\'s LATE for a reason."', '*turns up her hearing aid, then turns it back down*', '"Try that again when you\'ve showered."'],
};

export const RECRUITS = [
  { id: 'knuckles', name: '"Knuckles" Nussbaum', cost: 300, teaCost: 2, spot: [-150, 40], bio: 'Former Golden Gloves, 1961. Still punches like a mule. Forgets why.', look: { female: false, skin: '#e8b996', hair: '#d9d9d9', shirt: 1, shorts: '#4a5a7a', hat: 'none', glasses: 'none', mustache: false, belly: 1.2, height: 1.02 }, hp: 90, dmg: 11 },
  { id: 'tony', name: '"Two-Hips" Tony', cost: 400, teaCost: 3, spot: [-96, 38], bio: 'Had both hips replaced. Titanium. Can\'t feel pain below the waist.', look: { female: false, skin: '#c68863', hair: '#1c1c1c', shirt: 0, shorts: '#e7dfca', hat: 'fedora', hatColor: '#23408e', glasses: 'aviator', mustache: true, belly: 1.3, height: 0.98 }, hp: 110, dmg: 9 },
  { id: 'sarge', name: 'Sarge Hollis', cost: 500, teaCost: 3, spot: [70, 38], bio: 'Korean War vet. Calls everyone "maggot." Owns a bayonet he says is "decorative."', look: { female: false, skin: '#9a6545', hair: '#f2f2f2', shirt: 6, shorts: '#8a9a6a', hat: 'cap', hatColor: '#2f6b4a', glasses: 'none', mustache: true, belly: 1.0, height: 1.0 }, hp: 100, dmg: 13 },
  { id: 'walker', name: 'Walker Wallace', cost: 200, teaCost: 1, spot: [8, 16], bio: 'Uses a walker. Weaponizes the walker. Tennis balls filled with quarters.', look: { female: false, skin: '#f1c7a5', hair: '#bdbdbd', shirt: 3, shorts: '#c8b48a', hat: 'bucket', hatColor: '#c8b48a', glasses: 'readers', mustache: false, belly: 1.1, height: 0.95, walker: true }, hp: 80, dmg: 12 },
];

export const CONCESSION = [
  { id: 'c1', name: 'Cart #1 — "The Nineteenth Hole"', operator: 'tammy', canopy: 0xe84a5f, loop: 0 },
  { id: 'c2', name: 'Cart #2 — "Bogey Beverages"', operator: 'Ray Delgado', canopy: 0xf2c94c, loop: 1 },
  { id: 'c3', name: 'Cart #3 — "Par-Tea Time"', operator: 'Dolores Finkel', canopy: 0x1f8a8a, loop: 2 },
];

export const DECREES = [
  { id: 'bingo', name: 'Mandatory Bingo Levy', desc: '15% of all community bingo winnings go to you. +$80/day.' },
  { id: 'colors', name: 'Rival Colors Ban', desc: "Chip's pastel sweaters are now illegal. Rivals stop sabotaging your turf." },
  { id: 'noise', name: 'Nocturnal Noise Exemption', desc: 'Your address is exempt. HOA heat cools twice as fast.' },
  { id: 'budget', name: 'Security Budget Cut', desc: "Officer Dale's cart is re-governed to 8 mph. Heat gains -30%." },
  { id: 'flamingo', name: 'Mandatory Flamingo Ordinance', desc: 'Every lawn must display 2+ flamingos. You own the flamingo supplier. +$40/day, +STATUS.' },
];

// Fun places you might wake up after blacking out.
export const BLACKOUTS = [
  { x: -228, z: -245, note: 'You woke up on the 1st green wearing someone else\'s dentures.' },
  { x: 60, z: -12, note: 'You woke up floating in the pool on a flamingo inflatable. Your shirt is gone.' },
  { x: -100, z: 32, note: 'You woke up in the gazebo. There\'s a lipstick kiss on your forehead. Nobody will say whose.' },
  { x: 200, z: 48, note: 'You woke up in the Golden Coral parking lot, clutching a single dinner roll.' },
  { x: -238, z: 38, note: 'You woke up in Sal\'s shop. Your cart is now slightly more purple.' },
  { x: 240, z: 48, note: 'You woke up on the HOA office steps. Karen has taken 11 photos.' },
];

export const HOUSE_OF = (street, z, side) => HOUSES.find((h) => h.street === street && h.z === z && h.side === side);
