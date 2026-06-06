// brett/src/client/ui/optik-map.ts — Phase D / D11
//
// Pure mapping from OptikSettings to concrete scene parameters. NO three.js/DOM
// import → node/tsx-importable and unit-testable. The three-aware applyOptikToScene
// (optik.ts) consumes this and mutates the live floor/sky/lights.

import type { OptikSettings } from '../../types/state';

export type SkyPreset = 'day' | 'dusk' | 'calm';

export interface SceneOptikParams {
  floorColor: string;
  skyPreset: SkyPreset;
  lightColor: string;
  lightIntensity: number;
}

// Named floor presets → base color. Unknown/undefined floor → a neutral slate.
const FLOOR_COLORS: Record<string, string> = {
  'felt-green': '#2f5d4a',
  slate: '#2a3340',
  'wood-dark': '#3a2a1e',
  marble: '#4a4f58',
  sand: '#5a5040',
};

// Light mood → directional key color + intensity.
const LIGHT_MOODS: Record<NonNullable<OptikSettings['lightMood']>, { color: string; intensity: number }> = {
  neutral: { color: '#e8ecf2', intensity: 1.0 },
  warm: { color: '#f0d28c', intensity: 1.1 },
  cool: { color: '#9cc4f0', intensity: 0.95 },
};

/**
 * Pure. Defaults: floor → neutral slate, sky → 'day', lightMood → 'neutral'.
 * Tolerates undefined / partial input.
 */
export function optikToSceneParams(optik: OptikSettings | undefined | null): SceneOptikParams {
  const o = optik ?? {};
  const floorColor = (o.floor && FLOOR_COLORS[o.floor]) || '#2a3340';
  const skyPreset: SkyPreset = o.sky ?? 'day';
  const mood = LIGHT_MOODS[o.lightMood ?? 'neutral'];
  return {
    floorColor,
    skyPreset,
    lightColor: mood.color,
    lightIntensity: mood.intensity,
  };
}
