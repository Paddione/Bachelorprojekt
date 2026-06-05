import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { hostsInText, runS3 } from './s3-hostnames.mjs';
import { loadGates } from '../load.mjs';

const here = join(fileURLToPath(import.meta.url), '..');
const repoRoot = join(here, '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');
const read = (p) => readFileSync(join(here, '..', 'fixtures', 's3', p), 'utf8');

test('hostsInText finds literal hosts and skips comment lines', () => {
  const hosts = hostsInText(read('dirty.yaml'));
  assert.deepEqual([...hosts].sort(), ['files.mentolder.de', 'web.korczewski.de']);
});

test('hostsInText returns empty for a clean file', () => {
  assert.deepEqual([...hostsInText(read('clean.yaml'))], []);
});

test('runS3 over real repo returns documented contract shape', () => {
  const res = runS3(repoRoot, loadGates(cfgDir));
  assert.equal(res.gate, 'S3');
  assert.ok(['pass', 'fail'].includes(res.status));
  for (const v of res.violations) {
    assert.ok(v.key.startsWith('S3:'));
    assert.equal(v.metric, 1);
    // key↔detail coupling: detail embeds exactly the host the key encodes.
    // key = `S3:${path}:${host}` so the host is the key suffix after `S3:<path>:`.
    assert.equal(v.detail, 'hardcoded host: ' + v.key.slice(('S3:' + v.path + ':').length));
  }
  // configmap-domains.yaml is allowlisted → never appears.
  assert.ok(!res.violations.some((v) => v.path === 'k3d/configmap-domains.yaml'));
});
