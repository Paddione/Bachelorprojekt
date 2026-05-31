// scripts/docs-gen/render-markdown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderMarkdown,
  renderDiagrams,
  addHeadingIds,
  buildToc,
  injectCopyButtons,
  rewriteCrossLinks,
} from './render-markdown.mjs';

// A minimal registry stub matching the contract:
//   resolve(name) -> Page | undefined
//   outPathFor(page) -> string
function makeRegistry(map) {
  return {
    resolve(name) {
      return map[name];
    },
    outPathFor(page) {
      return page.outRelPath;
    },
  };
}

test('renderDiagrams: mermaid block falls back to a styled code block when mmdc is absent', () => {
  const html =
    '<p>before</p><pre><code class="language-mermaid">flowchart LR\n  A--&gt;B</code></pre><p>after</p>';
  const { html: out, fallbacks } = renderDiagrams(html, { mmdc: '/nonexistent/mmdc', dot: '/nonexistent/dot' });
  assert.ok(out.includes('before'), 'keeps surrounding content');
  assert.ok(out.includes('after'), 'keeps surrounding content');
  assert.ok(out.includes('class="diagram-fallback"'), 'emits diagram fallback class');
  assert.equal(fallbacks, 1, 'counts one diagram fallback');
});

test('renderDiagrams: dot block falls back to a styled code block when dot is absent', () => {
  const html =
    '<pre><code class="language-dot">digraph G { a -&gt; b }</code></pre>';
  const { html: out, fallbacks } = renderDiagrams(html, { mmdc: '/nonexistent/mmdc', dot: '/nonexistent/dot' });
  assert.ok(out.includes('class="diagram-fallback"'), 'emits diagram fallback class');
  assert.ok(out.includes('digraph G'), 'preserves the dot source text');
  assert.equal(fallbacks, 1, 'counts one diagram fallback');
});

test('addHeadingIds: gives an h2 a slug id with German umlaut handling', () => {
  const out = addHeadingIds('<h2>Konfiguration &amp; Außenüberwachung</h2>');
  // ä→ae ö→oe ü→ue ß→ss, spaces→hyphens, drop chars outside [a-z0-9-]
  assert.ok(out.includes('id="konfiguration--aussenueberwachung"'), `got: ${out}`);
});

test('buildToc: renders a toc-box from a headings array of length >= 2', () => {
  const out = buildToc(['Installation', 'Konfiguration', 'Betrieb']);
  assert.ok(out.includes('class="toc-box auto-toc"'), 'toc box class');
  assert.ok(out.includes('Auf dieser Seite'), 'toc title');
  assert.ok(out.includes('href="#installation"'), 'first heading anchor');
  assert.equal(buildToc(['only one']), '', 'no toc for a single heading');
});

test('injectCopyButtons: adds a copy button to a pre/code, skips diagram fallbacks', () => {
  const html =
    '<pre><code class="language-bash">echo hi</code></pre>' +
    '<pre class="diagram-fallback"><code>flowchart LR</code></pre>';
  const out = injectCopyButtons(html);
  assert.ok(out.includes('class="copy-btn"'), 'copy button injected');
  assert.ok(out.includes('class="code-wrapper"'), 'wrapper injected');
  // exactly one copy button — the diagram-fallback pre must be skipped
  assert.equal(out.split('copy-btn').length - 1, 1, 'only the real code block gets a button');
});

test('rewriteCrossLinks: [[known]] -> anchor to outRelPath, [[missing]] -> plain text + reported', () => {
  const registry = makeRegistry({
    'keycloak-realm-sync': { slug: 'keycloak-realm-sync', outRelPath: 'skills/keycloak-realm-sync.html' },
  });
  const page = { slug: 'security-overview' };
  const { html, unresolved } = rewriteCrossLinks(
    '<p>see [[keycloak-realm-sync]] and [[missing]]</p>',
    { registry, page }
  );
  assert.ok(
    html.includes('<a href="./skills/keycloak-realm-sync.html"'),
    `known wiki-link becomes anchor; got: ${html}`
  );
  assert.ok(html.includes('keycloak-realm-sync</a>'), 'anchor label is the bare name');
  assert.ok(!html.includes('[[keycloak-realm-sync]]'), 'resolved marker removed');
  assert.ok(html.includes('missing') && !html.includes('[[missing]]') , 'missing rendered as plain text');
  assert.equal(unresolved.length, 1, 'one unresolved ref reported');
  assert.equal(unresolved[0].ref, 'missing', 'reports the bare missing name');
});

test('rewriteCrossLinks: relative .md link resolves to the target outRelPath', () => {
  const registry = makeRegistry({
    'wsl-bootstrap': { slug: 'wsl-bootstrap', outRelPath: 'wsl-bootstrap.html' },
  });
  const page = { slug: 'index' };
  const { html } = rewriteCrossLinks(
    '<p><a href="WSL-BOOTSTRAP.md">setup</a></p>',
    { registry, page }
  );
  assert.ok(html.includes('href="./wsl-bootstrap.html"'), `md link rewritten; got: ${html}`);
  assert.ok(html.includes('>setup</a>'), 'preserves the original link label');
});

test('renderMarkdown: end to end returns html, headings, unresolved, diagramFallbacks', () => {
  const registry = makeRegistry({
    'wsl-bootstrap': { slug: 'wsl-bootstrap', outRelPath: 'wsl-bootstrap.html' },
  });
  const page = { slug: 'overview' };
  const md = [
    '# Overview',
    '',
    '## Erste Schritte',
    '',
    'See [[wsl-bootstrap]] and [[ghost]].',
    '',
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '```',
    '',
    '```bash',
    'echo hi',
    '```',
  ].join('\n');
  const result = renderMarkdown(md, {
    registry,
    page,
    mmdc: '/nonexistent/mmdc',
    dot: '/nonexistent/dot',
  });
  assert.ok(Array.isArray(result.headings), 'headings is an array');
  assert.ok(result.headings.includes('Erste Schritte'), 'collects the h2 text');
  assert.ok(result.html.includes('id="erste-schritte"'), 'h2 gets an id');
  assert.ok(result.html.includes('href="./wsl-bootstrap.html"'), 'cross-link resolved');
  assert.equal(result.unresolved.length, 1, 'one unresolved wiki-link');
  assert.equal(result.unresolved[0].ref, 'ghost', 'reports ghost');
  assert.equal(result.diagramFallbacks, 1, 'mermaid fell back once');
  assert.ok(result.html.includes('class="copy-btn"'), 'copy button present');
});
