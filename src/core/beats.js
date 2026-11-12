// FROZEN (director). The arc: three nights and a morning after. Order matters.
// at = where the beat starts in a relaxed playthrough (minutes:seconds). water = a watering beat.
export const BEATS = Object.freeze([
  { id: 'title',      night: 0, at: '0:00' },
  { id: 'n1_open',    night: 1, at: '0:00' },              // Marlow waters the kitchen beds. Jo comes up.
  { id: 'n1_water',   night: 1, at: '0:20', water: true }, // six pots, two cups
  { id: 'n1_quiet',   night: 1, at: '1:25' },              // sit. look. go down.
  { id: 'n2_open',    night: 2, at: '2:00' },              // four nights later. the same line.
  { id: 'n2_water',   night: 2, at: '2:12', water: true }, // three pots, then footsteps
  { id: 'turn',       night: 2, at: '2:35' },              // the neighbour, the tray
  { id: 'n2_more',    night: 2, at: '3:45', water: true }, // three old, six new
  { id: 'n2_quiet',   night: 2, at: '5:00' },
  { id: 'n3_open',    night: 3, at: '5:15' },              // five nights after that. no rain.
  { id: 'n3_water',   night: 3, at: '5:27', water: true }, // twelve pots, a dry barrel, Marlow's tap, three leaks
  { id: 'firstlight', night: 3, at: '7:20' },              // Marlow's summary
  { id: 'choice',     night: 3, at: '7:30' },              // sensor or cup
  { id: 'epilogue',   night: 4, at: '7:40' },              // the next night, 3:40
  { id: 'end',        night: 4, at: '8:10' },
]);
export const BEAT_IDS = BEATS.map((b) => b.id);
export const beatIndex = (id) => BEAT_IDS.indexOf(id);
export const isWaterBeat = (id) => !!(BEATS[beatIndex(id)] && BEATS[beatIndex(id)].water);
