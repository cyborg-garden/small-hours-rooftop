// Gate: no interpenetration. Hand and arm meshes never intersect a prop or piece of furniture (shelf, beds, barrel,
// tank, chair, hatch, lid, Marlow's box, the roof itself): triangle against triangle at sampled frames of every reach.
//   node tools/clash.mjs [--only=phone-sensor] [--html=path]
import { drive } from './gates/drive.mjs';
const { failed } = await drive({ check: 'clash', name: 'clash', classify: () => 'fail' });
process.exit(failed ? 1 : 0);
