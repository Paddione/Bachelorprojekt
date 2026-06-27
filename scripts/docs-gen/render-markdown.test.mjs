// scripts/docs-gen/render-markdown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  renderMarkdown,
  renderDiagrams,
  addHeadingIds,
  buildToc,
  injectCopyButtons,
  rewriteCrossLinks,
} from './render-markdown.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

test('renderDiagrams: uses cached SVG from snapshots if present', () => {
  const html =
    '<pre><code class="language-mermaid">graph TD\n  X --&gt; Y</code></pre>';
  const src = 'graph TD\n  X --> Y';
  const hash = createHash('sha256').update(src).digest('hex');
  const snapshotDir = join(__dirname, '../../docs/mermaid-snapshots');
  const snapshotFile = join(snapshotDir, `${hash}.svg`);
  
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(snapshotFile, '<svg id="my-fake-cached-svg"></svg>', 'utf8');
  
  try {
    let recordedPath = null;
    const recordSnapshot = (p) => { recordedPath = p; };
    const { html: out, fallbacks } = renderDiagrams(html, {
      mmdc: '/nonexistent/mmdc',
      recordSnapshot,
    });
    
    assert.ok(out.includes('id="my-fake-cached-svg"'), 'uses the cached SVG contents');
    assert.equal(fallbacks, 0, 'no fallbacks counted');
    assert.equal(recordedPath, snapshotFile, 'recorded the used snapshot path');
  } finally {
    try { unlinkSync(snapshotFile); } catch {}
  }
});

test('renderDiagrams: a rendered SVG is wrapped in <figure class="diagram-figure">', () => {
  const html =
    '<pre><code class="language-mermaid">graph TD\n  Fig --&gt; Cap</code></pre>';
  const src = 'graph TD\n  Fig --> Cap';
  const hash = createHash('sha256').update(src).digest('hex');
  const snapshotDir = join(__dirname, '../../docs/mermaid-snapshots');
  const snapshotFile = join(snapshotDir, `${hash}.svg`);
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(snapshotFile, '<svg id="figwrap-svg"></svg>', 'utf8');
  try {
    const { html: out } = renderDiagrams(html, { mmdc: '/nonexistent/mmdc' });
    assert.ok(out.includes('class="diagram-figure"'), 'wraps rendered SVG in a figure');
    assert.ok(out.includes('id="figwrap-svg"'), 'keeps the rendered SVG inside the figure');
    // No caption present → no figcaption element (no empty caption).
    assert.ok(!out.includes('<figcaption'), 'no figcaption when there is no caption');
  } finally {
    try { unlinkSync(snapshotFile); } catch {}
  }
});

test('renderDiagrams: a preceding blockquote "Abbildung:" becomes the figcaption and is consumed', () => {
  const src = 'graph TD\n  Cap --> Tion';
  const hash = createHash('sha256').update(src).digest('hex');
  const snapshotDir = join(__dirname, '../../docs/mermaid-snapshots');
  const snapshotFile = join(snapshotDir, `${hash}.svg`);
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(snapshotFile, '<svg id="cap-svg"></svg>', 'utf8');
  const html =
    '<blockquote>\n<p><strong>Abbildung:</strong> Der Deploy-Ablauf</p>\n</blockquote>' +
    '<pre><code class="language-mermaid">graph TD\n  Cap --&gt; Tion</code></pre>';
  try {
    const { html: out } = renderDiagrams(html, { mmdc: '/nonexistent/mmdc' });
    assert.ok(out.includes('<figcaption'), 'emits a figcaption');
    assert.ok(out.includes('Der Deploy-Ablauf'), 'figcaption carries the caption text');
    // The caption blockquote must be consumed (not double-rendered above the figure).
    assert.ok(!/<blockquote>[\s\S]*Abbildung/.test(out), 'caption blockquote is consumed');
  } finally {
    try { unlinkSync(snapshotFile); } catch {}
  }
});

