// Minimal patch-based pub/sub store.
// store.get() -> snapshot, store.set(slice, patch) -> shallow-merge & notify,
// store.subscribe(slice, fn) -> unsubscribe.

export function createStore(initial) {
  const state = structuredClone(initial);
  const subs = new Map(); // slice -> Set<fn>

  const notify = (slice) => {
    const set = subs.get(slice);
    if (!set) return;
    const snap = state[slice];
    for (const fn of set) fn(snap);
  };

  return {
    get: () => state,
    getSlice: (slice) => state[slice],
    set(slice, patch) {
      if (typeof patch === 'function') patch = patch(state[slice]);
      Object.assign(state[slice], patch);
      notify(slice);
    },
    // Replace an item inside an array slice (decks[idx] = patch merge)
    setIn(slice, index, patch) {
      const arr = state[slice];
      arr[index] = { ...arr[index], ...patch };
      notify(slice);
    },
    subscribe(slice, fn) {
      let set = subs.get(slice);
      if (!set) subs.set(slice, (set = new Set()));
      set.add(fn);
      fn(state[slice]); // prime
      return () => set.delete(fn);
    },
  };
}
