#!/usr/bin/env node
// scripts/plan-review/render-plan.mjs — Markdown→zeilennummeriertes HTML
// Pure Node, kein NPM. Jede Quellzeile = <div class="ln" data-line="N">.
// Usage: node render-plan.mjs <plan.md> [--out <file>]

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const HERE = __dir;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineHtml(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

let codeFence = null;

function lineToHtml(line, lineNum) {
  const lnClass = ['ln'];
  let html = '';

  if (codeFence !== null) {
    if (line.trim() === '```') {
      codeFence = null;
      return { classes: lnClass, content: '</pre></div>' };
    }
    return { classes: lnClass, content: esc(line) + '\n', inCode: true };
  }

  const trimmed = line;

  if (trimmed.startsWith('````') || (trimmed.startsWith('```') && trimmed.trim() !== '```')) {
    codeFence = trimmed.slice(3).trim() || null;
    lnClass.push('ln-code-start');
    const lang = codeFence ? ` class="lang-${esc(codeFence)}"` : '';
    return { classes: lnClass, content: `<pre${lang}><code>` };
  }

  if (trimmed === '```') {
    return { classes: lnClass, content: '</pre>' };
  }

  if (/^#{1,4}\s/.test(trimmed)) {
    const level = trimmed.match(/^#{1,4}/)[0].length;
    const text = inlineHtml(trimmed.replace(/^#+\s*/, ''));
    lnClass.push('ln-heading');
    return { classes: lnClass, content: `<h${level}>${text}</h${level}>` };
  }

  const cbMatch = trimmed.match(/^(\s*)[-*]\s+\[([ x])\]\s*(.*)/);
  if (cbMatch) {
    const checked = cbMatch[2] === 'x';
    const text = inlineHtml(cbMatch[3]);
    const indent = cbMatch[1].length;
    lnClass.push('ln-cb');
    if (checked) lnClass.push('ln-cb-checked');
    return { classes: lnClass, content:
      `<div class="cb-line" style="padding-left:${indent}ch">` +
      `<input type="checkbox"${checked?' checked':''} disabled> <span>${text}</span></div>` };
  }

  const ulMatch = trimmed.match(/^(\s*)[-*]\s+(.*)/);
  if (ulMatch) {
    const text = inlineHtml(ulMatch[2]);
    const indent = ulMatch[1].length;
    lnClass.push('ln-ul');
    return { classes: lnClass, content:
      `<div class="ul-line" style="padding-left:${indent}ch">• ${text}</div>` };
  }

  const olMatch = trimmed.match(/^(\s*)\d+\.\s+(.*)/);
  if (olMatch) {
    const text = inlineHtml(olMatch[2]);
    const indent = olMatch[1].length;
    lnClass.push('ln-ol');
    return { classes: lnClass, content:
      `<div class="ol-line" style="padding-left:${indent}ch">1. ${text}</div>` };
  }

  if (trimmed === '') {
    lnClass.push('ln-blank');
    return { classes: lnClass, content: '<br>' };
  }

  return { classes: lnClass, content: `<p>${inlineHtml(trimmed)}</p>` };
}

function render(mdPath) {
  const md = readFileSync(mdPath, 'utf8');
  const lines = md.split('\n');
  const lineCount = lines.length;

  const bodyParts = [];
  for (let i = 0; i < lineCount; i++) {
    const lineNum = i + 1;
    const result = lineToHtml(lines[i], lineNum);
    const classes = result.classes.join(' ');
    bodyParts.push(
      `<div class="${classes}" data-line="${lineNum}" data-line-count="${lineCount}">` +
      `<span class="ln-num">${lineNum}</span>` +
      `<span class="ln-content">${result.content}</span></div>`
    );
  }

  const clientPath = join(HERE, 'annotate-client.js');
  let clientJs = '';
  if (existsSync(clientPath)) {
    clientJs = readFileSync(clientPath, 'utf8');
  }

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan-Review</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font: 14px/1.5 system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 0 0 80px; }
.ln { display: flex; align-items: flex-start; padding: 1px 8px; border-left: 3px solid transparent; cursor: default; }
.ln:hover { background: rgba(255,255,255,0.04); }
.ln.selected { background: rgba(74,144,226,0.15); border-left-color: #4a90e2; }
.ln-num { width: 3em; text-align: right; padding-right: 12px; color: #666; font-size: 12px; user-select: none; flex-shrink: 0; }
.ln-content { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; }
.ln pre { background: #2a2a3e; padding: 8px 12px; border-radius: 6px; overflow-x: auto; white-space: pre; }
.ln code { background: #2a2a3e; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
.ln h1, .ln h2, .ln h3, .ln h4 { margin: 0; }
.ln h1 { font-size: 20px; }
.ln h2 { font-size: 17px; }
.ln h3 { font-size: 15px; }
.ln h4 { font-size: 14px; }
.ln p { margin: 0; }
.ln-blank { min-height: 0.5em; }
.ln .cb-line { display: flex; align-items: center; gap: 6px; }
.ln .cb-line input[type="checkbox"] { opacity: 0.5; }
.ln-code-start { margin-top: 4px; }
</style>
</head>
<body>
<div id="plan-review-root">
${bodyParts.join('\n')}
</div>
<script>
${clientJs}
<\/script>
</body>
</html>`;

  return html;
}

const args = process.argv.slice(2);
let mdPath = null;
let outPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && i + 1 < args.length) {
    outPath = args[++i];
  } else if (!mdPath) {
    mdPath = args[i];
  }
}
if (!mdPath) { console.error('Usage: node render-plan.mjs <plan.md> [--out <file>]'); process.exit(1); }

const html = render(mdPath);
if (outPath) {
  writeFileSync(outPath, html, 'utf8');
  console.error('rendered:', outPath);
} else {
  process.stdout.write(html);
}
