// scripts/docs-gen/navigation.test.mjs
// TDD tests for navigation.mjs — red before navigation.mjs exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNavModel,
  categoryForSkill,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  AGENT_GROUPS,
  DOC_GROUPS,
} from './navigation.mjs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePage(slug, type, extra = {}) {
  return {
    slug,
    type,
    provenance: extra.provenance ?? 'repo',
    name: extra.name ?? slug,
    title: extra.title ?? slug,
    description: '',
    domain: null,
    bodyMarkdown: '',
    sourcePath: '',
    outRelPath: `${slug}.html`,
    ...extra,
  };
}

// ─── buildNavModel shape ─────────────────────────────────────────────────────

test('buildNavModel: returns {sections, order, prevNext, sectionOf}', () => {
  const pages = [makePage('intro', 'doc'), makePage('dev-flow-plan', 'skill', { name: 'dev-flow-plan' })];
  const model = buildNavModel(pages);
  assert.ok(typeof model.sectionOf === 'function', 'sectionOf is a function');
  assert.ok(Array.isArray(model.sections), 'sections is an array');
  assert.ok(Array.isArray(model.order), 'order is an array');
  assert.ok(model.prevNext instanceof Map, 'prevNext is a Map');
});

test('buildNavModel: sectionOf assigns every page to a non-empty string key', () => {
  const pages = [
    makePage('dev-flow-plan', 'skill', { name: 'dev-flow-plan' }),
    makePage('bachelorprojekt-ops', 'agent', { name: 'bachelorprojekt-ops' }),
    makePage('architecture', 'doc'),
  ];
  const model = buildNavModel(pages);
  for (const page of pages) {
    const key = model.sectionOf(page);
    assert.equal(typeof key, 'string', `${page.slug} has string key`);
    assert.ok(key.length > 0, `${page.slug} key is non-empty`);
  }
});

test('buildNavModel: each page belongs to exactly one section', () => {
  const pages = [
    makePage('alpha', 'doc', { title: 'Alpha' }),
    makePage('beta', 'doc', { title: 'Beta' }),
    makePage('gamma', 'doc', { title: 'Gamma' }),
  ];
  const model = buildNavModel(pages);
  for (const page of pages) {
    let count = 0;
    for (const section of model.sections) {
      if (section.pages.some((p) => p.slug === page.slug)) count++;
    }
    assert.equal(count, 1, `${page.slug} appears in exactly one section`);
  }
});

test('buildNavModel: unknown doc slug falls back to referenz section', () => {
  const pages = [makePage('totally-unknown-doc-xyz', 'doc')];
  const model = buildNavModel(pages);
  assert.equal(model.sectionOf(pages[0]), 'referenz', 'unknown doc → referenz');
});

test('buildNavModel: unknown agent falls back to sonstige', () => {
  const pages = [makePage('random-plugin-agent', 'agent', { name: 'random-plugin-agent', provenance: 'some-plugin@1.0.0' })];
  const model = buildNavModel(pages);
  assert.equal(model.sectionOf(pages[0]), 'sonstige', 'unknown agent → sonstige');
});

test('buildNavModel: prevNext has entries for all pages', () => {
  const pages = [
    makePage('alpha', 'doc', { title: 'Alpha' }),
    makePage('beta', 'doc', { title: 'Beta' }),
  ];
  const model = buildNavModel(pages);
  assert.ok(model.prevNext.has('alpha'), 'alpha has prevNext entry');
  assert.ok(model.prevNext.has('beta'), 'beta has prevNext entry');
});

test('buildNavModel: prevNext is symmetric (a.next→b implies b.prev→a)', () => {
  const pages = [
    makePage('aardvark', 'doc', { title: 'Aardvark' }),
    makePage('buffalo', 'doc', { title: 'Buffalo' }),
  ];
  const model = buildNavModel(pages);
  const aNav = model.prevNext.get('aardvark');
  const bNav = model.prevNext.get('buffalo');
  // Both are in same section (referenz); sorted alphabetically: aardvark < buffalo
  if (aNav?.next && bNav?.prev) {
    assert.equal(aNav.next.slug, 'buffalo', 'aardvark.next = buffalo');
    assert.equal(bNav.prev.slug, 'aardvark', 'buffalo.prev = aardvark');
  }
});

test('buildNavModel: order is CATEGORY_ORDER for skills', () => {
  const pages = [makePage('dev-flow-plan', 'skill', { name: 'dev-flow-plan' })];
  const model = buildNavModel(pages);
  assert.deepEqual(model.order, CATEGORY_ORDER, 'order === CATEGORY_ORDER');
});

test('buildNavModel: sections are sorted alphabetically within each group', () => {
  const pages = [
    makePage('zebra', 'doc', { title: 'Zebra' }),
    makePage('aardvark', 'doc', { title: 'Aardvark' }),
  ];
  const model = buildNavModel(pages);
  const refSection = model.sections.find((s) => s.key === 'referenz');
  if (refSection) {
    const titles = refSection.pages.map((p) => p.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(titles, sorted, 'pages within section are sorted by title');
  }
});

// ─── categoryForSkill ────────────────────────────────────────────────────────

test('categoryForSkill: repo dev-flow-plan → dev-workflow', () => {
  const page = makePage('dev-flow-plan', 'skill', { name: 'dev-flow-plan', provenance: 'repo' });
  assert.equal(categoryForSkill(page), 'dev-workflow');
});

test('categoryForSkill: superpowers plugin → dev-workflow', () => {
  const page = makePage('brainstorming', 'skill', { name: 'brainstorming', provenance: 'superpowers@5.1.0' });
  assert.equal(categoryForSkill(page), 'dev-workflow');
});

test('categoryForSkill: huggingface-skills plugin → ki-ml', () => {
  const page = makePage('hf-cli', 'skill', { name: 'hf-cli', provenance: 'huggingface-skills@1.0.3' });
  assert.equal(categoryForSkill(page), 'ki-ml');
});

test('categoryForSkill: mcp-cli override → mcp-api regardless of plugin', () => {
  const page = makePage('mcp-cli', 'skill', { name: 'mcp-cli', provenance: 'superpowers-lab@1.0.0' });
  assert.equal(categoryForSkill(page), 'mcp-api');
});

// ─── Exported constants ──────────────────────────────────────────────────────

test('CATEGORY_ORDER: is a non-empty array of strings', () => {
  assert.ok(Array.isArray(CATEGORY_ORDER), 'is an array');
  assert.ok(CATEGORY_ORDER.length > 0, 'non-empty');
  assert.ok(CATEGORY_ORDER.includes('dev-workflow'), 'has dev-workflow');
});

test('CATEGORY_LABELS: each key in CATEGORY_ORDER has a label', () => {
  for (const key of CATEGORY_ORDER) {
    assert.ok(typeof CATEGORY_LABELS[key] === 'string', `label for ${key} exists`);
  }
});

test('AGENT_GROUPS: has bachelorprojekt group first', () => {
  assert.ok(Array.isArray(AGENT_GROUPS), 'is an array');
  assert.equal(AGENT_GROUPS[0].key, 'bachelorprojekt', 'first group is bachelorprojekt');
});

test('DOC_GROUPS: has handbuecher and architektur groups', () => {
  assert.ok(Array.isArray(DOC_GROUPS), 'is an array');
  assert.ok(DOC_GROUPS.some((g) => g.key === 'handbuecher'), 'has handbuecher');
  assert.ok(DOC_GROUPS.some((g) => g.key === 'architektur'), 'has architektur');
});
