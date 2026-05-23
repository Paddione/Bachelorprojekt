// brett/public/assets/mode-state.mjs
const VALID = new Set(['coaching', 'mode-select']);

export function createModeState({ storage = window.localStorage } = {}) {
  let mode = 'coaching';
  const listeners = new Map();
  function emit(type, payload) { (listeners.get(type) || []).forEach(fn => fn(payload)); }

  return {
    current: () => mode,
    setMode(m) {
      if (!VALID.has(m)) return false;
      mode = m;
      emit('change', mode);
      return true;
    },
    on(type, fn) {
      const arr = listeners.get(type) || [];
      arr.push(fn); listeners.set(type, arr);
    },
  };
}
