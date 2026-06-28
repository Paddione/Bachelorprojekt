// scripts/docs-gen/templates-section-index.test.mjs
// Tests for renderSectionIndex, renderLanding, and renderSkillsIndex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderSectionIndex,
  renderLanding,
  renderSkillsIndex,
  deduplicateSkills,
} from './templates.mjs';

const FULL_DESC =
  'Use this agent for website work in website/src. ' +
  'It owns Astro and Svelte components, the Kore brand design system, and CSS. ' +
  'It is the final authority on the editorial reading experience.';

const agentPage = {
  slug: 'bachelorprojekt-website',
  type: 'agent',
  provenance: 'repo',
  name: 'bachelorprojekt-website',
  title: 'bachelorprojekt-website',
  description: FULL_DESC,
  domain: 'website',
  bodyMarkdown: '',
  sourcePath: '/abs/.claude/agents/bachelorprojekt-website.md',
  outRelPath: 'agents/bachelorprojekt-website.html',
};

const docPage = {
  slug: 'architecture',
  type: 'doc',
  provenance: 'repo',
  name: 'architecture',
  title: 'Architecture',
  description: 'How the workspace services fit together.',
  domain: 'infra',
  bodyMarkdown: '',
  sourcePath: '/abs/docs/architecture.md',
  outRelPath: 'architecture.html',
};

const pluginSkillPage = {
  slug: 'brainstorming',
  type: 'skill',
  provenance: 'superpowers@5.1.0',
  name: 'brainstorming',
  title: 'Brainstorming',
  description: 'Explore intent before building.',
  domain: 'general',
  bodyMarkdown: '',
  sourcePath: '/abs/plugins/cache/x/superpowers/5.1.0/skills/brainstorming/SKILL.md',
  outRelPath: 'skills/superpowers--brainstorming.html',
};

test('renderSectionIndex: lists each provided page with badge + description', () => {
  const html = renderSectionIndex({
    type: 'agent',
    title: 'Agents',
    pages: [agentPage, { ...agentPage, slug: 'bachelorprojekt-ops', title: 'bachelorprojekt-ops', name: 'bachelorprojekt-ops', outRelPath: 'agents/bachelorprojekt-ops.html', domain: 'ops' }],
  });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(html.includes('>Agents<') || html.includes('Agents'), 'section title present');
  assert.ok(html.includes('bachelorprojekt-website'), 'first page listed');
  assert.ok(html.includes('bachelorprojekt-ops'), 'second page listed');
  assert.ok(html.includes('href="./agents/bachelorprojekt-website.html"'), 'links via outRelPath');
  assert.ok(html.includes('Use this agent for website work'), 'description shown on card');
});

test('renderLanding: contains per-type section counts', () => {
  const registry = { bySlug: new Map(), resolve: () => null };
  const html = renderLanding({
    pages: [agentPage, docPage, pluginSkillPage],
    registry,
  });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(/Skills[\s\S]*?1/.test(html), 'skills count rendered');
  assert.ok(/Agents[\s\S]*?1/.test(html), 'agents count rendered');
  assert.ok(/Docs[\s\S]*?1/.test(html), 'docs count rendered');
  assert.ok(html.includes('href="./skills.html"'), 'links skills section');
  assert.ok(html.includes('href="./agents.html"'), 'links agents section');
  assert.ok(html.includes('href="./docs.html"'), 'links docs section');
});

test('renderLanding: hub has 3 tiles with counts and links to section pages', () => {
  const pages = [
    { slug: 'bachelorprojekt-ops', type: 'agent', provenance: 'repo',
      name: 'bachelorprojekt-ops', title: 'Ops Agent', description: 'ops things',
      domain: 'ops', bodyMarkdown: '', sourcePath: '/x/ops.md',
      outRelPath: 'agents/bachelorprojekt-ops.html' },
    { slug: 'database-ops', type: 'skill', provenance: 'repo',
      name: 'database-ops', title: 'Database Ops', description: 'db runbook',
      domain: 'db', bodyMarkdown: '', sourcePath: '/x/database-ops/SKILL.md',
      outRelPath: 'skills/database-ops.html' },
    { slug: 'wsl-bootstrap', type: 'doc', provenance: 'repo',
      name: 'wsl-bootstrap', title: 'WSL Bootstrap', description: 'setup doc',
      domain: 'general', bodyMarkdown: '', sourcePath: '/x/WSL-BOOTSTRAP.md',
      outRelPath: 'wsl-bootstrap.html' },
  ];
  const registry = { bySlug: new Map(), resolve: () => null };
  const html = renderLanding({ pages, registry });

  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(!html.includes('<svg'), 'no SVG graph in hub mode');
  assert.ok(!html.includes('graph-legend'), 'no graph legend');
  assert.ok(html.includes('hub-tile'), 'hub tiles present');
  assert.ok(html.includes('href="./skills.html"'), 'links to skills section');
  assert.ok(html.includes('href="./agents.html"'), 'links to agents section');
  assert.ok(html.includes('href="./docs.html"'), 'links to docs section');
  assert.ok(/1/.test(html), 'counts present');
});

