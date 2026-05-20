// brett/public/assets/mayhem/keybindings.js
(function (root) {
  const DEFAULT_BINDINGS = {
    forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD',
    sprint: 'ShiftLeft', jump: 'Space', flail: 'KeyF',
    prevWeapon: 'KeyQ', nextWeapon: 'KeyE',
    reload: 'KeyR', vehicle: 'KeyV', cycleMode: 'KeyG', toggleMayhem: 'KeyM',
  };
  const STORAGE_KEY = 'brett:keybindings';

  function load() {
    try {
      const raw = root.localStorage ? root.localStorage.getItem(STORAGE_KEY) : null;
      const saved = raw ? JSON.parse(raw) : null;
      return saved ? { ...DEFAULT_BINDINGS, ...saved } : { ...DEFAULT_BINDINGS };
    } catch (_) {
      return { ...DEFAULT_BINDINGS };
    }
  }

  function save(bindings) {
    try {
      root.localStorage && root.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    } catch (_) {}
  }

  function getAction(code, bindings) {
    for (const [action, key] of Object.entries(bindings)) {
      if (key === code) return action;
    }
    return null;
  }

  const api = { DEFAULT_BINDINGS, load, save, getAction };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MayhemKeybindings = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
