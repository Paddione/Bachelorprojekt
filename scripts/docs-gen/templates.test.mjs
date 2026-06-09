// scripts/docs-gen/templates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderPage,
  provenanceBadge,
  renderSectionIndex,
  renderLanding,
  deduplicateSkills,
  categoryForSkill,
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
  assert.ok(html.includes('href="../index.html"'), 'breadcrumb to landing (subdir → ../)');
  assert.ok(html.includes('href="../agents.html"'), 'breadcrumb to section index (subdir → ../');
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

// ─── Subdir-path correctness (FA regression) ─────────────────────────────────
// Pages in agents/ or skills/ must use ../ to reach root-level assets.
// Pages at root level must keep ./.
test('renderPage: subdir pages use depth-aware relative paths for assets and nav', () => {
  // agents/ subdir page
  const htmlAgent = renderPage({
    page: agentPage,
    contentHtml: '<p>x</p>',
    toc: '',
    related: [],
  });
  assert.ok(htmlAgent.includes('href="../style.css"'), 'agent page: style.css uses ../');
  assert.ok(htmlAgent.includes('src="../app.js"'), 'agent page: app.js uses ../');
  assert.ok(htmlAgent.includes('href="../index.html"'), 'agent page: brand link uses ../');
  assert.ok(htmlAgent.includes('href="../agents.html"'), 'agent page: section breadcrumb uses ../');
  assert.ok(!htmlAgent.includes('href="./style.css"'), 'agent page: no ./ for style.css');

  // skills/ subdir page (plugin)
  const htmlSkill = renderPage({
    page: pluginSkillPage,
    contentHtml: '<p>x</p>',
    toc: '',
    related: [],
  });
  assert.ok(htmlSkill.includes('href="../style.css"'), 'skill page: style.css uses ../');
  assert.ok(htmlSkill.includes('src="../app.js"'), 'skill page: app.js uses ../');
  assert.ok(htmlSkill.includes('href="../index.html"'), 'skill page: brand link uses ../');
  assert.ok(htmlSkill.includes('href="../skills.html"'), 'skill page: section breadcrumb uses ../');

  // root-level doc page must keep ./
  const htmlDoc = renderPage({
    page: docPage,
    contentHtml: '<p>x</p>',
    toc: '',
    related: [],
  });
  assert.ok(htmlDoc.includes('href="./style.css"'), 'doc page: style.css keeps ./');
  assert.ok(htmlDoc.includes('src="./app.js"'), 'doc page: app.js keeps ./');
  assert.ok(htmlDoc.includes('href="./index.html"'), 'doc page: index.html keeps ./');
});

// ─── deduplicateSkills ────────────────────────────────────────────────────────

const makeSkillPage = (name, plugin, version, provenance) => ({
  slug: `${plugin}--${name}`,
  type: 'skill',
  provenance: provenance ?? `${plugin}@${version}`,
  name,
  title: name,
  description: '',
  domain: null,
  bodyMarkdown: '',
  sourcePath: `/x/${plugin}/${version}/skills/${name}/SKILL.md`,
  outRelPath: `skills/${plugin}--${name}.html`,
});

test('deduplicateSkills: keeps only the newest version per (plugin, name) pair', () => {
  const old = makeSkillPage('brainstorming', 'superpowers', '4.0.0');
  const newer = makeSkillPage('brainstorming', 'superpowers', '5.1.0');
  const unrelated = makeSkillPage('tdd', 'superpowers', '5.1.0');
  const result = deduplicateSkills([old, newer, unrelated]);
  assert.equal(result.length, 2, 'one entry per unique skill name');
  assert.ok(result.some(p => p.provenance === 'superpowers@5.1.0' && p.name === 'brainstorming'),
    'newer version kept');
  assert.ok(!result.some(p => p.provenance === 'superpowers@4.0.0'),
    'older version removed');
});

test('deduplicateSkills: repo skills are kept as-is (no version conflict)', () => {
  const repoSkill = {
    slug: 'dev-flow-plan',
    type: 'skill',
    provenance: 'repo',
    name: 'dev-flow-plan',
    title: 'dev-flow-plan',
    description: '',
    domain: null,
    bodyMarkdown: '',
    sourcePath: '/x/.claude/skills/dev-flow-plan/SKILL.md',
    outRelPath: 'skills/dev-flow-plan.html',
  };
  const pluginSkill = makeSkillPage('brainstorming', 'superpowers', '5.1.0');
  const result = deduplicateSkills([repoSkill, pluginSkill]);
  assert.equal(result.length, 2, 'both retained');
  assert.ok(result.some(p => p.provenance === 'repo'), 'repo skill kept');
});

test('deduplicateSkills: same skill from two different plugins both kept', () => {
  const a = makeSkillPage('using-git-worktrees', 'superpowers', '5.1.0');
  const b = makeSkillPage('using-git-worktrees', 'update-dependencies', '1.0.0');
  const result = deduplicateSkills([a, b]);
  assert.equal(result.length, 2, 'different plugin → different key → both kept');
});

// ─── categoryForSkill ─────────────────────────────────────────────────────────

test('categoryForSkill: maps known plugin names to correct categories', () => {
  const sup = { ...pluginSkillPage, provenance: 'superpowers@5.1.0', name: 'brainstorming' };
  assert.equal(categoryForSkill(sup), 'dev-workflow');

  const hf = { ...pluginSkillPage, provenance: 'huggingface-skills@1.0.3', name: 'hf-cli' };
  assert.equal(categoryForSkill(hf), 'ki-ml');

  const chrome = { ...pluginSkillPage, provenance: 'chrome-devtools-mcp@1.2.0', name: 'a11y-debugging' };
  assert.equal(categoryForSkill(chrome), 'browser');

  const pluginDev = { ...pluginSkillPage, provenance: 'plugin-dev@1.0.0', name: 'agent-development' };
  assert.equal(categoryForSkill(pluginDev), 'plugin-bau');

  const mcp = { ...pluginSkillPage, provenance: 'mcp-server-dev@1.0.0', name: 'build-mcp-server' };
  assert.equal(categoryForSkill(mcp), 'mcp-api');
});

test('categoryForSkill: mcp-cli from superpowers-lab → mcp-api despite plugin', () => {
  const mcpCli = { ...pluginSkillPage, provenance: 'superpowers-lab@1.0.0', name: 'mcp-cli' };
  assert.equal(categoryForSkill(mcpCli), 'mcp-api');
});

test('categoryForSkill: repo dev-flow skills → dev-workflow', () => {
  const dfp = { slug: 'dev-flow-plan', type: 'skill', provenance: 'repo', name: 'dev-flow-plan',
    title: 'dev-flow-plan', description: '', domain: null, bodyMarkdown: '',
    sourcePath: '/x/SKILL.md', outRelPath: 'skills/dev-flow-plan.html' };
  assert.equal(categoryForSkill(dfp), 'dev-workflow');
});

test('categoryForSkill: repo infra skills → bachelorprojekt-infra', () => {
  const sk = { slug: 'fleet-ops', type: 'skill', provenance: 'repo', name: 'fleet-ops',
    title: 'fleet-ops', description: '', domain: null, bodyMarkdown: '',
    sourcePath: '/x/SKILL.md', outRelPath: 'skills/fleet-ops.html' };
  assert.equal(categoryForSkill(sk), 'bachelorprojekt-infra');
});

test('categoryForSkill: unknown plugin → fallback claude-code', () => {
  const unknown = { ...pluginSkillPage, provenance: 'some-new-plugin@1.0.0', name: 'some-skill' };
  assert.equal(categoryForSkill(unknown), 'claude-code');
});
