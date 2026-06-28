// scripts/docs-gen/templates-render-page.test.mjs
// Tests for renderPage, provenanceBadge, and documentHead utilities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderPage,
  provenanceBadge,
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
  assert.ok(
    html.includes('final authority on the editorial reading experience'),
    'full description (last sentence) must not be truncated at the template layer',
  );
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

test('renderPage: subdir pages use depth-aware relative paths for assets and nav', () => {
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
