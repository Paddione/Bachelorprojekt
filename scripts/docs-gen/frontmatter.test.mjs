// scripts/docs-gen/frontmatter.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, deriveTitle } from './frontmatter.mjs';

// ── parseFrontmatter ──────────────────────────────────────────────────────────

test('parseFrontmatter: folded block scalar (description: >) keeps the FULL multi-line value (truncation regression)', () => {
  // Copies the shape of .claude/agents/bachelorprojekt-website.md
  const raw = [
    '---',
    'name: bachelorprojekt-website',
    'description: >',
    '  Use for Astro and Svelte website development, UI components, frontend design,',
    '  brand-specific layouts, and the /api/* backend endpoints in the Bachelorprojekt',
    '  website. Triggers on: website/, Astro, Svelte, component, homepage, kore,',
    '  mentolder brand, CSS, UI, frontend, design.',
    '---',
    '',
    'You are a frontend specialist.',
    '',
  ].join('\n');

  const { data, body } = parseFrontmatter(raw);

  assert.equal(data.name, 'bachelorprojekt-website');
  assert.equal(typeof data.description, 'string');
  // The old hand-rolled parser returned just ">" here. Prove no truncation:
  assert.ok(data.description.includes('Astro'), 'first sentence (Astro) must survive');
  assert.ok(data.description.includes('design.'), 'last sentence (design.) must survive');
  assert.notEqual(data.description.trim(), '>', 'must not collapse to the block-scalar indicator');
  // Folded scalar joins lines with spaces -> single logical line.
  assert.ok(body.startsWith('You are a frontend specialist.'), 'body excludes frontmatter');
});

test('parseFrontmatter: literal block scalar (|) preserves newlines', () => {
  const raw = [
    '---',
    'name: thing',
    'notes: |',
    '  line one',
    '  line two',
    '---',
    'body text',
    '',
  ].join('\n');

  const { data } = parseFrontmatter(raw);
  assert.ok(data.notes.includes('line one'), 'first line present');
  assert.ok(data.notes.includes('line two'), 'second line present');
  assert.ok(data.notes.includes('\n'), 'literal scalar keeps the newline between lines');
});

test('parseFrontmatter: missing frontmatter returns { data: {}, body: raw }', () => {
  const raw = '# Just a heading\n\nSome prose with no frontmatter.\n';
  const { data, body } = parseFrontmatter(raw);
  assert.deepEqual(data, {});
  assert.equal(body, raw);
});

test('parseFrontmatter: empty input returns empty data and empty body', () => {
  const { data, body } = parseFrontmatter('');
  assert.deepEqual(data, {});
  assert.equal(body, '');
});

// ── deriveTitle ───────────────────────────────────────────────────────────────

test('deriveTitle: prefers data.title', () => {
  const t = deriveTitle({ title: 'Explicit Title', name: 'the-name' }, '# H1 Heading\n', 'the-slug');
  assert.equal(t, 'Explicit Title');
});

test('deriveTitle: falls back to data.name when no title', () => {
  const t = deriveTitle({ name: 'the-name' }, '# H1 Heading\n', 'the-slug');
  assert.equal(t, 'the-name');
});

test('deriveTitle: falls back to the first markdown H1 in body', () => {
  const t = deriveTitle({}, 'intro line\n\n#  Real Heading  \n\nmore text\n', 'the-slug');
  assert.equal(t, 'Real Heading');
});

test('deriveTitle: falls back to a title-cased slug when nothing else is available', () => {
  const t = deriveTitle({}, 'no heading here, just prose\n', 'cluster-deployment');
  assert.equal(t, 'Cluster Deployment');
});
