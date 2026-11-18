// OWNER: shared (world poses it, game keeps its clock). The reading ending, in the chair: what her hands do, one thing at a time (round seventeen).
// The owner: "the scene where she puts her hat down and picks up the book, the animation makes no sense and her hand is
// hardly holding the book". The hat used to slide off her head before her hand got there, and the open book appeared
// in her lap out of nothing while the shut one vanished from her hand. Now, on one clock (readT: seconds since she
// finished sitting; negative while she lowers herself), each thing moves only while a hand has it:
//   she sits with the shut book in her left hand and lays it on her lap, the hand resting on it;
//   her right hand goes up to the hat's brim, closes on it, lifts it off, carries it out and down to the deck, lets go,
//   and comes back;
//   both hands take the book's edges, lift it to reading height, and her left hand opens the cover; then she reads.
// tools/guide.mjs readgrip measures every step of it.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const READ = {
  lap: [-0.55, 0.15],                                        // the shut book goes from her hand to her lap as she sits
  hat: { reach: [0.25, 0.95], grip: [0.95, 1.15], carry: [1.15, 2.9], let: [2.9, 3.05], back: [3.05, 3.75] },
  book: { reach: [3.7, 4.3], grip: [4.3, 4.5], lift: [4.5, 5.3], open: [5.3, 6.2] },
};
export const at = (span, t) => smooth(span[0], span[1], t);
// how far the hat has gone from her head to the deck (0 .. 1), and whether her hand is holding it
export const hatPath = (t) => at(READ.hat.carry, t);
export const hatHeld = (t) => t >= READ.hat.carry[0] && t < READ.hat.let[0];   // (from the moment it leaves her head until her hand opens)
