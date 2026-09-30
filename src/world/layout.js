// The Sunset Palms map, described as data. +X = east, +Z = south (north is -Z).
// The golf course fills the north, clubhouse in the middle, houses to the south.

export const HALF = 300; // world spans -300..300
export const WALL = 292;

export const STREETS = [
  { x: -200, name: 'Pelican Way' },
  { x: -120, name: 'Egret Ln' },
  { x: -40, name: 'Flamingo Dr' },
  { x: 40, name: 'Manatee Blvd' },
  { x: 120, name: 'Heron Ct' },
  { x: 200, name: 'Tortoise Trl' },
];

// Road graph. Roads are rendered from edges; traffic AI drives on it.
const N = {};
const node = (id, x, z) => (N[id] = { id, x, z, edges: [] });
node('P0', -265, 60);
STREETS.forEach((s, i) => {
  node('P' + (i + 1), s.x, 60); // Palm Blvd
  node('C' + (i + 1), s.x, 170); // Shuffleboard Ave
  node('S' + (i + 1), s.x, 270); // Sunset Loop
});
node('P7', 265, 60);
node('GATE', 290, 60);
node('F0', -265, -45);
node('F1', -200, -45);
node('F3', -40, -45);
node('F5', 120, -45);
node('F7', 265, -45);
node('M0', -265, -160);
node('M7', 265, -160);
node('B0', -265, -270);
node('B7', 265, -270);

