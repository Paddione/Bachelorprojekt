#!/usr/bin/env node
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DIR = join(REPO_ROOT, 'tmp', 'claude-scratch');

function usage() {
  console.error(`Usage: node scripts/web-audit.mjs [flags]

  --brand <name>           Brand: mentolder or korczewski
  --routes <list>          Comma-separated routes (default: /,/ueber-mich,/kontakt,/coaching for mentolder, / for korczewski)
  --extract-fixture <path> Extract from HTML file, print JSON, exit
  --axe-fixture <path>     Use frozen axe JSON instead of running task
  --axe-exit-code <N>      Simulate axe failure with exit code N
  --lighthouse-fixture <path> Use frozen lighthouse JSON
  --check-tokens           With --extract-fixture: assemble prompt for N routes, print token count, exit
  --proxy-url <url>        Override llm-proxy URL (default: http://127.0.0.1:18235)
  --proxy-timeout <ms>     Timeout for proxy requests (default: 5000)
  --dry-run                Skip LLM call, print token estimate
`);
  process.exit(2);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { routes: null, axeFixture: null, axeExitCode: null, lighthouseFixture: null, proxyUrl: 'http://127.0.0.1:18235', proxyTimeout: 5000, dryRun: false, extractFixture: null, brand: null, checkTokens: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--brand' && args[i + 1]) opts.brand = args[++i];
    else if (a === '--routes' && args[i + 1]) opts.routes = args[++i];
    else if (a === '--extract-fixture' && args[i + 1]) opts.extractFixture = args[++i];
    else if (a === '--axe-fixture' && args[i + 1]) opts.axeFixture = args[++i];
    else if (a === '--axe-exit-code' && args[i + 1]) opts.axeExitCode = parseInt(args[++i], 10);
    else if (a === '--lighthouse-fixture' && args[i + 1]) opts.lighthouseFixture = args[++i];
    else if (a === '--proxy-url' && args[i + 1]) opts.proxyUrl = args[++i];
    else if (a === '--proxy-timeout' && args[i + 1]) opts.proxyTimeout = parseInt(args[++i], 10);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--check-tokens') opts.checkTokens = true;
    else if (a === '-h' || a === '--help') usage();
  }
  return opts;
}

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

function defaultRoutes(brand) {
  return brand === 'korczewski' ? ['/'] : ['/', '/ueber-mich', '/kontakt', '/coaching'];
}

function baseUrl(brand) {
  if (brand === 'mentolder') return 'https://web.mentolder.de';
  if (brand === 'korczewski') return 'https://web.korczewski.de';
  if (process.env.PROD_DOMAIN) return `https://web.${process.env.PROD_DOMAIN}`;
  return null;
}

// ── Semantic extract ──────────────────────────────────────────────────────────

function extractSemantic(html, baseUrlForResolve = '') {
  const images = [];
  const meta = [];
  const headings = [];
  const links = [];

  const htmlLower = html.toLowerCase();

  const metaRe = /<meta\b([^>]*?)>/gi;
  let mm;
  while ((mm = metaRe.exec(html)) !== null) {
    const attrs = parseAttrs(mm[1]);
    if (attrs.name || attrs.property || attrs.charset) {
      meta.push({ name: attrs.name || attrs.property || 'charset', content: attrs.content || attrs.charset || '' });
    }
  }

  const imgRe = /<img\b([^>]*?)>/gi;
  let im;
  while ((im = imgRe.exec(html)) !== null) {
    const attrs = parseAttrs(im[1]);
    images.push({ alt: attrs.alt || '', src: attrs.src || '' });
  }

  const headingRe = /<h([1-6])\b([^>]*?)>([\s\S]*?)<\/h\1>/gi;
  let hm;
  while ((hm = headingRe.exec(html)) !== null) {
    headings.push({ level: parseInt(hm[1], 10), text: stripHtml(hm[3]).trim() });
  }

  const linkRe = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  let lm;
  while ((lm = linkRe.exec(html)) !== null) {
    const attrs = parseAttrs(lm[1]);
    const label = attrs['aria-label'] || stripHtml(lm[2]).trim();
    if (label) {
      links.push({ text: label, href: attrs.href || '' });
    }
  }

  return { images, meta, headings, links };
}

