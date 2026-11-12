// Gate: connected limbs. Every few tenths of a second of every action, on desktop and phone, each visible hand must
// trace through forearm and upper arm to a shoulder on the body, legs to the hips, with no open or flat cylinder end
// showing, and the jacket (or coat) must never cut through the trousers. Checked with rays from the camera against
// the posed meshes and triangle tests, not by eye.
//   node tools/limbs.mjs [--only=desk-hand] [--html=path]      SH_GPU=1 is not needed: nothing is drawn.
import { drive } from './gates/drive.mjs';
const { failed } = await drive({ check: 'body', name: 'limbs', classify: (r) => (r.kind === 'caps' || r.kind === 'joints' || r.kind === 'cloth' ? 'fail' : 'ok') });
process.exit(failed ? 1 : 0);
