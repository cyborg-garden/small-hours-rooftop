// Gate: what is drawn over time. Every fault here was seen by a blind reviewer (round three):
//   stream  water from the cup's lip, the cup drawn, in her hand and in sight (it was hidden against the pots)
//   vanish  nothing on screen and in sight stops being drawn while the picture is up (the neighbour at the stair head,
//           the bucket in the by-hand ending)
//   frozen  nobody in a conversation holds one pose for 4 s
//   book    the open book is the real model, both hands on it; once the camera is in on her reading, nothing stands in
//           front of her face (readface) or hides more than one of five points of the book (readbook)
//   bucket  the bucket, set down, stays in sight; where it meets the boards is in sight, and it stands on them (float)
//   gaze    reading, she never looks into the camera (round nine)
//   source  with an empty cup, the barrel or the tap she needs is on screen (round nine, phone)
//   loose   no rope of water is drawn unless the cup is pouring it (round nine: a blob floated by his hand)
//   readsit from the moment she sits: face and arms not hidden by a pot or the hoop, no elbow in a pot (readpot),
//           the open book only once she is down (readearly) (round ten)
//   ring    no chalk ring is drawn over the tray while it is in the picture (round ten: a faint circle on the tray)
//   readeyes reading, each pupil's line of sight meets the open spread within 12 degrees and turns no more than 16
//           degrees sideways in the head (round fourteen: her eyes were off the page and she looked wary)
//   readquiet reading, no unlined pipework drawn nearer the camera than she is (round fourteen: a pale band on phone)
//   (both red on the round thirteen build)
//   tapclear while the camera is on the brass tap and she is not going to it, no part of her, her hat or the cup is drawn over
//           the tap, and it is in the picture (round fifteen: red on the round fourteen build, desk)
// SH_BREAK=streamoff|tamvanish|bucketgone|bucketup|bucketback|pole|frozen|bookslab|bookhands|stare|nolook|tail|trayring|chairnear|bookearly puts one back; each goes red.
//   node tools/scene.mjs [--only=desk-hand] [--html=path]      SH_GPU=1 is faster
import { drive } from './gates/drive.mjs';
// one hidden sample can be a plant leaf crossing the cup for a frame; three in one pour is a hidden cup
const { failed } = await drive({ check: 'scene', name: 'scene', classify: (r) => (r.tag === 'hidden' || r.tag === 'bucket' || r.tag === 'footing' ? (r.n >= 3 ? 'fail' : 'ok') : 'fail') });
process.exit(failed ? 1 : 0);
