#!/usr/bin/env node
// docs-to-html — build script
// Reads a JSON config, renders each input, and interpolates a chosen template
// into a single self-contained HTML file.

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const TEMPLATES = join(PLUGIN_ROOT, 'templates');
const VENDOR = join(__dirname, 'vendor');

// ---- argv ----
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') out.config = argv[++i];
    else if (a === '--quiet') out.quiet = true;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
if (!args.config) die('Usage: build.mjs --config <path/to/config.json>');
const cfg = JSON.parse(readFileSync(args.config, 'utf8'));
for (const k of ['inputs', 'layout', 'out', 'title']) {
  if (!(k in cfg)) die('Missing config key: ' + k);
}

const log = (...m) => { if (!args.quiet) console.error(...m); };

// ---- Load vendored marked (UMD) into globalThis ----
await loadVendor();

// ---- Process inputs ----
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const warnings = [];
const renderedFiles = []; // { path, basename, slug, fileId, title, sections: [{level, text, slug, html, body}], tags: Set, originalHtml }

let totalBytes = 0;
let fileCounter = 0;
for (const p of cfg.inputs) {
  const abs = resolve(p);
  if (!existsSync(abs)) { warnings.push(`Not found: ${abs}`); continue; }
  const st = statSync(abs);
  if (!st.isFile()) { warnings.push(`Not a file: ${abs}`); continue; }
  if (st.size > MAX_FILE_BYTES) { warnings.push(`Skipped (>5MB): ${abs}`); continue; }
  totalBytes += st.size;
  if (totalBytes > MAX_TOTAL_BYTES) die(`Aborting: total input > 50MB after ${abs}`);

  const ext = extname(abs).toLowerCase();
  const rendered = renderFile(abs, ext);
  if (!rendered) { warnings.push(`Skipped (unsupported ${ext}): ${abs}`); continue; }
  fileCounter++;
  rendered.fileId = 'file-' + fileCounter + '-' + slugify(basename(abs, ext));
  renderedFiles.push(rendered);
}
if (renderedFiles.length === 0) die('No supported inputs after filtering.');

log(`Rendering ${renderedFiles.length} file(s) → layout=${cfg.layout}`);
if (warnings.length) log('Warnings:\n' + warnings.map(w => '  - ' + w).join('\n'));

// ---- Search index ----
const searchIndex = [];
for (const f of renderedFiles) {
  for (const s of f.sections) {
    searchIndex.push({
      id: f.fileId + '__' + s.slug,
      file: f.basename,
      heading: s.text,
      body: stripTags(s.body).slice(0, 800),
      tags: Array.from(f.tags),
    });
  }
}

// ---- All tags (sorted, deduped) ----
const allTags = new Set();
for (const f of renderedFiles) for (const t of f.tags) allTags.add(t);
const tagList = Array.from(allTags).sort();

// ---- Assemble per-layout HTML ----
const layout = cfg.layout;
if (!['single', 'sidebar', 'grid'].includes(layout)) die('Unknown layout: ' + layout);

const tpl = readFileSync(join(TEMPLATES, layout + '.html'), 'utf8');
const sharedStyles = readFileSync(join(TEMPLATES, '_shared.css'), 'utf8');
const sharedScript = readFileSync(join(TEMPLATES, '_shared.js'), 'utf8');

