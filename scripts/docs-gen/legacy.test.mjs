// scripts/docs-gen/legacy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewrapLegacyPage } from './legacy.mjs';

// A legacy page shaped like the committed k3d/docs-content-built/*.html:
// <nav class="topnav">, <header class="skill-hero">, inline <style>, <main class="content">.
const SAMPLE = `<!DOCTYPE html>
<html lang="de">
<head>
<title>Systemarchitektur — Workspace MVP</title>
<style>.secret-marker-css{display:none}.topnav{color:red}</style>
</head>
<body>
<nav class="topnav"><a href="./index.html">NAVLINK-MARKER Übersicht</a></nav>
<header class="skill-hero"><h1 class="hero-title">🏗️ Systemarchitektur</h1></header>
<main class="content">
<h2 id="ueberblick">Überblick</h2>
<p>BODY-CONTENT-MARKER architecture details.</p>
<pre><code>kubectl get pods</code></pre>
</main>
<script src="./app.js"></script>
</body>
</html>`;

test('rewrapLegacyPage: extracts main.content body, mode rewrapped', () => {
  const { title, innerHtml, mode } = rewrapLegacyPage(SAMPLE, 'architecture');
  assert.equal(mode, 'rewrapped', 'a page with main.content rewraps');
  assert.equal(title, '🏗️ Systemarchitektur', 'title from the h1.hero-title');
  assert.ok(innerHtml.includes('BODY-CONTENT-MARKER'), 'keeps body content');
  assert.ok(innerHtml.includes('kubectl get pods'), 'keeps code blocks');
  assert.ok(!innerHtml.includes('secret-marker-css'), 'drops inline <style> contents');
  assert.ok(!innerHtml.includes('NAVLINK-MARKER'), 'drops the topnav');
});

test('rewrapLegacyPage: title falls back to <title> minus suffix when no h1', () => {
  const html = `<!DOCTYPE html><html><head><title>Backup &amp; Restore — Workspace MVP</title></head>` +
    `<body><main class="content"><p>CONTENT-X</p></main></body></html>`;
  const { title, innerHtml, mode } = rewrapLegacyPage(html, 'backup');
  assert.equal(mode, 'rewrapped');
  assert.equal(title, 'Backup & Restore', 'title from <title>, suffix stripped, entities decoded');
  assert.ok(innerHtml.includes('CONTENT-X'));
});

test('rewrapLegacyPage: no extractable body returns mode copied with original html', () => {
  const html = '<!DOCTYPE html><html><head><title>Weird</title></head></html>';
  const { title, innerHtml, mode } = rewrapLegacyPage(html, 'weird');
  assert.equal(mode, 'copied', 'no body -> verbatim copy');
  assert.equal(title, 'Weird', 'title from <title>');
  assert.equal(innerHtml, html, 'innerHtml is the verbatim original');
});

test('rewrapLegacyPage: title falls back to slug when nothing usable', () => {
  const html = '<div></div>';
  const { title, mode } = rewrapLegacyPage(html, 'my-slug');
  assert.equal(mode, 'copied');
  assert.equal(title, 'my-slug', 'falls back to the slug');
});
