import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSidebar, rewriteLinks, buildToc } from './build-docs.js';

test('parseSidebar: builds HTML nav from _sidebar.md content', () => {
  const md = `- **Section**\n  - [Page One](page-one)\n  - [Page Two](page-two)\n`;
  const html = parseSidebar(md, 'page-one');
  assert.ok(html.includes('Page One'), 'should include link text');
  assert.ok(html.includes('href="./page-one.html"'), 'should produce relative .html href');
  assert.ok(html.includes('class="active"'), 'should mark active page');
  assert.ok(html.includes('Page Two'), 'should include second link');
});

test('rewriteLinks: converts Docsify hash links to relative .html links', () => {
  const html = '<a href="#/quickstart-enduser">QS</a> <a href="#/">Home</a>';
  const out = rewriteLinks(html);
  assert.ok(out.includes('href="./quickstart-enduser.html"'));
  assert.ok(out.includes('href="./index.html"'));
});

test('buildToc: generates toc-box from h2 list', () => {
  const headings = ['Installation', 'Konfiguration', 'Betrieb'];
  const html = buildToc(headings);
  assert.ok(html.includes('Auf dieser Seite'));
  assert.ok(html.includes('Installation'));
  assert.ok(html.includes('class="toc-box auto-toc"'));
});

test('renderMermaidBlocks: returns fallback pre block when mmdc unavailable', async () => {
  const { renderMermaidBlocks } = await import('./build-docs.js');
  const html = '<p>before</p><pre><code class="language-mermaid">flowchart LR\n  A--&gt;B</code></pre><p>after</p>';
  const out = renderMermaidBlocks(html, '/nonexistent/mmdc');
  assert.ok(out.includes('before'));
  assert.ok(out.includes('after'));
  assert.ok(out.includes('<pre') || out.includes('<svg'));
});

test('postProcess: injects copy buttons and TOC, rewrites links', async () => {
  const { postProcess } = await import('./build-docs.js');
  const html = `<h1>Title</h1>\n<h2>Section A</h2><p>text</p>\n<h2>Section B</h2>\n<pre><code class="language-bash">echo hello</code></pre>\n<a href="#/other-page">link</a>`;
  const out = postProcess(html);
  assert.ok(out.includes('class="copy-btn"'), 'copy button injected');
  assert.ok(out.includes('class="toc-box auto-toc"'), 'toc box injected');
  assert.ok(out.includes('href="./other-page.html"'), 'link rewritten');
  assert.ok(out.includes('<h2 id="section-a"'), 'h2 gets id attribute');
});

test('wrapPage: generates valid HTML with sidebar, search overlay, and active link', async () => {
  const { wrapPage, parseSidebar } = await import('./build-docs.js');
  const html = wrapPage({
    slug: 'test-page',
    title: 'Test Page',
    content: '<h1>Hello</h1><p>World</p>',
    sidebarHtml: parseSidebar('- **Section**\n  - [Test Page](test-page)\n', 'test-page'),
    searchIndex: [{ slug: 'test-page', title: 'Test Page', excerpt: 'World' }],
  });
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<title>Test Page'));
  assert.ok(html.includes('class="active"'));
  assert.ok(html.includes('<h1>Hello</h1>'));
  assert.ok(html.includes('id="search-overlay"'));
});