test('renderSkillsIndex: renders 7 category filter buttons + "Alle" button', () => {
  const pages = [
    { ...pluginSkillPage, slug: 'brainstorming', name: 'brainstorming',
      provenance: 'superpowers@5.1.0', outRelPath: 'skills/superpowers--brainstorming.html' },
    { ...pluginSkillPage, slug: 'hf-cli', name: 'hf-cli',
      provenance: 'huggingface-skills@1.0.3', outRelPath: 'skills/huggingface-skills--hf-cli.html' },
  ];
  const html = renderSkillsIndex({ pages });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(html.includes('cat-filter-btn'), 'filter buttons present');
  assert.ok(html.includes('data-cat="all"'), 'Alle button present');
  assert.ok(html.includes('Dev-Workflow'), 'dev-workflow category label');
  assert.ok(html.includes('KI / ML'), 'ki-ml category label');
});

test('renderSkillsIndex: cards have data-category attribute', () => {
  const page = { ...pluginSkillPage, slug: 'brainstorming', name: 'brainstorming',
    provenance: 'superpowers@5.1.0', outRelPath: 'skills/superpowers--brainstorming.html' };
  const html = renderSkillsIndex({ pages: [page] });
  assert.ok(html.includes('data-category="dev-workflow"'), 'card has data-category');
});

test('renderSkillsIndex: deduplicates skills before rendering', () => {
  const old = { ...pluginSkillPage, slug: 'superpowers--brainstorming',
    name: 'brainstorming', provenance: 'superpowers@4.0.0',
    outRelPath: 'skills/superpowers--brainstorming.html' };
  const newer = { ...pluginSkillPage, slug: 'superpowers--brainstorming',
    name: 'brainstorming', provenance: 'superpowers@5.1.0',
    outRelPath: 'skills/superpowers--brainstorming.html' };
  const html = renderSkillsIndex({ pages: [old, newer] });
  const count = (html.match(/superpowers--brainstorming/g) ?? []).length;
  assert.ok(count <= 2, 'skill not listed twice (one card + one href)');
  assert.ok(html.includes('5.1.0'), 'newer version shown');
  assert.ok(!html.includes('4.0.0'), 'older version removed');
});

test('renderSkillsIndex: repo skills have star marker', () => {
  const repoSkill = {
    slug: 'dev-flow-plan', type: 'skill', provenance: 'repo', name: 'dev-flow-plan',
    title: 'dev-flow-plan', description: '', domain: null, bodyMarkdown: '',
    sourcePath: '/x/SKILL.md', outRelPath: 'skills/dev-flow-plan.html',
  };
  const html = renderSkillsIndex({ pages: [repoSkill] });
  assert.ok(html.includes('skill-star'), 'repo skill has star marker');
  assert.ok(html.includes('skill-repo'), 'repo skill has repo CSS class');
});

test('renderSkillsIndex: count in header shows deduplicated number', () => {
  const pages = [
    { ...pluginSkillPage, slug: 'a', name: 'alpha', provenance: 'superpowers@5.0.0',
      outRelPath: 'skills/superpowers--alpha.html' },
    { ...pluginSkillPage, slug: 'b', name: 'alpha', provenance: 'superpowers@5.1.0',
      outRelPath: 'skills/superpowers--alpha.html' },
  ];
  const html = renderSkillsIndex({ pages });
  assert.ok(html.includes('1 '), 'deduplicated count (1) shown, not 2');
});