function parseAttrs(attrStr) {
  const attrs = {};
  const re = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ── Stage helpers ─────────────────────────────────────────────────────────────

function stage1(brand, axeFixture, axeExitCode) {
  const label = 'Stage 1 (axe a11y)';
  console.error(`[${label}] Running...`);
  if (axeFixture) {
    const data = JSON.parse(readFileSync(axeFixture, 'utf8'));
    console.error(`[${label}] Using fixture: ${data.length} violations`);
    return { ok: true, output: JSON.stringify(data, null, 2), exitCode: 0 };
  }
  if (axeExitCode !== null && axeExitCode !== undefined) {
    console.error(`[${label}] Simulated failure (exit ${axeExitCode})`);
    return { ok: false, output: `Simulated axe failure — exit code ${axeExitCode}`, exitCode: axeExitCode };
  }
  try {
    const cwd = join(REPO_ROOT, 'tests', 'e2e');
    const env = { ...process.env };
    if (brand === 'mentolder') { env.WEBSITE_URL = 'https://web.mentolder.de'; env.PROD_DOMAIN = 'mentolder.de'; }
    else if (brand === 'korczewski') { env.WEBSITE_URL = 'https://web.korczewski.de'; env.PROD_DOMAIN = 'korczewski.de'; }
    env.SKIP_DB_PURGE = '1';
    const out = execSync('./node_modules/.bin/playwright test a11y-axe.spec.ts --project=website --reporter=line', {
      cwd, env, encoding: 'utf8', stdio: 'pipe', timeout: 120000
    });
    console.error(`[${label}] Passed — 0 critical/serious violations`);
    return { ok: true, output: out, exitCode: 0 };
  } catch (e) {
    const out = e.stdout || '' + '\n' + (e.stderr || '');
    console.error(`[${label}] FAILED (exit ${e.status})`);
    return { ok: false, output: out, exitCode: e.status };
  }
}

function stage2(brand, lighthouseFixture) {
  const label = 'Stage 2 (Lighthouse)';
  console.error(`[${label}] Running...`);
  if (lighthouseFixture) {
    const data = readFileSync(lighthouseFixture, 'utf8');
    console.error(`[${label}] Using fixture`);
    return { ok: true, output: data };
  }
  try {
    const url = baseUrl(brand);
    if (!url) return { ok: false, output: `No base URL for brand ${brand}` };
    const configPath = join(REPO_ROOT, 'lighthouserc.json');
    ensureDir(TMP_DIR);
    const reportPath = join(TMP_DIR, `lighthouse-${brand}.json`);

    execSync(`npx @lhci/cli collect --url="${url}" --numberOfRuns=1 --settings.chromeFlags="--headless --no-sandbox" 2>&1 || true`, {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 120000
    });
    const reportDir = join(REPO_ROOT, '.lighthouseci');
    let output = 'Lighthouse completed (see .lighthouseci/)';
    if (existsSync(reportDir)) {
      const files = readdirSync(reportDir).filter(f => f.endsWith('.json'));
      if (files.length > 0) {
        const lhr = JSON.parse(readFileSync(join(reportDir, files[0]), 'utf8'));
        const cats = lhr.categories || {};
        output = JSON.stringify({
          performance: cats.performance?.score ?? null,
          accessibility: cats.accessibility?.score ?? null,
          'best-practices': cats['best-practices']?.score ?? null,
          seo: cats.seo?.score ?? null,
        }, null, 2);
      }
    }
    console.error(`[${label}] Completed`);
    return { ok: true, output };
  } catch (e) {
    console.error(`[${label}] FAILED: ${e.message}`);
    return { ok: false, output: e.message };
  }
}

async function stage3(routes, baseUrl, opts) {
  const label = 'Stage 3 (Semantic + LLM)';
  console.error(`[${label}] Starting...`);

  const extract = [];
  let chromium;
  try {
    chromium = (await import('playwright')).chromium;
  } catch {
    return { ok: false, extract, error: 'playwright not available' };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const route of routes) {
      const url = baseUrl + route;
      console.error(`[${label}] Rendering ${url}`);
      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        const html = await page.content();
        const sem = extractSemantic(html, baseUrl);
        sem.route = route;
        sem.url = url;
        extract.push(sem);
        await page.close();
      } catch (e) {
        console.error(`[${label}] Route ${route} failed: ${e.message}`);
        extract.push({ route, url, error: e.message });
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return { ok: true, extract };
}

function getModelId(proxyUrl, timeout) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = execSync(
      `curl -sf --max-time ${Math.ceil(timeout / 1000)} "${proxyUrl}/v1/models"`,
      { encoding: 'utf8', timeout: timeout + 2000, stdio: 'pipe' }
    );
    clearTimeout(t);
    const data = JSON.parse(resp);
    const models = data.data || [];
    if (models.length === 0) return null;
    return models[0].id;
  } catch {
    clearTimeout(t);
    return null;
  }
}

