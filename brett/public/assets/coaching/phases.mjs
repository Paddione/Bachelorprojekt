export const DEFAULT_STEPS = ['Aufstellen', 'Wahrnehmen', 'Verändern', 'Abschluss'];

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export function createPhaseState({ steps = DEFAULT_STEPS, index = 0 } = {}) {
  let _steps = Array.isArray(steps) && steps.length ? steps.slice() : DEFAULT_STEPS.slice();
  let _index = clamp(index | 0, 0, _steps.length - 1);
  return {
    steps: () => _steps.slice(),
    index: () => _index,
    label: () => _steps[_index],
    advance() { _index = clamp(_index + 1, 0, _steps.length - 1); return _index; },
    back() { _index = clamp(_index - 1, 0, _steps.length - 1); return _index; },
    setIndex(n) { _index = clamp(n | 0, 0, _steps.length - 1); return _index; },
    setSteps(list) {
      if (!Array.isArray(list) || list.length === 0) return false;
      if (!list.every((s) => typeof s === 'string' && s.length)) return false;
      _steps = list.slice();
      _index = clamp(_index, 0, _steps.length - 1);
      return true;
    },
  };
}
