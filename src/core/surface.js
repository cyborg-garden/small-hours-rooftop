// Where the game is running. The xbox50 console serves a game from /cart/ and plays it on a TV with one stick and
// one button, so there the words are bigger, the focus ring is always on, and the sound is voiced for TV speakers.
export const TV = (() => { try { return location.pathname.startsWith('/cart/'); } catch (_) { return false; } })();
