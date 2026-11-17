// Gate: nobody stands like a statue. Measured on the posed skeletons and the drawn props at every sampled frame of
// both endings on both screens:
//   stride  nobody stands still with one foot far ahead of the other (a walk frame held)
//   plank   nobody stands tipped over from the ankles
//   hat     her hat never tips like a plate while she stands
//   inside  nobody stands with a foot inside the shelf, a bed or the barrel
//   post    the grab post is never drawn across the tray while the neighbour stands holding it (the post is gone now)
//   across  nothing fixed is drawn across the tray the neighbour carries, on the stairs, on the roof, or standing
//   apart   the two people never stand inside each other (chests 38 cm, hips 30 cm apart at least)
//   tray    the tray is on the hands that carry it
//   offer   the by-hand ending: the cup stays in her hand at her chest, his open hand under it, she stands straight with
//           her free hand down, through the last line and under the card (round twelve; red on the round eleven build)
//   cuphook while both her hands are on the tray the cup hangs from her belt, touching her (round twelve; red on round eleven)
//   potcount while the full tray is held up in the picture, the pots seen on it never drop by two (round nine)
//   trayhome the neighbour goes home with empty hands: the tray caught the door frame on the way down (round nine)
//   carry    nothing fixed is drawn across the tray she carries off, through every frame of the dip to dark (round ten)
//   crouch   nobody climbs crouched, both knees far ahead of their feet (round ten)
//   trayface the neighbour's eyes are never behind the pots or stakes on the tray he carries (round ten)
//   tapface / taphat  kneeling at the tap her face is clear of the pipe and her brim of the handle (round ten)
//   handclear the night after, by hand: from when he comes up with the bucket until she kneels to it, neither of her
//           hands is drawn within 7 cm of his body in the picture (round fourteen; red on the round thirteen build)
// Each was a fault a blind reviewer saw. SH_BREAK=stride|plank|hat|stairs|trayoff|bench|post|apart|endon|traykeep|crouch|trayhigh|kneeltap puts one back (the carry check went red on the round nine build itself); all go red.
//   node tools/pose.mjs [--only=desk-hand] [--html=path]
import { drive } from './gates/drive.mjs';
const { failed, report } = await drive({ check: 'pose', name: 'pose', classify: () => 'fail' });
process.exit(failed ? 1 : 0);
void report;
