// Verifies that coaching mode is fully isolated from combat/Mayhem code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

function readAll(dir: string): string {
  let out = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out += readAll(p);
    else if (/\.(ts|js|mjs)$/.test(entry.name)) out += readFileSync(p, 'utf8') + '\n';
  }
  return out;
}

const serverSrcAll = readAll(join(__dir, '../src/server'));
const clientSrc = readFileSync(join(__dir, '../public/index.html'), 'utf8')
  + '\n' + readAll(join(__dir, '../src/client'));

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

// NOTE (T000505): The 3D asset-generation pipeline legitimately introduces a
// single, validated POST /api/skins/upload endpoint (brett/src/server/skins-upload.ts)
// as the storage sink for Mixamo-rigged GLBs produced by the website pipeline.
// That sanctioned endpoint uses the names attachSkinsUpload / validateGlbSize /
// glbHasMixamoBones / SKINS_ROOT. This guard therefore only forbids the tokens
// unique to the *rejected* earlier skins implementation (a separate listing/
// slugify/SKINS_DIR design that must not return).
test('server source does not contain the rejected custom-skins-listing tokens', () => {
  const rejectedTokens = [
    'SKINS_DIR',
    'listSkins',
    'slugifyForSkin'
  ];
  for (const token of rejectedTokens) {
    assert.ok(
      !serverSrcAll.includes(token),
      `server source must not contain the rejected custom skins token "${token}"`
    );
  }
});

test('index.html loads the coaching HUD bootstrap module', () => {
  const html = readFileSync(join(__dir, '../public/index.html'), 'utf8');
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
