// FROZEN (director). The one shared state object. Game WRITES it. World, render and audio READ it.
// (World may write only pots[i].lift and pots[i].wetShown, which are view-side easings. Render writes perf and quality.)
import { createRng } from './rng.js';
import { POT_IDS, POT_NOTES, JO_START, ANCHORS } from './layout.js';

export function createState(seed = 340) {
  return {
    seed, rng: createRng(seed),
    beat: 'title', beatTime: 0, time: 0, night: 0, nightPours: 0, ending: null,
    begun: false, paused: false, auto: true,
    reducedMotion: false, muted: false, volume: 0.6,
    quality: 2, qualityLocked: false, perf: { frameMs: 16, fps: 60 },
    viewport: { w: 1, h: 1, portrait: false },
    camera: { shot: 'wide', focus: null, yaw: 0, pitch: 0, zoom: 1 },
    hot: [],            // ids tappable right now, in keyboard order
    focus: null,        // id with keyboard focus
    jo: { present: false, pos: { x: JO_START.x, z: JO_START.z }, y: 0, heading: JO_START.heading,
      action: 'below',  // below | climb | idle | walk | scoop | pour | pourEmpty | take | carry | place | sit | descend | plant
      actionT: 0, actionDur: 0, target: null, cup: 0, cupHeld: true, carrying: false, walked: 0,
      noCup: false, book: false, page: 0, hatOff: false, hatAt: null, seat: null, sitK: 0, readT: null, leaf: 0 },   // the night after, by sensor: no cup, a book, and the hat comes off
    speaking: null,   // { who, until }: who is talking right now, for the talking clip and the listener's head
    tam: { present: false, stage: 'below', // below | climbing | top | handoff | leaving | gone | watering
      t: 1, pos: { x: -6, z: 4.25 }, y: -2.6, walked: 0, heading: Math.PI / 2, hasTray: true, bucket: false },
    // growth: 0 seedling, 1 young, 2 grown. Set by game at the start of each night.
    pots: POT_IDS.map((id, i) => ({ id, index: i, tray: i < 6 ? 0 : 1, present: i < 6, watered: false, growth: 0,
      wet: 0, lift: 0, wetShown: 0, note: POT_NOTES[i], pos: ANCHORS[id].pos })),
    barrel: { scoops: 3, level: 0.8 },      // cupfuls left, and how full it looks (0..1)
    valve: { found: false, fills: 0, sealed: false, said3: false },
    marlow: { beds: [false, false, false], misting: false, shelfSensor: false, leak: false, line: null },
    hatchOpen: true, lampOn: true, secondCup: false, stakeAsProp: false,
    sky: { dawn: 0 },                      // 0 deep night .. 1 first light
    text: { line: null, kind: null },      // what the line strip shows
    counts: { pours: 0, scoops: 0, looks: 0, lingered: 0 }, epilogue: null,
    chairAt: null,                         // the night after, by sensor: where the folding chair has been carried to
    hint: null,                            // the last idle hint: { id, at }
    trayHint: false,                       // the tray left waiting: its chevron is up
  };
}
