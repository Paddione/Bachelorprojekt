import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanAndDedup, deriveMetadata } from './batch-ingest-dir.mts';

// ── deriveMetadata ────────────────────────────────────────────────────────────

test('deriveMetadata: file in blockN subdir', () => {
  const m = deriveMetadata('/input/ki/block3/some-file.pdf', '/input/ki', 'co2-2023');
  assert.strictEqual(m.blockSlug, 'block3');
  assert.strictEqual(m.blockCollection, 'coaching-co2-2023-block3');
  assert.strictEqual(m.courseCollection, 'coaching-co2-2023');
});

test('deriveMetadata: file in root dir (no block)', () => {
  const m = deriveMetadata('/input/ki/overview.pdf', '/input/ki', 'co2-2023');
  assert.strictEqual(m.blockSlug, null);
  assert.strictEqual(m.blockCollection, null);
  assert.strictEqual(m.courseCollection, 'coaching-co2-2023');
});

test('deriveMetadata: nested deeper than block', () => {
  const m = deriveMetadata('/input/ki2/block1/sub/file.pdf', '/input/ki2', 'grundkurs-lg29');
  assert.strictEqual(m.blockSlug, 'block1');
  assert.strictEqual(m.blockCollection, 'coaching-grundkurs-lg29-block1');
});

// ── scanAndDedup ──────────────────────────────────────────────────────────────

test('scanAndDedup: deduplicates identical content, prefers clean name', async () => {
  const dir = join(tmpdir(), `dedup-test-${Date.now()}`);
  await mkdir(dir);
  try {
    await writeFile(join(dir, 'clean.pdf'), 'same content');
    await writeFile(join(dir, 'clean_abcdef1234567890abcdef1234567890.pdf'), 'same content');
    await writeFile(join(dir, 'unique.pdf'), 'different content');

    const results = await scanAndDedup(dir);
    assert.strictEqual(results.length, 2, 'should have 2 unique files');
    const names = results.map((r) => r.filename);
    assert.ok(names.includes('clean.pdf'), 'should keep clean name');
    assert.ok(!names.includes('clean_abcdef1234567890abcdef1234567890.pdf'), 'should drop hash-suffix duplicate');
    assert.ok(names.includes('unique.pdf'), 'should keep unique file');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('scanAndDedup: skips images and .mm files', async () => {
  const dir = join(tmpdir(), `skip-test-${Date.now()}`);
  await mkdir(dir);
  try {
    await writeFile(join(dir, 'photo.jpg'), 'image data');
    await writeFile(join(dir, 'map.mm'), '<map></map>');
    await writeFile(join(dir, 'doc.pdf'), 'pdf content');

    const results = await scanAndDedup(dir);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].filename, 'doc.pdf');
  } finally {
    await rm(dir, { recursive: true });
  }
});
