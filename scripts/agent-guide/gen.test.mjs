import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDescriptions } from '../gen-platform-descriptions.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('buildDescriptions maps every component slug to {de, en} by kind', () => {
  const out = buildDescriptions(join(repoRoot, 'docs', 'agent-guide', 'registry', 'components.yaml'));
  assert.ok(out.software.keycloak, 'keycloak present in software');
  assert.equal(typeof out.software.keycloak.de, 'string');
  assert.equal(out.software.keycloak.en, 'SSO / OIDC identity provider');
  assert.ok(out.hardware['pk-hetzner-4'], 'pk-hetzner-4 present in hardware');
});
