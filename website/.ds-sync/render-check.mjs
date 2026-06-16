// Render-check gate: open each <Name>.html headless, assert non-empty root, screenshot.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { COMPONENTS } from './components.mjs';

const OUT = path.resolve('ds-bundle');
const SHOTS = path.join(OUT, '_screenshots');
mkdirSync(SHOTS, { recursive: true });
const only = process.argv.slice(2); // optional component name filter

const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
for (const c of COMPONENTS) {
  if (only.length && !only.includes(c.name)) continue;
  const file = path.join(OUT, 'components', c.group, c.name, `${c.name}.html`);
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' }).catch((e) => errs.push('goto: ' + e.message));
  await page.waitForTimeout(1000);
  const info = await page.evaluate(() => {
    const body = document.body;
    const fallback = body.getAttribute('data-ds-fallback') === '1';
    const text = (body.innerText || '').trim();
    const warn = text.startsWith('⚠');
    return { fallback, len: text.length, warn, sample: text.slice(0, 80) };
  }).catch(() => ({ fallback: false, len: 0, warn: false, sample: '(eval failed)' }));
  await page.screenshot({ path: path.join(SHOTS, `${c.group}__${c.name}.png`), fullPage: true }).catch(() => {});
  // Network/CORS fetch failures under file:// are expected for data-bound components
  // (they render their idle state) — non-blocking, like the skill's [RENDER_ERRORS] tag.
  const blockingErrs = errs.filter((e) =>
    !/CORS|ERR_FAILED|Failed to load resource|Access to fetch|net::/i.test(e));
  const bad = !info.fallback && (info.len < 3 || info.warn || blockingErrs.length > 0);
  results.push({ name: c.name, group: c.group, ...info, errs, bad });
  await page.close();
}
await browser.close();
for (const r of results) {
  const tag = r.fallback ? 'FLOOR' : r.bad ? 'BAD  ' : 'OK   ';
  console.log(`${tag} ${r.group}/${r.name}  len=${r.len}${r.warn ? ' WARN' : ''}${r.errs.length ? ' ERR:' + JSON.stringify(r.errs.slice(0, 2)) : ''}  "${r.sample.replace(/\n/g, ' ')}"`);
}
const bad = results.filter((r) => r.bad);
console.log(`\n${results.length} checked · ${results.filter((r) => r.fallback).length} floor · ${bad.length} bad`);
process.exit(bad.length ? 1 : 0);