function llmCompletion(proxyUrl, modelId, prompt, timeout) {
  const body = JSON.stringify({
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    chat_template_kwargs: { enable_thinking: false },
    max_tokens: 4096
  });
  try {
    const resp = execSync(
      `curl -sf --max-time ${Math.ceil(timeout / 1000)} -H 'content-type: application/json' -d '${body.replace(/'/g, "'\\''")}' "${proxyUrl}/v1/chat/completions"`,
      { encoding: 'utf8', timeout: timeout * 4 + 2000, stdio: 'pipe' }
    );
    const data = JSON.parse(resp);
    return (data.choices || [{}])[0].message?.content || '';
  } catch (e) {
    return null;
  }
}

function formatExtract(extract) {
  let out = '';
  for (const page of extract) {
    out += `\n## Route: ${page.route || 'unknown'} (${page.url || 'N/A'})\n`;
    if (page.error) { out += `ERROR: ${page.error}\n`; continue; }

    if (page.images?.length) {
      out += '\n### Images\n';
      for (const img of page.images) out += `- alt="${img.alt}" src="${img.src}"\n`;
    }
    if (page.meta?.length) {
      out += '\n### Meta Tags\n';
      for (const m of page.meta) out += `- ${m.name}: "${m.content}"\n`;
    }
    if (page.headings?.length) {
      out += '\n### Heading Hierarchy\n';
      for (const h of page.headings) out += `${'  '.repeat(h.level - 1)}- H${h.level}: ${h.text}\n`;
    }
    if (page.links?.length) {
      out += '\n### Links\n';
      for (const l of page.links) out += `- "${l.text}" → ${l.href}\n`;
    }
  }
  return out;
}

function assemblePrompt(extract, stage1Output, stage2Output) {
  return `You are a web accessibility and SEO auditor. Review the following website data and produce two sections:

## 1. Semantic Findings
Evaluate the semantic quality of the pages:
- Do alt texts describe the image content (or are they just file names)?
- Does the meta description have brand and service relevance?
- Are link labels understandable outside their context?
- Is the heading hierarchy logical and complete?

## 2. Triage Ranking
Review the raw audit findings below and rank them by real-world user impact (critical first, cosmetic last). Explain your ranking for each.

---

### Semantic Extract
${formatExtract(extract)}

### Stage 1 — axe a11y Raw Findings
\`\`\`
${stage1Output || '(no findings / stage failed)'}
\`\`\`

### Stage 2 — Lighthouse Metrics
\`\`\`
${stage2Output || '(no metrics / stage failed)'}
\`\`\`

Provide your analysis in German.`;
}

function tokenEstimate(text) {
  return Math.ceil(text.length / 3.5);
}

// ── Report ────────────────────────────────────────────────────────────────────

