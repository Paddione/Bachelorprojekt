// Verifies that coaching mode is fully isolated from combat/Mayhem code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dir, '../public/index.html'), 'utf8');
const serverJs = readFileSync(join(__dir, '../server.js'), 'utf8');

let clientSrc = html;
try {
  const clientDir = join(__dir, '../src/client');
  for (const file of readdirSync(clientDir)) {
    if (/\.(ts|js|mjs)$/.test(file)) {
      clientSrc += '\n' + readFileSync(join(clientDir, file), 'utf8');
    }
  }
} catch (e) {}

test('index.html does not contain the word "mayhem"', () => {
  assert.ok(
    !/mayhem/i.test(clientSrc),
    'client code must not contain the word "mayhem" in any form'
  );
});

test('server.js does not contain the word "mayhem"', () => {
  assert.ok(
    !/mayhem/i.test(serverJs),
    'server.js must not contain the word "mayhem" in any form'
  );
});

test('index.html does not contain gait, walking, or WASD movement tokens', () => {
  const walkingTokens = [
    'gait',
    'tickWalkAnimation',
    'tickWalk',
    'wasdKeys',
    'WALK_SPEED',
    'SPRINT_MULT',
    'walkTarget'
  ];
  for (const token of walkingTokens) {
    assert.ok(
      !clientSrc.includes(token),
      `client code must not contain the walking/gait token "${token}"`
    );
  }
});

test('server.js does not contain custom skins upload/validation/GLB/OIDC skins tokens', () => {
  const skinsTokens = [
    'validateGlb',
    'SKINS_DIR',
    'listSkins',
    'slugifyForSkin',
    '/api/skins/upload',
    '/api/skins'
  ];
  for (const token of skinsTokens) {
    assert.ok(
      !serverJs.includes(token),
      `server.js must not contain the custom skins token "${token}"`
    );
  }
});

test('index.html loads the coaching HUD bootstrap module', () => {
  assert.ok(
    html.includes("import { mountCoachingHud }") || html.includes("coaching/hud.mjs"),
    'coaching HUD module must be imported in index.html'
  );
});

test('named persons are brand-tagged so mentolder can hide them', () => {
  assert.ok(clientSrc.includes("brand: 'korczewski'"), 'NAMED_PERSONS entries must carry a brand tag');
});

test('add message carries the figure label', () => {
  assert.ok(/type:\s*['"]add['"][\s\S]{0,400}label/.test(clientSrc), 'add payload should include label');
});

