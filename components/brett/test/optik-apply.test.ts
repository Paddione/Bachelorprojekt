import { test } from 'node:test';
import assert from 'node:assert';
import { optikToSceneParams } from '../src/client/ui/optik-map';

// D11 — Pure optik→scene mapper (no WebGL/DOM). Maps the three OptikSettings
// fields to concrete scene params; partial/undefined input falls back to the
// documented defaults (sky:'day', lightMood:'neutral').

test('optikToSceneParams maps a full OptikSettings', () => {
  const p = optikToSceneParams({ floor: 'felt-green', sky: 'dusk', lightMood: 'warm' });
  assert.strictEqual(p.skyPreset, 'dusk');
  assert.strictEqual(typeof p.floorColor, 'string');
  assert.strictEqual(typeof p.lightColor, 'string');
  assert.strictEqual(typeof p.lightIntensity, 'number');
});

test('optikToSceneParams falls back to defaults for undefined input', () => {
  const p = optikToSceneParams(undefined as any);
  assert.strictEqual(p.skyPreset, 'day');
  // neutral light mood
  assert.strictEqual(typeof p.lightColor, 'string');
});

test('optikToSceneParams falls back per-field for partial input', () => {
  const p = optikToSceneParams({ floor: 'slate' });
  assert.strictEqual(p.skyPreset, 'day');
  assert.strictEqual(typeof p.floorColor, 'string');
});

test('distinct sky presets produce distinct mappings', () => {
  const day = optikToSceneParams({ sky: 'day' });
  const dusk = optikToSceneParams({ sky: 'dusk' });
  const calm = optikToSceneParams({ sky: 'calm' });
  assert.strictEqual(day.skyPreset, 'day');
  assert.strictEqual(dusk.skyPreset, 'dusk');
  assert.strictEqual(calm.skyPreset, 'calm');
});

test('distinct light moods produce distinct light colors', () => {
  const warm = optikToSceneParams({ lightMood: 'warm' });
  const cool = optikToSceneParams({ lightMood: 'cool' });
  const neutral = optikToSceneParams({ lightMood: 'neutral' });
  assert.notStrictEqual(warm.lightColor, cool.lightColor);
  assert.notStrictEqual(warm.lightColor, neutral.lightColor);
});
