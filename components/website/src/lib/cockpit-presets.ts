export interface CockpitFilterState {
  status: string[];
  area: string[];
  brand: string[];
}

export interface Preset {
  id: string;
  name: string;
  state: CockpitFilterState;
  isDefault: boolean;
  createdAt: number;
}

export const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'default-offen',
    name: 'Offen',
    state: { status: ['offen'], area: [], brand: [] },
    isDefault: true,
    createdAt: 0,
  },
  {
    id: 'default-planning',
    name: 'Planning',
    state: { status: ['planning', 'plan_staged'], area: [], brand: [] },
    isDefault: true,
    createdAt: 0,
  },
  {
    id: 'default-deploy',
    name: 'Deploy',
    state: { status: ['awaiting_deploy'], area: [], brand: [] },
    isDefault: true,
    createdAt: 0,
  },
];

const sessionPresets = new Map<string, Preset>();
export let quotaEvictedFlag = false;

export function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__test_localstorage__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function savePreset(name: string, state: CockpitFilterState): Preset {
  const newPreset: Preset = {
    id: `preset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: '',
    state,
    isDefault: false,
    createdAt: Date.now(),
  };

  if (!isLocalStorageAvailable()) {
    const existing = Array.from(sessionPresets.values());
    let suffix = 2;
    let finalName = name;
    while (existing.some(p => p.name === finalName)) {
      finalName = `${name}-${suffix}`;
      suffix++;
    }
    newPreset.name = finalName;
    sessionPresets.set(newPreset.id, newPreset);
    return newPreset;
  }

  let userPresets: Preset[] = [];
  const raw = localStorage.getItem('cockpit:presets:user');
  if (raw) {
    try {
      userPresets = JSON.parse(raw);
    } catch {
      userPresets = [];
    }
  }

  let suffix = 2;
  let finalName = name;
  while (userPresets.some(p => p.name === finalName)) {
    finalName = `${name}-${suffix}`;
    suffix++;
  }
  newPreset.name = finalName;
  userPresets.push(newPreset);

  let saved = false;
  let attempts = 0;
  while (!saved && attempts < 10) {
    try {
      localStorage.setItem('cockpit:presets:user', JSON.stringify(userPresets));
      saved = true;
    } catch (e) {
      attempts++;
      // standard localStorage full indicators
      const err = e as { name?: string; code?: number };
      if (err.name === 'QuotaExceededError' || err.code === 22 || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        if (userPresets.length <= 1) {
          break;
        }
        const addedPreset = userPresets.pop();
        userPresets.sort((a, b) => a.createdAt - b.createdAt);
        userPresets.shift(); // remove oldest
        if (addedPreset) {
          userPresets.push(addedPreset);
        }
        quotaEvictedFlag = true;
      } else {
        throw e;
      }
    }
  }

  return newPreset;
}

export function loadPresets(): Preset[] {
  let userPresets: Preset[] = [];
  if (!isLocalStorageAvailable()) {
    userPresets = Array.from(sessionPresets.values());
  } else {
    const raw = localStorage.getItem('cockpit:presets:user');
    if (raw) {
      try {
        userPresets = JSON.parse(raw);
      } catch {
        userPresets = [];
      }
    }
  }
  return [...DEFAULT_PRESETS, ...userPresets];
}

export function deletePreset(id: string): void {
  if (id.startsWith('default-') || DEFAULT_PRESETS.some(p => p.id === id)) {
    return;
  }

  if (!isLocalStorageAvailable()) {
    sessionPresets.delete(id);
    return;
  }

  const raw = localStorage.getItem('cockpit:presets:user');
  if (!raw) return;
  try {
    let userPresets: Preset[] = JSON.parse(raw);
    userPresets = userPresets.filter(p => p.id !== id);
    localStorage.setItem('cockpit:presets:user', JSON.stringify(userPresets));
  } catch {
    // ignore
  }
}

export function applyPreset(id: string): CockpitFilterState | null {
  const presets = loadPresets();
  const found = presets.find(p => p.id === id);
  return found ? found.state : null;
}

export function encodeState(state: CockpitFilterState): string {
  const json = JSON.stringify(state);
  const encoded = btoa(json).replace(/=+$/, '');
  if (encoded.length > 2000) {
    throw new Error('Encoded state too long');
  }
  return encoded;
}

export function decodeState(encoded: string): CockpitFilterState | null {
  try {
    let base64 = encoded;
    while (base64.length % 4) {
      base64 += '=';
    }
    const json = atob(base64);
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') {
      return {
        status: Array.isArray(parsed.status) ? parsed.status : [],
        area: Array.isArray(parsed.area) ? parsed.area : [],
        brand: Array.isArray(parsed.brand) ? parsed.brand : [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function parsePresetFromUrl(search: string): CockpitFilterState | null {
  const params = new URLSearchParams(search);
  const encoded = params.get('preset');
  if (!encoded) return null;
  return decodeState(encoded);
}

export function buildShareUrl(state: CockpitFilterState, origin: string): string {
  return `${origin}/admin/cockpit?preset=${encodeState(state)}`;
}

export function evictOldestNonDefault(maxEntries = 20): void {
  if (!isLocalStorageAvailable()) return;
  const raw = localStorage.getItem('cockpit:presets:user');
  if (!raw) return;
  let presets: Preset[] = [];
  try {
    presets = JSON.parse(raw);
  } catch {
    return;
  }
  presets = presets.filter(p => !p.isDefault);
  if (presets.length <= maxEntries) return;

  presets.sort((a, b) => a.createdAt - b.createdAt);
  const toKeep = presets.slice(presets.length - maxEntries);
  localStorage.setItem('cockpit:presets:user', JSON.stringify(toKeep));
  quotaEvictedFlag = true;
}
