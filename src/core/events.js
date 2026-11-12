// FROZEN (director). Every event on the bus. Payload shapes are in BIBLE.md section 7.
// Additions go through the director file only; never emit a string that is not here.
export const EV = Object.freeze({
  BEGIN: 'game:begin',            // {}                       first click on Begin (audio may start)
  BEAT_ENTER: 'beat:enter',       // {beat, from}
  TAP: 'input:tap',               // {id}                     a hot thing was tapped
  TAP_MISS: 'input:miss',         // {x, y}
  LOOK: 'look',                   // {id}                     a look-only thing was tapped
  JO_STEP: 'jo:step',             // {foot, surface}          surface: 'deck' | 'stair'
  JO_SCOOP: 'jo:scoop',           // {source}                 'barrel' | 'valve' | 'dry'
  JO_POUR_START: 'jo:pour:start', // {pot, index, dur}
  JO_POUR_END: 'jo:pour:end',     // {pot, index}
  JO_POUR_EMPTY: 'jo:pour:empty', // {pot}
  JO_PAGE: 'jo:page',             // {}                       a page turned, the night after
  LEAF_TOUCH: 'jo:leaf',          // {pot}                    her hand on a leaf, the night after, by sensor
  POT_WATERED: 'pot:watered',     // {pot, index, note}       note = midi number
  MARLOW_TICK: 'marlow:tick',     // {}
  MARLOW_MIST: 'marlow:mist',     // {on, shelf}
  MARLOW_LINE: 'marlow:line',     // {key}
  MARLOW_LEAK: 'marlow:leak',     // {}
  TAM_STEP: 'tam:step',           // {depth}                  0 = top stair, 1 = bottom
  TAM_ARRIVE: 'tam:arrive',       // {}
  TAM_HANDOFF: 'tam:handoff',     // {}
  TAM_LEAVE: 'tam:leave',         // {}
  DOOR_CLOSE: 'door:close',       // {}
  TRAY_SET: 'tray:set',           // {}
  CHOICE_OPEN: 'choice:open',     // {}
  CHOICE_MADE: 'choice:made',     // {ending}                 'sensor' | 'hand'
  SENSOR_SET: 'sensor:set',       // {}
  TEXT: 'text:show',              // {kind, text}             kind: 'marlow' | 'jo' | 'tam' | 'tag' | 'look' | 'time'
  END: 'game:end',                // {ending}
  QUALITY: 'quality:change',      // {quality}
  PAUSE: 'pause',                 // {}
  RESUME: 'resume',               // {}
});