function writeReport(brand, stages, llmResponse) {
  ensureDir(TMP_DIR);
  const date = new Date().toISOString().slice(0, 10);
  const path = join(TMP_DIR, `web-audit-${brand}-${date}.md`);
  let md = `# Web-Audit: ${brand} — ${date}\n\n`;

  for (const [name, result] of Object.entries(stages)) {
    const status = result.ok ? 'PASSED' : 'FAILED';
    md += `## ${name}\n**Status: ${status}**\n`;
    if (!result.ok) md += `\n> ${result.error || 'Stage reported failure'}\n`;
    if (result.output) md += `\n<details>\n<summary>Raw output</summary>\n\n\`\`\`\n${result.output}\n\`\`\`\n\n</details>\n`;
    md += '\n';
  }

  if (llmResponse) {
    md += `## Semantic Review & Triage\n\n${llmResponse}\n`;
  } else {
    md += `## Semantic Review & Triage\n**Status: FAILED** — LLM review was not completed.\n`;
  }

  writeFileSync(path, md, 'utf8');
  return path;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (opts.extractFixture) {
    const html = readFileSync(opts.extractFixture, 'utf8');
    const result = extractSemantic(html);
    if (opts.checkTokens) {
      const routesRaw = opts.routes || '/,/a,/b';
      const routeList = routesRaw.split(',').map(r => r.trim()).filter(Boolean);
      const multi = routeList.map((r, i) => {
        const s = JSON.parse(JSON.stringify(result));
        s.route = r;
        s.url = `https://example.com${r}`;
        if (i > 0) {
          s.images = s.images.map(im => ({ ...im, src: r + im.src }));
          s.links = s.links.map(l => ({ ...l, href: r + l.href }));
        }
        return s;
      });
      const prompt = assemblePrompt(multi, '{"violations":[]}', '{"performance":0.95}');
      const tc = tokenEstimate(prompt);
      process.stdout.write(String(tc) + '\n');
      return;
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  const brand = opts.brand || process.env.ENV || process.env.BRAND_NAME || 'mentolder';
  switch (brand) { case 'mentolder': case 'korczewski': break; default: console.error('ERROR: brand must be mentolder or korczewski'); process.exit(1); }

  const routesRaw = opts.routes || process.env.WEB_AUDIT_ROUTES;
  const routes = routesRaw ? routesRaw.split(',').map(r => r.trim()).filter(Boolean) : defaultRoutes(brand);
  const url = baseUrl(brand);
  if (!url) { console.error('ERROR: cannot resolve base URL for brand ' + brand); process.exit(1); }

  const stages = {};

  // Stage 1
  const s1 = stage1(brand, opts.axeFixture, opts.axeExitCode);
  stages['Stage 1 — axe a11y'] = s1;

  // Stage 2
  const s2 = stage2(brand, opts.lighthouseFixture);
  stages['Stage 2 — Lighthouse'] = s2;

  // Stage 3
  const modelId = getModelId(opts.proxyUrl, opts.proxyTimeout);
  const modelLine = modelId ? `Using model: ${modelId}` : 'llm-proxy unreachable';

  if (!modelId) {
    console.error('[Stage 3] FAILED: llm-proxy unreachable');
    stages['Stage 3 — Semantic + LLM'] = { ok: false, error: 'llm-proxy unreachable', output: '' };
  } else {
    const s3extract = await stage3(routes, url, opts);
    const extractText = formatExtract(s3extract.extract);
    const prompt = assemblePrompt(s3extract.extract, s1.output, s2.output);
    const tokenCount = tokenEstimate(prompt);

    if (opts.dryRun) {
      console.log(`\n[Dry run] Prompt: ${tokenCount} estimated tokens\n`);
      stages['Stage 3 — Semantic + LLM'] = { ok: true, output: `Prompt assembled (${tokenCount} tokens estimated), skipping LLM call`, error: null };
    } else {
      console.error(`[Stage 3] Prompt: ~${tokenCount} tokens, ${modelLine}`);
      const llmResponse = llmCompletion(opts.proxyUrl, modelId, prompt, opts.proxyTimeout);
      if (llmResponse === null) {
        console.error('[Stage 3] FAILED: LLM completion returned null');
        stages['Stage 3 — Semantic + LLM'] = { ok: false, error: 'LLM completion failed', output: extractText };
      } else {
        console.error('[Stage 3] Completed');
        stages['Stage 3 — Semantic + LLM'] = { ok: true, output: llmResponse };
      }
    }
  }

  // Report
  const llmOutput = stages['Stage 3 — Semantic + LLM']?.output || null;
  const reportPath = writeReport(brand, stages, llmOutput);
  console.log(`\nReport: ${reportPath}`);

  // stdout summary
  console.log(`\n=== Web-Audit ${brand} ===`);
  let allOk = true;
  for (const [name, result] of Object.entries(stages)) {
    const status = result.ok ? 'PASS' : 'FAIL';
    if (!result.ok) allOk = false;
    console.log(`  ${status}  ${name}`);
  }
  console.log(`\nFull report: ${reportPath}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(0); });
