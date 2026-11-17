// Gate: no interpenetration. Forearm and hand triangles of the real skinned people never cross a prop or a piece of
// furniture (shelf, beds, barrel, seat, hatch, lid, Marlow's box, the roof itself); the tray never crosses the hatch,
// its rail or the roof; the bucket is either in a hand or standing on the deck. Triangle against triangle at sampled
// frames of every reach. SH_BREAK=rim and SH_BREAK=float break the page on purpose; both go red.
//   node tools/clash.mjs [--only=phone-sensor] [--html=path]
import { drive } from './gates/drive.mjs';
const { failed } = await drive({ check: 'clash', name: 'clash', classify: () => 'fail' });
process.exit(failed ? 1 : 0);
