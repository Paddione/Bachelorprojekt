// brett/public/assets/mode-state.mjs
const VALID = new Set(['coaching', 'ffa', 'mode-select']);
const STUB = new Set(['teams', 'coop']);
const KEY_LOADOUT = 'brett.loadout';

export function createModeState({ storage = window.localStorage } = {}) {
  let mode = 'coaching';
  const listeners = new Map();
  function emit(type, payload) { (listeners.get(type) || []).forEach(fn => fn(payload)); }

  function readLoadout() {
    try { return JSON.parse(storage.get?.(KEY_LOADOUT) ?? storage.getItem?.(KEY_LOADOUT)); } catch { return null; }
  }
  function writeLoadout(l) {
    const v = JSON.stringify(l);
    storage.set ? storage.set(KEY_LOADOUT, v) : storage.setItem(KEY_LOADOUT, v);
  }

  return {
    current: () => mode,
    setMode(m) {
      if (STUB.has(m)) { emit('stub-attempted', m); return false; }
      if (!VALID.has(m)) return false;
      mode = m;
      emit('change', mode);
      return true;
    },
    loadout: () => readLoadout() ?? { melee: 'club', ranged: 'handgun' },
    setLoadout(l) { writeLoadout(l); emit('loadout-change', l); },
    on(type, fn) {
      const arr = listeners.get(type) || [];
      arr.push(fn); listeners.set(type, arr);
    },
  };
}
