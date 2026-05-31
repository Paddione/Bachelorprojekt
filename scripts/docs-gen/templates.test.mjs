// scripts/docs-gen/templates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderPage,
  provenanceBadge,
  renderSectionIndex,
  renderLanding,
} from './templates.mjs';

// A long multi-line description like the agent `description: >` block scalars.
// The FIRST and LAST sentences must both survive to prove no truncation at the
// template layer (the gray-matter parser already fixed the discover/parse layer).
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

test('renderPage: emits a full HTML5 document', () => {
  const html = renderPage({
    page: docPage,
    contentHtml: '<h1>Architecture</h1><p>body</p>',
    toc: '',
    related: [],
  });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'starts with doctype');
  assert.ok(html.includes('<link rel="stylesheet" href="./style.css">'), 'links stylesheet');
  assert.ok(html.includes('<script src="./app.js"></script>'), 'links client js');
  assert.ok(html.includes('<title>Architecture'), 'title in <title>');
  assert.ok(html.includes('<h1>Architecture</h1>'), 'content passed through');
});

test('renderPage: includes the page title and the FULL multi-line description (no truncation)', () => {
  const html = renderPage({
    page: agentPage,
    contentHtml: '<p>agent body</p>',
    toc: '',
    related: [],
  });
  assert.ok(html.includes('bachelorprojekt-website'), 'title rendered');
  // Regression: prove the LAST sentence of a long description survives the template.
  assert.ok(
    html.includes('final authority on the editorial reading experience'),
    'full description (last sentence) must not be truncated at the template layer',
  );
  // And the first sentence too.
  assert.ok(html.includes('Use this agent for website work'), 'first sentence present');
});

test('renderPage: header shows provenance badge, domain tag, and breadcrumbs', () => {
  const html = renderPage({
    page: agentPage,
    contentHtml: '<p>x</p>',
    toc: '',
    related: [],
  });
  assert.ok(html.includes('repo'), 'provenance badge text present');
  assert.ok(html.includes('website'), 'domain tag present');
  assert.ok(html.includes('href="./index.html"'), 'breadcrumb to landing');
  assert.ok(html.includes('href="./agents.html"'), 'breadcrumb to section index');
});

test('renderPage: appends a related-links footer when related is non-empty', () => {
  const html = renderPage({
    page: docPage,
    contentHtml: '<p>x</p>',
    toc: '',
    related: [
      { url: './keycloak.html', title: 'Keycloak' },
      { url: './architecture.html', title: 'Architecture' },
    ],
  });
  assert.ok(html.includes('class="related-footer"'), 'related section rendered');
  assert.ok(html.includes('href="./keycloak.html"'), 'related link href');
  assert.ok(html.includes('>Keycloak<'), 'related link title');
});

test('renderPage: escapes HTML-special characters in title and description', () => {
  const html = renderPage({
    page: { ...docPage, title: 'A & B <x>', description: 'one "two" <three>' },
    contentHtml: '<p>x</p>',
    toc: '',
    related: [],
  });
  assert.ok(html.includes('A &amp; B &lt;x&gt;'), 'title escaped');
  assert.ok(html.includes('&lt;three&gt;'), 'description escaped');
});

test('provenanceBadge: repo vs plugin differ and plugin badge carries the version', () => {
  const repo = provenanceBadge('repo');
  const plugin = provenanceBadge('superpowers@5.1.0');
  assert.notEqual(repo, plugin, 'repo and plugin badges differ');
  assert.ok(repo.includes('repo'), 'repo badge says repo');
  assert.ok(plugin.includes('5.1.0'), 'plugin badge carries the version');
  assert.ok(plugin.includes('superpowers'), 'plugin badge carries the plugin name');
  assert.ok(plugin.includes('plugin'), 'plugin badge is labelled plugin');
});

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
  // one skill, one agent, one doc in the fixture set
  assert.ok(/Skills[\s\S]*?1/.test(html), 'skills count rendered');
  assert.ok(/Agents[\s\S]*?1/.test(html), 'agents count rendered');
  assert.ok(/Docs[\s\S]*?1/.test(html), 'docs count rendered');
  // grouped cards link into the section index pages
  assert.ok(html.includes('href="./skills.html"'), 'links skills section');
  assert.ok(html.includes('href="./agents.html"'), 'links agents section');
  assert.ok(html.includes('href="./docs.html"'), 'links docs section');
});

// ─── renderLanding (Plan 2 override: graph hero + noscript fallback) ───────────
test('renderLanding: embeds graph SVG, fallback section list, and legend marker', () => {
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
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const registry = { pages, bySlug, resolve: (n) => bySlug.get(n) ?? null };
  const edges = [{ from: 'database-ops', to: 'bachelorprojekt-ops', kind: 'wikilink' }];
  const routingRows = [
    { signals: ['pod', 'logs', 'status'], agent: 'bachelorprojekt-ops' },
    { signals: ['database', 'psql'], agent: 'bachelorprojekt-db' },
  ];

  const html = renderLanding({ pages, registry, edges, routingRows });

  assert.ok(html.startsWith('<!DOCTYPE html>'), 'is a full HTML document');
  assert.ok(html.includes('<svg'), 'embeds the graph SVG');
  assert.ok(html.includes('<noscript>'), 'has a noscript fallback');
  assert.ok(/Skills\s*\(1\)/.test(html), 'fallback lists Skills with a count');
  assert.ok(/Agents\s*\(1\)/.test(html), 'fallback lists Agents with a count');
  assert.ok(/Docs\s*\(1\)/.test(html), 'fallback lists Docs with a count');
  assert.ok(html.includes('graph-legend'), 'contains the legend marker');
  assert.ok(html.includes('href="./skills/database-ops.html"'),
    'fallback links a skill page by outRelPath');
});

test('documentHead loads the brand web fonts', () => {
  const html = renderPage({ page: docPage, contentHtml: '<p>x</p>', toc: '', related: [] });
  assert.ok(/fonts\.googleapis\.com|Geist|Instrument\+Serif/.test(html),
    'must include a font source link for Geist + Instrument Serif');
});

test('renderPage emits a branded site header and footer', () => {
  const html = renderPage({ page: docPage, contentHtml: '<p>x</p>', toc: '', related: [] });
  assert.ok(html.includes('site-header'), 'branded site header present');
  assert.ok(html.includes('Dokumentation'), 'wordmark text present');
  assert.ok(html.includes('site-footer'), 'branded site footer present');
});
