// FROZEN (director). The roof, in metres. x right, y up, z toward the camera. Deck top is y = 0.
// World builds models AT these numbers. Game walks Jo BETWEEN these numbers. Render frames them.
export const ROOF = { x0: -7, x1: 7, z0: -5, z1: 5, slab: 0.35, parapetH: 0.9, parapetT: 0.3 };
// The stairwell is cut open at the front face (z = 5) like a shadowbox section.
// Stairs run along x: top step at x = -2.8 (deck), bottom at x = -6.2, 2.6 m down.
export const HATCH = { x0: -6.2, x1: -2.8, z0: 3.4, z1: 5.0, depth: 2.6, steps: 13, kerb: 0.15,
  lamp: { x: -4.6, y: -0.55, z: 3.5 } };
export const stairPoint = (t) => ({ // t: 0 = top of stairs, 1 = bottom landing
  x: HATCH.x1 - 0.2 - t * (HATCH.x1 - HATCH.x0 - 0.5), y: -t * HATCH.depth, z: 4.25 });
export const SHELF = { x0: -2.5, x1: 0.1, upper: { y: 0.5, z: 3.75 }, lower: { y: 0.25, z: 4.15 }, depth: 0.36 };
export const BEDS = [
  { id: 'bedA', x: -4.1, z: -1.9, w: 3.0, d: 1.0, h: 0.5 },
  { id: 'bedB', x: -0.4, z: -1.9, w: 3.0, d: 1.0, h: 0.5 },
  { id: 'bedC', x: 3.3, z: -1.9, w: 3.0, d: 1.0, h: 0.5 },
];
export const BARREL = { x: 4.7, z: 2.5, r: 0.45, h: 1.1, stand: 0.25 };
export const TANK = { x: 5.6, z: -3.7, r: 0.8, h: 1.5, legs: 1.3 };
export const JO_START = { x: -2.2, z: 3.2, heading: 0 };       // where she stands after coming up
export const JO_SIT = { x: -3.05, z: 3.46, heading: 0.6 };       // on the kerb's front edge, an arm's length from the shelf's end, clear of the open lid behind
export const TAM_TOP = { x: -3.0, z: 4.25, heading: Math.PI / 2 };

const pot = (i) => {
  const tray = i < 6 ? 0 : 1, k = i % 6, tier = tray === 0 ? SHELF.upper : SHELF.lower;
  const x = -2.3 + k * 0.4 + (tray ? 0.12 : 0);
  return { id: 'p' + i, kind: 'pot', tray, index: i, pos: { x, y: tier.y + 0.16, z: tier.z },
    stand: { x: x - 0.28, z: 3.15, heading: 0.35 }, radius: 0.2 };
};
// Anchors: everything that can be tapped. pos = centre of the tap target. stand = where Jo stands to use it.
// heading: radians, 0 faces +z (the camera), +PI/2 faces +x.
export const ANCHORS = Object.freeze({
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p${i}`, pot(i)])),
  barrel: { id: 'barrel', kind: 'source', pos: { x: BARREL.x, y: 1.0, z: BARREL.z }, stand: { x: 3.9, z: 2.7, heading: 1.35 }, radius: 0.6 },
  valve:  { id: 'valve', kind: 'source', pos: { x: 0.6, y: 0.4, z: -1.35 }, stand: { x: 0.6, z: -0.75, heading: Math.PI }, radius: 0.35 },
  tray:   { id: 'tray', kind: 'handoff', pos: { x: -3.0, y: 1.05, z: 4.2 }, stand: { x: -2.3, z: 3.6, heading: -1.2 }, radius: 0.45 },
  sensor: { id: 'sensor', kind: 'choice', pos: { x: 0.35, y: 0.5, z: 4.0 }, stand: { x: 0.4, z: 3.48, heading: -Math.PI / 2 + 0.25 }, radius: 0.3 },   // beside the crate, facing along the shelf: the stake goes from her left hand into the bean, wide of the end post
  cup:    { id: 'cup', kind: 'choice', pos: { x: -0.25, y: 0.75, z: 3.75 }, stand: { x: -0.5, z: 3.15, heading: 0.3 }, radius: 0.3 },
  marlow: { id: 'marlow', kind: 'look', pos: { x: -2.25, y: 1.2, z: -1.1 }, radius: 0.35 },
  city:   { id: 'city', kind: 'look', pos: { x: 1.5, y: 1.6, z: -14 }, radius: 3.5 },
  chair:  { id: 'chair', kind: 'look', pos: { x: 2.1, y: 0.5, z: 1.4 }, radius: 0.45 },
  hatch:  { id: 'hatch', kind: 'look', pos: { x: -4.4, y: -0.7, z: 4.6 }, radius: 0.8 },
  // aliases: a bigger thing that stands for a small one. A tap on kitchen bed B is a tap on its brass tap;
  // a tap anywhere on the neighbour is a tap on the tray they are holding. Offered only while the target is.
  bedB:   { id: 'bedB', kind: 'alias', to: 'valve', pos: { x: -0.4, y: 0.55, z: -1.75 }, radius: 1.5 },
  tam:    { id: 'tam', kind: 'alias', to: 'tray', pos: { x: -3.0, y: 1.0, z: 4.25 }, radius: 0.75 },
});
export const ALIASES = Object.keys(ANCHORS).filter((k) => ANCHORS[k].kind === 'alias');
export const POT_IDS = Array.from({ length: 12 }, (_, i) => 'p' + i);
// One note per pot (midi). D major pentatonic. Tray 0 sits in the middle, tray 1 answers above and below.
export const POT_NOTES = [62, 66, 69, 71, 74, 76, 57, 59, 78, 81, 64, 83];
