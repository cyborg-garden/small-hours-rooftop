// FROZEN (director). Tiny synchronous event bus. Event names live in events.js.
export function createBus() {
  const subs = new Map();
  const log = [];
  return {
    log,
    on(name, fn) {
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(fn);
      return () => subs.get(name).delete(fn);
    },
    emit(name, payload) {
      log.push({ name, payload });
      if (log.length > 600) log.splice(0, 200);
      const a = subs.get(name);
      if (a) for (const fn of [...a]) fn(payload);
      const all = subs.get('*');
      if (all) for (const fn of [...all]) fn(name, payload);
    },
  };
}
