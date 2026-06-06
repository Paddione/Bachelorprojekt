// Verifies that coaching mode is fully isolated from combat/Mayhem code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dir, '../public/index.html'), 'utf8');
const serverJs = readFileSync(join(__dir, '../server.js'), 'utf8');
// Also scan src/server/ for comprehensive coverage (the real logic lives there now)
let serverSrcAll = serverJs;
try {
  serverSrcAll += '\n' + readAll(join(__dir, '../src/server'));
} catch (e) {}

function readAll(dir) {
  let out = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out += readAll(p);
    else if (/\.(ts|js|mjs)$/.test(entry.name)) out += readFileSync(p, 'utf8') + '\n';
  }
  return out;
}
let clientSrc = html;
try {
  const clientDir = join(__dir, '../src/client');
  clientSrc += '\n' + readAll(clientDir);
} catch (e) {}

test('index.html does not contain the word "mayhem"', () => {
  assert.ok(
    !/mayhem/i.test(clientSrc),
    'client code must not contain the word "mayhem" in any form'
  );
});

test('server source does not contain the word "mayhem"', () => {
  assert.ok(
    !/mayhem/i.test(serverSrcAll),
    'server source must not contain the word "mayhem" in any form'
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

test('server source does not contain custom skins upload/validation/GLB/OIDC skins tokens', () => {
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
      !serverSrcAll.includes(token),
      `server source must not contain the custom skins token "${token}"`
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