const contentHtml = renderedFiles.map(f => renderFileSection(f)).join('\n');
const chipsHtml = tagList.map(t => `<button class="chip" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('') || '<span style="color:var(--fg-faint);font-size:0.8rem;font-family:var(--font-mono);">no tags found</span>';

let filesNavHtml = '';
let tocHtml = '';
if (layout === 'single') {
  tocHtml = renderTocSingle(renderedFiles);
} else if (layout === 'sidebar') {
  filesNavHtml = renderSidebarNav(renderedFiles);
} else if (layout === 'grid') {
  filesNavHtml = renderGridCards(renderedFiles);
}

// Use function-form replace so `$&`, `$1`, etc. in the replacement strings
// are not interpreted as JS replacement patterns.
const subs = {
  '<!--TITLE-->': esc(cfg.title),
  '<!--SHARED_STYLES-->': sharedStyles,
  '<!--SHARED_SCRIPT-->': sharedScript,
  '<!--CHIPS-->': chipsHtml,
  '<!--FILES_NAV-->': filesNavHtml,
  '<!--TOC-->': tocHtml,
  '<!--CONTENT-->': contentHtml,
  '<!--SEARCH_INDEX-->': JSON.stringify(searchIndex),
};
const html = tpl.replace(
  /<!--(TITLE|SHARED_STYLES|SHARED_SCRIPT|CHIPS|FILES_NAV|TOC|CONTENT|SEARCH_INDEX)-->/g,
  (m) => subs[m] != null ? subs[m] : ''
);

writeFileSync(cfg.out, html);
const outBytes = Buffer.byteLength(html, 'utf8');
log(`✓ Wrote ${cfg.out} (${(outBytes / 1024).toFixed(1)} KB)`);
if (outBytes > 10 * 1024 * 1024) log('⚠️  Output > 10 MB — browser parse may stall.');

// ============================================================
// Renderers
// ============================================================

function renderFile(abs, ext) {
  const raw = readFileSync(abs, 'utf8');
  const base = basename(abs);
  const dirTag = basename(dirname(abs)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const baseSlug = slugify(basename(abs, ext));
  const tags = new Set();
  if (dirTag) tags.add(dirTag);

  switch (ext) {
    case '.md':
    case '.markdown': {
      const { meta, body } = stripFrontmatter(raw);
      for (const k of ['tags', 'tag', 'categories', 'category', 'status']) {
        if (meta[k]) {
          if (Array.isArray(meta[k])) meta[k].forEach(v => tags.add(String(v).toLowerCase()));
          else String(meta[k]).split(/[,\s]+/).filter(Boolean).forEach(v => tags.add(v.toLowerCase()));
        }
      }
      const html = globalThis.marked.parse(body, { breaks: false, gfm: true });
      const sections = extractSections(html);
      // Tag from first H1/H2 bracket prefix
      const firstH = body.match(/^#{1,2}\s+\[([A-Za-z0-9-]+)\]/m);
      if (firstH) tags.add(firstH[1].toLowerCase());
      return {
        path: abs, basename: base, slug: baseSlug, title: meta.title || (sections[0] && sections[0].text) || base,
        sections, tags, html,
      };
    }
    case '.html':
    case '.htm': {
      const sanitized = sanitizeHtml(raw);
      const sections = extractSections(sanitized);
      return { path: abs, basename: base, slug: baseSlug, title: (sections[0] && sections[0].text) || base, sections, tags, html: sanitized };
    }
    case '.txt':
    case '.log': {
      const html = `<pre>${escText(raw)}</pre>`;
      const sections = [{ level: 1, text: base, slug: baseSlug + '-content', html, body: raw.slice(0, 2000) }];
      return { path: abs, basename: base, slug: baseSlug, title: base, sections, tags, html };
    }
    case '.json': {
      try {
        const parsed = JSON.parse(raw);
        const pretty = JSON.stringify(parsed, null, 2);
        const highlighted = prismHighlight(pretty, 'json');
        const html = `<pre class="language-json"><code class="language-json">${highlighted}</code></pre>`;
        const sections = [{ level: 1, text: base, slug: baseSlug + '-content', html, body: pretty.slice(0, 2000) }];
        return { path: abs, basename: base, slug: baseSlug, title: base, sections, tags, html };
      } catch (e) {
        warnings.push(`Invalid JSON, rendered as text: ${abs}`);
        const html = `<pre>${escText(raw)}</pre>`;
        const sections = [{ level: 1, text: base, slug: baseSlug + '-content', html, body: raw.slice(0, 2000) }];
        return { path: abs, basename: base, slug: baseSlug, title: base, sections, tags, html };
      }
    }
    case '.yaml':
    case '.yml': {
      const highlighted = prismHighlight(raw, 'yaml');
      const html = `<pre class="language-yaml"><code class="language-yaml">${highlighted}</code></pre>`;
      const sections = [{ level: 1, text: base, slug: baseSlug + '-content', html, body: raw.slice(0, 2000) }];
      return { path: abs, basename: base, slug: baseSlug, title: base, sections, tags, html };
    }
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.webp': {
      const bytes = readFileSync(abs);
      const mime = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.webp': 'webp' }[ext];
      const dataUri = `data:image/${mime};base64,${bytes.toString('base64')}`;
      const html = `<figure><img alt="${esc(base)}" src="${dataUri}"><figcaption>${esc(base)}</figcaption></figure>`;
      const sections = [{ level: 1, text: base, slug: baseSlug + '-content', html, body: '' }];
      return { path: abs, basename: base, slug: baseSlug, title: base, sections, tags, html };
    }
    case '.svg': {
      const svg = raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=/gi, 'data-removed=');
      const html = `<figure>${svg}<figcaption>${esc(base)}</figcaption></figure>`;
      const sections = [{ level: 1, text: base, slug: baseSlug + '-content', html, body: '' }];
      return { path: abs, basename: base, slug: baseSlug, title: base, sections, tags, html };
    }
    case '.pdf':
      return null;
    default:
      return null;
  }
}

function renderFileSection(f) {
  const tagAttr = Array.from(f.tags).join(' ');
  const sectionsHtml = f.sections.map(s => {
    return `<section data-section-id="${esc(f.fileId)}__${esc(s.slug)}" data-tags="${esc(tagAttr)}">${addHeadingIds(s.html, f.fileId)}</section>`;
  }).join('\n');
  // For grid: mark target on selected file
  const gridAttr = ' data-section-target="false"';
  return `<article class="file-section" id="${esc(f.fileId)}"${gridAttr}>
    <div class="file-section-meta">${esc(f.basename)}</div>
    ${sectionsHtml}
  </article>`;
}

function renderTocSingle(files) {
  const items = [];
  for (const f of files) {
    items.push(`<li><a data-file-link="${esc(f.fileId)}" href="#${esc(f.fileId)}" class="toc-h1">${esc(f.title)}</a></li>`);
    for (const s of f.sections) {
      if (s.level < 2 || s.level > 4) continue;
      items.push(`<li><a href="#${esc(f.fileId + '__' + s.slug)}" class="toc-h${s.level}">${esc(s.text)}</a></li>`);
    }
  }
  return '<ol>' + items.join('') + '</ol>';
}

function renderSidebarNav(files) {
  // Group by parent dir
  const groups = new Map();
  for (const f of files) {
    const g = basename(dirname(f.path));
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(f);
  }
  let out = '';
  for (const [g, fs] of groups) {
    out += `<h5>${esc(g)}</h5><ul>`;
    for (const f of fs) {
      out += `<li><a data-file-link="${esc(f.fileId)}" href="#${esc(f.fileId)}">${esc(f.title)}</a></li>`;
    }
    out += '</ul>';
  }
  return out;
}

function renderGridCards(files) {
  return files.map(f => {
    const excerpt = stripTags(f.sections.map(s => s.body).join(' ')).slice(0, 160);
    const tagPills = Array.from(f.tags).slice(0, 4).map(t => `<span class="card-tag">${esc(t)}</span>`).join('');
    return `<a class="card" data-file-link="${esc(f.fileId)}" href="#${esc(f.fileId)}">
      <div class="card-file">${esc(f.basename)}</div>
      <div class="card-title">${esc(f.title)}</div>
      <div class="card-excerpt">${esc(excerpt)}${excerpt.length === 160 ? '…' : ''}</div>
      <div class="card-tags">${tagPills}</div>
    </a>`;
  }).join('');
}

// ============================================================
// Helpers
// ============================================================

function die(msg) { console.error('ERROR: ' + msg); process.exit(1); }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escText(s) { return esc(s); }
function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'section';
}

function stripFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!km) continue;
    let v = km[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    meta[km[1].toLowerCase()] = v;
  }
  return { meta, body: raw.slice(m[0].length) };
}

function sanitizeHtml(s) {
  // Allow-list strip
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:\s*/gi, 'denied:');
}

function extractSections(html) {
  // Walk the HTML by H1-H4. Use a regex split.
  const re = /<(h[1-4])([^>]*)>([\s\S]*?)<\/\1>/gi;
  const sections = [];
  const slugSeen = new Map();
  let lastEnd = 0;
  let pending = null;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (pending) {
      pending.body += html.slice(lastEnd, m.index);
      pending.html = `<${pending.tag}>${escText(pending.text)}</${pending.tag}>` + pending.body;
      sections.push(pending);
    }
    const tag = m[1].toLowerCase();
    const level = parseInt(tag[1], 10);
    const text = stripTags(m[3]);
    let slug = slugify(text);
    const c = slugSeen.get(slug) || 0;
    if (c) slug = slug + '-' + (c + 1);
    slugSeen.set(slugify(text), c + 1);
    pending = { level, text, slug, tag, body: '', html: '' };
    lastEnd = m.index + m[0].length;
  }
  if (pending) {
    pending.body += html.slice(lastEnd);
    pending.html = `<${pending.tag}>${escText(pending.text)}</${pending.tag}>` + pending.body;
    sections.push(pending);
  }
  if (sections.length === 0) {
    sections.push({ level: 1, text: 'Content', slug: 'content', html, body: html });
  }
  return sections;
}

function addHeadingIds(sectionHtml, fileId) {
  // Re-insert id attrs derived from heading text on first H1-H4 we see in this fragment.
  const slugSeen = new Map();
  return sectionHtml.replace(/<(h[1-4])>([\s\S]*?)<\/\1>/gi, (whole, tag, inner) => {
    const text = stripTags(inner);
    let slug = slugify(text);
    const c = slugSeen.get(slug) || 0;
    if (c) slug = slug + '-' + (c + 1);
    slugSeen.set(slugify(text), c + 1);
    return `<${tag} id="${esc(fileId + '__' + slug)}">${inner}</${tag}>`;
  });
}

function prismHighlight(code, lang) {
  if (!globalThis.Prism || !globalThis.Prism.languages[lang]) return escText(code);
  try {
    return globalThis.Prism.highlight(code, globalThis.Prism.languages[lang], lang);
  } catch (e) {
    return escText(code);
  }
}

// ---- Vendor loader ----
async function loadVendor() {
  // marked exposes itself as UMD. We exec it in a tiny shim that simulates a CommonJS env.
  const markedSrc = readFileSync(join(VENDOR, 'marked.min.js'), 'utf8');
  const markedShim = `
    (function(){
      var module = { exports: {} };
      var exports = module.exports;
      ${markedSrc}
      ;return module.exports;
    })()
  `;
  const markedExports = (0, eval)(markedShim);
  globalThis.marked = markedExports;
  // marked v13 ships parse as default; sometimes also as named export
  if (typeof globalThis.marked.parse !== 'function' && typeof globalThis.marked === 'function') {
    const fn = globalThis.marked;
    globalThis.marked = { parse: fn };
  }

  // Prism — needs window-like globals
  globalThis.self = globalThis;
  globalThis.Prism = { manual: true };
  const prismCore = readFileSync(join(VENDOR, 'prism-core.min.js'), 'utf8');
  (0, eval)(prismCore);
  const prismLangs = readFileSync(join(VENDOR, 'prism-langs.min.js'), 'utf8');
  (0, eval)(prismLangs);
}