export const NODES = N;
export const EDGES = [];
const edge = (a, b, type = 'road', name = '') => {
  const e = { a: N[a], b: N[b], type, name, width: type === 'road' ? 9 : type === 'blvd' ? 11 : 4.6 };
  EDGES.push(e);
  N[a].edges.push({ to: N[b], e });
  N[b].edges.push({ to: N[a], e });
};
// Palm Blvd (main drag)
['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'GATE'].reduce((a, b) => (edge(a, b, 'blvd', 'Palm Blvd'), b));
// residential streets
STREETS.forEach((s, i) => {
  edge('P' + (i + 1), 'C' + (i + 1), 'road', s.name);
  edge('C' + (i + 1), 'S' + (i + 1), 'road', s.name);
  if (i > 0) {
    edge('C' + i, 'C' + (i + 1), 'road', 'Shuffleboard Ave');
    edge('S' + i, 'S' + (i + 1), 'road', 'Sunset Loop');
  }
});
// connectors north to the course
edge('P1', 'F1', 'road', 'Pelican Way');
edge('P3', 'F3', 'road', 'Clubhouse Rd');
edge('P5', 'F5', 'road', 'Heron Ct');
edge('P7', 'F7', 'road', 'Commerce St');
edge('P0', 'F0', 'road', 'Service Rd');
// Fairway Dr + cart paths
['F0', 'F1', 'F3', 'F5', 'F7'].reduce((a, b) => (edge(a, b, 'road', 'Fairway Dr'), b));
edge('F0', 'M0', 'path', 'Cart Path');
edge('M0', 'B0', 'path', 'Cart Path');
edge('B0', 'B7', 'path', 'Cart Path');
edge('B7', 'M7', 'path', 'Cart Path');
edge('M7', 'F7', 'path', 'Cart Path');
edge('M0', 'M7', 'path', 'Cart Path');

// ---------------- golf course ----------------
export const HOLES = [
  { n: 1, tee: [-240, -72], green: [-228, -245] },
  { n: 2, tee: [-168, -248], green: [-162, -80] },
  { n: 3, tee: [-82, -74], green: [-70, -246] },
  { n: 4, tee: [8, -248], green: [2, -82] },
  { n: 5, tee: [94, -74], green: [106, -246] },
  { n: 6, tee: [186, -248], green: [226, -84] },
];
export const FAIRWAY_W = 30;

export const PONDS = [
  { x: -120, z: -208, r: 21, name: 'Lake Titleist' },
  { x: 52, z: -112, r: 23, name: 'Lake Serenity', fountain: true },
  { x: 152, z: -206, r: 18, name: 'Gator Pond' },
  { x: -100, z: 2, r: 13, name: 'Duck Pond', fountain: true },
];

export const BUNKERS = [];
HOLES.forEach((h, i) => {
  const [gx, gz] = h.green;
  const [tx, tz] = h.tee;
  const dx = gx - tx, dz = gz - tz, L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  // one in front-left, one right side of green, one mid fairway
  BUNKERS.push({ x: gx - ux * 16 - uz * 9, z: gz - uz * 16 + ux * 9, rx: 6, rz: 4 });
  BUNKERS.push({ x: gx + uz * 14, z: gz - ux * 14, rx: 4, rz: 6.5 });
  if (i % 2 === 0) BUNKERS.push({ x: tx + ux * L * 0.55 + uz * 13, z: tz + uz * L * 0.55 - ux * 13, rx: 7, rz: 4 });
});

// Rolling mounds on the course (good for catching air)
export const MOUNDS = [
  { x: -205, z: -125, r: 9, h: 2.6 },
  { x: -30, z: -195, r: 9, h: 3.2 },
  { x: 140, z: -120, r: 8, h: 2.8 },
  { x: 240, z: -195, r: 8, h: 2.5 },
  { x: 60, z: -228, r: 11, h: 2.0 },
  { x: -250, z: -150, r: 7, h: 1.8 },
  { x: -130, z: -120, r: 10, h: 2.2 },
];

// Plywood jump ramps: start point, heading angle (radians, 0 = +Z), length, height, width.
export const RAMPS = [
  { x: 14, z: -146, a: Math.atan2(38, 34), len: 9, h: 2.4, w: 5, name: 'Lake Serenity Launch' },
  { x: -60, z: -110, a: Math.PI, len: 8, h: 2.2, w: 5, name: 'Grandkids Ramp' },
  { x: -236, z: -34, a: Math.PI / 2, len: 8, h: 2.0, w: 5, name: "Sal's Test Ramp" },
  { x: 176, z: -150, a: -Math.PI / 2 + 0.3, len: 9, h: 2.6, w: 5, name: 'Gator Jump' },
];

// ---------------- buildings / POIs ----------------
// footprint: [cx, cz, sx, sz] in world units. `door` is where the interaction trigger sits.
export const BUILDINGS = {
  clubhouse: { x: 15, z: -5, sx: 40, sz: 22, door: [15, 8.5] },
  proshop: { x: -16, z: -28, sx: 16, sz: 10, door: [-16, -34.5] },
  pool: { x: 64, z: -4, sx: 24, sz: 12 },
  pooldeck: { x: 64, z: -4, sx: 40, sz: 30 },
  tiki: { x: 98, z: -2, door: [98, 4.5] },
  liquor: { x: 160, z: 34, sx: 26, sz: 18, door: [160, 44.5] },
  buffet: { x: 200, z: 33, sx: 30, sz: 22, door: [200, 45.5] },
  hoa: { x: 238, z: 35, sx: 20, sz: 16, door: [238, 44.5] },
  sal: { x: -238, z: 28, sx: 24, sz: 16, door: [-225.5, 28] },
  shed: { x: -236, z: -12, sx: 14, sz: 10 },
  van: { x: -252, z: -8, door: [-247, -8] },
  gatehouse: { x: 278, z: 50, sx: 6, sz: 5 },
  watertower: { x: -170, z: -18 },
  gazebo: { x: -100, z: 32 },
  pickleball: { x: -155, z: 14 },
  shuffle: { x: 62, z: 36 },
  parking: { x: -21, z: 32, sx: 28, sz: 38 },
  strip: { x: 197, z: 50, sx: 118, sz: 10 },
};

// Houses: 6 per side of each residential street.
export const HOUSE_Z = [88, 112, 136, 196, 220, 244];
export const PASTELS = ['#f6c6a8', '#bfe3d0', '#f7cad0', '#fbe7a1', '#d7c4ec', '#bde0fe', '#fff1e0', '#ffd6a5', '#cde8e2', '#f9d5e5'];
export const HOUSES = [];
{
  let n = 0;
  STREETS.forEach((s, si) => {
    HOUSE_Z.forEach((z, zi) => {
      for (const side of [-1, 1]) {
        const num = 100 + zi * 12 + (side > 0 ? 2 : 1);
        HOUSES.push({
          id: n++,
          x: s.x + side * 21,
          z,
          facing: side > 0 ? -Math.PI / 2 : Math.PI / 2, // front faces the street
          side,
          street: s.name,
          address: `${num} ${s.name}`,
          color: PASTELS[(si * 7 + zi * 3 + (side > 0 ? 1 : 0)) % PASTELS.length],
        });
      }
    });
  });
}
export const PLAYER_HOUSE = HOUSES.find((h) => h.street === 'Flamingo Dr' && h.z === 88 && h.side > 0);
PLAYER_HOUSE.owner = 'player';

// Named zones used for pedestrian wandering and location labels.
export const ZONES = [
  { name: 'Clubhouse', x0: -8, z0: 6, x1: 40, z1: 14, weight: 3 },
  { name: 'Pool Deck', x0: 47, z0: -18, x1: 82, z1: 10, weight: 4 },
  { name: 'Shuffleboard Courts', x0: 48, z0: 28, x1: 80, z1: 44, weight: 2 },
  { name: 'Duck Pond Park', x0: -130, z0: 18, x1: -70, z1: 46, weight: 2 },
  { name: 'Pickleball Courts', x0: -175, z0: 26, x1: -135, z1: 46, weight: 2 },
  { name: 'Commercial Strip', x0: 145, z0: 46, x1: 250, z1: 52, weight: 3 },
];
