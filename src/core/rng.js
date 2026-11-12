// FROZEN (director). Deterministic RNG. The build refuses the built-in random call anywhere in src/.
export function createRng(seed = 1) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.fork = (salt) => createRng((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
  return next;
}