test('renderDiagrams: a captions map (from the fenced title) supplies the figcaption', () => {
  const src = 'graph TD\n  T --> S';
  const hash = createHash('sha256').update(src).digest('hex');
  const snapshotDir = join(__dirname, '../../docs/mermaid-snapshots');
  const snapshotFile = join(snapshotDir, `${hash}.svg`);
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(snapshotFile, '<svg id="titlecap-svg"></svg>', 'utf8');
  const html =
    '<pre><code class="language-mermaid">graph TD\n  T --&gt; S</code></pre>';
  try {
    const { html: out } = renderDiagrams(html, {
      mmdc: '/nonexistent/mmdc',
      captions: { [src]: 'Titel aus Info-String' },
    });
    assert.ok(out.includes('<figcaption'), 'emits a figcaption from the captions map');
    assert.ok(out.includes('Titel aus Info-String'), 'figcaption carries the info-string title');
  } finally {
    try { unlinkSync(snapshotFile); } catch {}
  }
});

test('renderDiagrams: keeps an aria-friendly zoom hint text on the rendered SVG', () => {
  const src = 'graph TD\n  Z --> H';
  const hash = createHash('sha256').update(src).digest('hex');
  const snapshotDir = join(__dirname, '../../docs/mermaid-snapshots');
  const snapshotFile = join(snapshotDir, `${hash}.svg`);
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(snapshotFile, '<svg id="zoomhint-svg"></svg>', 'utf8');
  const html =
    '<pre><code class="language-mermaid">graph TD\n  Z --&gt; H</code></pre>';
  try {
    const { html: out } = renderDiagrams(html, { mmdc: '/nonexistent/mmdc' });
    assert.ok(out.includes('diagram-zoom-hint'), 'retains the visual zoom hint');
    assert.ok(out.includes('Scroll = Zoom'), 'zoom hint keeps its readable text');
  } finally {
    try { unlinkSync(snapshotFile); } catch {}
  }
});

test('renderMarkdown: a fenced mermaid title="…" flows through to a figcaption', async () => {
  const src = 'flowchart LR\n  A --> B';
  const hash = createHash('sha256').update(src).digest('hex');
  const snapshotDir = join(__dirname, '../../docs/mermaid-snapshots');
  const snapshotFile = join(snapshotDir, `${hash}.svg`);
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(snapshotFile, '<svg id="e2e-title-svg"></svg>', 'utf8');
  const registry = makeRegistry({});
  const page = { slug: 'figs' };
  const md = [
    '# Figs',
    '',
    '```mermaid title="End-to-End Titel"',
    'flowchart LR',
    '  A --> B',
    '```',
  ].join('\n');
  try {
    const result = await renderMarkdown(md, { registry, page, mmdc: '/nonexistent/mmdc', snapshotDir });
    assert.ok(result.html.includes('class="diagram-figure"'), 'figure wrapper present');
    assert.ok(result.html.includes('<figcaption'), 'figcaption emitted from the title');
    assert.ok(result.html.includes('End-to-End Titel'), 'title text carried into the figcaption');
  } finally {
    try { unlinkSync(snapshotFile); } catch {}
  }
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

// Phase 3.1: structured {level, text} TOC (h2+h3)
test('buildToc (structured): accepts {level,text} objects and indents h3', () => {
  const entries = [
    { level: 2, text: 'Installation' },
    { level: 3, text: 'Voraussetzungen' },
    { level: 2, text: 'Konfiguration' },
  ];
  const out = buildToc(entries);
  assert.ok(out.includes('class="toc-box auto-toc"'), 'toc box class');
  assert.ok(out.includes('href="#installation"'), 'h2 anchor correct');
  assert.ok(out.includes('href="#voraussetzungen"'), 'h3 anchor correct');
  // h3 gets indented class
  assert.ok(out.includes('toc-item--h3'), 'h3 items get toc-item--h3 class');
  // h3 uses dash counter, h2 uses numeric counter
  assert.ok(out.includes('<span class="toc-num">–</span>'), 'h3 uses dash counter');
});

test('addHeadingIds (Phase 3.1): assigns ids to both h2 and h3', () => {
  const html = '<h2>Konfiguration</h2><h3>Unterabschnitt</h3>';
  const out = addHeadingIds(html);
  assert.ok(out.includes('id="konfiguration"'), 'h2 gets id');
  assert.ok(out.includes('id="unterabschnitt"'), 'h3 gets id');
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
    snapshotDir: '/nonexistent/snapshots',
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
