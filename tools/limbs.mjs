// Gate: connected limbs, on the real skinned people. Every few tenths of a second of every action, on desktop and
// phone: no bone more than 2 percent off its rest length (nothing stretches); every visible wrist, elbow, shoulder,
// knee, hip and neck joint met by that person's own skin, or within a few centimetres of it (the hand belongs to an
// arm, the arm to a body); and no open end seen (a ray toward a joint never meets the inside of skin first, nor the
// inside of cloth the game does not draw on both sides). Measured with three's own CPU skinning and rays from the
// camera, not by eye. SH_BREAK=stretch and SH_BREAK=hole break the page on purpose; both go red.
//   node tools/limbs.mjs [--only=desk-hand] [--html=path]      SH_GPU=1 makes it about four times faster
import { drive } from './gates/drive.mjs';
const { failed } = await drive({ check: 'body', name: 'limbs', classify: (r) => (r.kind === 'caps' || r.kind === 'joints' || r.kind === 'bones' ? 'fail' : 'ok') });
process.exit(failed ? 1 : 0);
