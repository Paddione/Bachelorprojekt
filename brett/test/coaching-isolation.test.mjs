// Verifies that coaching mode is fully isolated from combat/Mayhem code.
// Tests are RED before the fix and GREEN after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dir, '../public/index.html'), 'utf8');

test('index.html does not contain static #mayhem-btn (should be added dynamically)', () => {
  // The button should not be in static HTML — it flashes before module JS removes it.
  // After fix: button is added dynamically by main.js only when availableModes includes mayhem.
  assert.ok(
    !html.includes('id="mayhem-btn"'),
    '#mayhem-btn must not appear in static HTML; add it dynamically from main.js'
  );
});

test('index.html does not contain static #brett-controls-btn (mayhem-only control)', () => {
  // This button opens MayhemControlsPanel — meaningless in coaching mode.
  // After fix: added dynamically alongside #mayhem-btn.
  assert.ok(
    !html.includes('id="brett-controls-btn"'),
    '#brett-controls-btn must not appear in static HTML; add it dynamically from main.js'
  );
});

test('inline script does not call window.Mayhem.init() unconditionally in WS open handler', () => {
  // The WS open handler must NOT init Mayhem directly — that must go through main.js mode gate.
  // After fix: Mayhem init is delegated to window.__brettInitMayhem(), called only in mayhem mode.
  const wsOpenBlock = html.match(/ws\.addEventListener\("open"[\s\S]*?ws\.addEventListener\("close"/)?.[0] ?? '';
  assert.ok(
    !wsOpenBlock.includes('window.Mayhem.init('),
    'window.Mayhem.init() must not be called directly in the WS open handler'
  );
});

test('inline script does not call MayhemControlsPanel.showDiscoveryBanner() unconditionally', () => {
  // Discovery banner announces combat controls — should not appear in coaching mode.
  // After fix: called inside window.__brettInitMayhem(), gated behind mode selection.
  const wsOpenBlock = html.match(/ws\.addEventListener\("open"[\s\S]*?ws\.addEventListener\("close"/)?.[0] ?? '';
  assert.ok(
    !wsOpenBlock.includes('showDiscoveryBanner'),
    'showDiscoveryBanner() must not be called directly in the WS open handler'
  );
});

test('index.html loads the coaching HUD bootstrap module', () => {
  assert.ok(
    html.includes("import { mountCoachingHud }") || html.includes("coaching/hud.mjs"),
    'coaching HUD module must be imported in index.html'
  );
});

test('named persons are brand-tagged so mentolder can hide them', () => {
  assert.ok(html.includes("brand: 'korczewski'"), 'NAMED_PERSONS entries must carry a brand tag');
});

test('add message carries the figure label', () => {
  // The add payload must include label so it syncs/persists.
  assert.ok(/type:\s*['"]add['"][\s\S]{0,400}label/.test(html), 'add payload should include label');
});
