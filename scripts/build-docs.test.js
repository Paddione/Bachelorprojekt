// scripts/build-docs.test.js
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