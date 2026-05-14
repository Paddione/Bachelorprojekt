import { readFileSync, writeFileSync, mkdirSync, readdirSync,
         existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { marked } from 'marked';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = join(__dirname, '../k3d/docs-content');
export const OUT_DIR = join(__dirname, '../k3d/docs-content-built');

// ─── parseSidebar ─────────────────────────────────────────────────────────────
// Converts _sidebar.md content to an HTML <nav> string.
// activeSlug: the current page slug (e.g. "quickstart-enduser") for active highlight.
export function parseSidebar(md, activeSlug) {
  const lines = md.split('\n');
  let html = '<nav class="sidebar-nav"><ul>\n';
  for (const line of lines) {
    const sectionMatch = line.match(/^-\s+\*\*(.+?)\*\*/);
    const linkMatch = line.match(/^\s+-\s+\[(.+?)\]\((.+?)\)/);
    if (sectionMatch) {
      html += `  <li class="sidebar-section">${sectionMatch[1]}</li>\n`;
    } else if (linkMatch) {
      const [, text, slug] = linkMatch;
      const isActive = slug === activeSlug;
      html += `  <li class="sidebar-item${isActive ? ' active' : ''}">`;
      html += `<a href="./${slug}.html"${isActive ? ' class="active"' : ''}>${text}</a></li>\n`;
    }
  }
  html += '</ul></nav>';
  return html;
}

// ─── rewriteLinks ─────────────────────────────────────────────────────────────
// Converts Docsify hash-routing links (#/slug) to relative .html links.
export function rewriteLinks(html) {
  return html
    .replace(/href="#\/([^"]+)"/g, 'href="./$1.html"')
    .replace(/href="#\/"(?!\w)/g, 'href="./index.html"');
}

// ─── buildToc ─────────────────────────────────────────────────────────────────
// Generates a .toc-box HTML block from a list of h2 heading text strings.
export function buildToc(headings) {
  if (headings.length < 2) return '';
  const items = headings.map((h, i) => {
    const id = slugifyHeading(h);
    return `<li class="toc-item"><a href="#${id}"><span class="toc-num">${i + 1}.</span> ${h}</a></li>`;
  }).join('\n');
  return `<div class="toc-box auto-toc">
  <div class="toc-title">Auf dieser Seite</div>
  <ul class="toc-list">${items}</ul>
</div>`;
}

function slugifyHeading(text) {
  return text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── renderMermaidBlocks ──────────────────────────────────────────────────────
// Finds <pre><code class="language-mermaid">…</code></pre> blocks in HTML,
// pre-renders each to inline SVG via mmdc, wraps in .mermaid-svg-wrapper.
// Falls back to a styled <pre> block if mmdc fails or is missing.
export function renderMermaidBlocks(html, mmdc = join(__dirname, '../node_modules/.bin/mmdc')) {
  const $ = cheerio.load(html, { xmlMode: false });
  $('pre code.language-mermaid').each((_, el) => {
    const src = $(el).text();
    let svg = null;
    if (existsSync(mmdc)) {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mmdc-'));
      const inFile = join(tmpDir, 'diagram.mmd');
      const outFile = join(tmpDir, 'diagram.svg');
      try {
        writeFileSync(inFile, src);
        execFileSync(mmdc, ['-i', inFile, '-o', outFile, '-b', 'transparent', '--quiet'], {
          stdio: ['ignore', 'ignore', 'pipe'],
          timeout: 30000,
        });
        if (existsSync(outFile)) svg = readFileSync(outFile, 'utf8');
      } catch (_err) {
        // fall through to fallback
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
    const replacement = svg
      ? `<div class="mermaid-svg-wrapper">${svg}<span class="mermaid-zoom-hint">Scroll = Zoom · Ziehen = Pan</span></div>`
      : `<pre class="mermaid-fallback"><code>${src}</code></pre>`;
    $(el).parent().replaceWith(replacement);
  });
  return $.html();
}

// ─── postProcess ──────────────────────────────────────────────────────────────
// Runs cheerio DOM post-processing:
//   1. Adds id attributes to h2 elements for TOC anchors
//   2. Injects copy buttons on <pre><code> blocks (not mermaid fallbacks)
//   3. Builds and injects auto-TOC after the first .page-hero or h1
//   4. Rewrites Docsify hash links to relative .html links
export function postProcess(html) {
  const processed = rewriteLinks(html);
  const $ = cheerio.load(processed, { xmlMode: false });

  // Add ids to h2 headings
  $('h2').each((_, el) => {
    const text = $(el).text().trim();
    if (!$(el).attr('id')) $(el).attr('id', slugifyHeading(text));
  });

  // Copy buttons on code blocks (skip mermaid fallbacks)
  $('pre code').each((_, el) => {
    const $pre = $(el).parent();
    if ($pre.hasClass('mermaid-fallback')) return;
    $pre.wrap('<div class="code-wrapper"></div>');
    $pre.after('<button class="copy-btn" aria-label="Copy code">Copy</button>');
  });

  // Auto-TOC from h2 headings
  const headings = $('h2').map((_, el) => $(el).text().trim()).get();
  const toc = buildToc(headings);
  if (toc) {
    const hero = $('.page-hero').first();
    const h1 = $('h1').first();
    if (hero.length) hero.after(toc);
    else if (h1.length) h1.after(toc);
  }

  return $.html();
}

// ─── getPageCss ───────────────────────────────────────────────────────────────
export function getPageCss() {
  return `
:root {
  --dark:#0f1623;--dark-light:#1a2235;--dark-lighter:#1e2d45;
  --dark-border:#2a3a52;--gold:#e8c870;--gold-light:#f0d88a;
  --gold-dim:rgba(232,200,112,0.10);--light:#e8e8f0;--muted:#aabbcc;
  --muted-dark:#8899aa;
  --font-sans:'Inter',system-ui,-apple-system,sans-serif;
  --font-serif:'Merriweather',Georgia,serif;
}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:#111827;color:var(--light);
  font-family:var(--font-sans);font-size:16px;line-height:1.6;height:100%}
#app{display:flex;min-height:100vh}
.sidebar{width:260px;min-width:260px;background:var(--dark);
  border-right:1px solid var(--dark-border);position:sticky;top:0;
  height:100vh;overflow-y:auto;flex-shrink:0;padding:0 0 2em}
#main{flex:1;padding:2em 3em;max-width:900px;overflow-x:hidden}
@media(max-width:768px){#app{flex-direction:column}
  .sidebar{width:100%;min-width:unset;height:auto;position:static}
  #main{padding:1em}}
.sidebar-logo{font-family:var(--font-serif);font-size:1rem;font-weight:700;
  color:var(--gold);padding:1.2em 1.2em 0.8em;border-bottom:1px solid var(--dark-border)}
.sidebar-search{padding:.6em .8em .8em;border-bottom:1px solid var(--dark-border)}
.sidebar-search-btn{width:100%;background:var(--dark-lighter);
  border:1px solid var(--dark-border);border-radius:4px;color:var(--muted-dark);
  padding:.4em .7em;cursor:pointer;font-size:.8rem;display:flex;align-items:center;gap:.5em}
.sidebar-search-btn kbd{margin-left:auto;font-size:.7rem;background:var(--dark);
  border:1px solid var(--dark-border);border-radius:3px;padding:1px 4px;color:var(--muted-dark)}
.sidebar-nav ul{list-style:none;padding:0;margin:0}
.sidebar-section{font-size:.68rem;font-weight:700;letter-spacing:.12em;
  text-transform:uppercase;color:var(--muted-dark);padding:.8em 1.2em .2em;margin-top:.4em}
.sidebar-item a{display:block;font-size:.83rem;color:var(--muted);
  padding:.28em 1.2em;text-decoration:none;transition:color .15s}
.sidebar-item a:hover{color:var(--gold-light)}
.sidebar-item.active a,.sidebar-item a.active{color:var(--gold);font-weight:600;
  border-left:3px solid var(--gold);padding-left:calc(1.2em - 3px)}
h1{font-family:var(--font-serif);font-weight:700;color:var(--gold-light);
  border-bottom:2px solid var(--dark-border);padding-bottom:.4em;margin-top:.5em}
h2{font-family:var(--font-serif);font-weight:400;color:var(--light);
  border-bottom:1px solid var(--gold);padding-bottom:.25em;margin-top:1.8em}
h3{font-family:var(--font-sans);font-weight:600;color:var(--light)}
h4{font-family:var(--font-sans);font-weight:500;color:var(--muted)}
strong{color:var(--light)}
a{color:var(--gold)}
a:hover{color:var(--gold-light)}
table{border-collapse:collapse;width:100%;margin:1em 0}
thead tr{background:var(--dark-lighter)}
thead th{color:var(--gold);font-size:.72rem;font-weight:700;letter-spacing:.08em;
  text-transform:uppercase;border:1px solid var(--dark-border);padding:.6em .9em}
tbody tr:nth-child(odd){background:var(--dark-light)}
tbody tr:nth-child(even){background:var(--dark-lighter)}
tbody tr:hover{background:rgba(232,200,112,.12)}
tbody td{border:1px solid var(--dark-border);padding:.5em .9em;color:var(--light)}
code{background:var(--dark-lighter);color:var(--gold);border:1px solid var(--dark-border);
  border-radius:4px;padding:.15em .4em;font-size:.88em}
pre{background:var(--dark-light);border-left:4px solid var(--gold);
  border-radius:6px;padding:1em 1.2em;overflow-x:auto;margin:1em 0}
pre code{background:transparent;border:none;padding:0;color:var(--light);font-size:.9em}
.code-wrapper{position:relative}
.copy-btn{position:absolute;top:6px;right:8px;background:var(--dark-lighter);
  border:1px solid var(--dark-border);border-radius:3px;padding:2px 8px;font-size:.75rem;
  color:var(--muted);cursor:pointer;transition:color .15s}
.copy-btn:hover{color:var(--gold)}
blockquote{border-left:4px solid var(--gold);background:var(--gold-dim);
  color:var(--muted);padding:.8em 1.2em;border-radius:0 6px 6px 0;margin:1em 0}
blockquote p{margin:0}
hr{border:none;border-top:1px solid var(--dark-border);margin:2em 0}
p{margin:.6em 0 1em}
ul,ol{padding-left:1.5em;margin:.5em 0 1em}
li{margin-bottom:.3em}
.page-hero{background:linear-gradient(135deg,var(--dark-light) 0%,var(--dark) 100%);
  border-left:4px solid var(--gold);border-radius:0 10px 10px 0;
  padding:1.6em 2em;margin:0 0 2em;display:flex;align-items:flex-start;gap:1.2em}
.page-hero-icon{font-size:2.4rem;line-height:1;flex-shrink:0}
.page-hero-body{flex:1}
.page-hero-title{font-family:var(--font-serif);font-size:1.6rem;font-weight:700;
  color:var(--gold-light);margin:0 0 .3em}
.page-hero-desc{color:var(--muted);font-size:.95rem;margin:0 0 .6em;line-height:1.6}
.page-hero-meta{display:flex;flex-wrap:wrap;gap:.4em;margin-top:.5em}
.page-hero-tag{display:inline-block;background:var(--gold-dim);color:var(--gold);
  border:1px solid rgba(232,200,112,.25);border-radius:20px;padding:.15em .7em;
  font-size:.72rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.page-hero-back{display:inline-block;color:var(--muted-dark);font-size:.8rem;margin-bottom:.5em;text-decoration:none}
.page-hero-back:hover{color:var(--gold)}
.toc-box{background:var(--dark-light);border:1px solid var(--dark-border);
  border-top:3px solid var(--gold);border-radius:8px;padding:1.2em 1.5em;margin:2em 0}
.toc-title{font-size:.72rem;font-weight:700;letter-spacing:.12em;
  text-transform:uppercase;color:var(--gold);margin:0 0 .8em}
.toc-list{list-style:none;padding:0;margin:0;
  display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:.3em 1.5em}
.toc-item a{color:var(--muted);text-decoration:none;font-size:.875rem;
  display:flex;align-items:baseline;gap:.4em}
.toc-item a:hover{color:var(--gold-light)}
.toc-num{color:var(--gold);font-size:.75rem;font-weight:600;min-width:1.4em}
.mermaid-svg-wrapper{position:relative;border:1px solid var(--dark-border);
  border-radius:6px;margin:1em 0;background:var(--dark-light);overflow:hidden}
.mermaid-svg-wrapper svg{display:block;width:100%;height:auto;cursor:grab}
.mermaid-svg-wrapper svg:active{cursor:grabbing}
.mermaid-zoom-hint{position:absolute;bottom:6px;right:8px;
  font-size:11px;color:var(--muted-dark);pointer-events:none}
.mermaid-fallback{border-left-color:var(--muted-dark) !important;opacity:.7}
.kicker{font-size:.8rem;font-weight:600;letter-spacing:.06em;
  text-transform:uppercase;color:var(--muted-dark);margin:-.5em 0 1.5em}
.tracks{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));
  gap:1em;margin:1.5em 0}
.track-card{display:flex;flex-direction:column;gap:.3em;background:var(--dark-light);
  border:1px solid var(--dark-border);border-radius:8px;padding:1.2em 1.4em;
  text-decoration:none !important;transition:border-color .15s,transform .15s}
.track-card:hover{border-color:var(--gold);transform:translateY(-2px)}
.track-card .lab{display:inline-block;font-size:.68rem;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;color:var(--gold);
  background:var(--gold-dim);border:1px solid rgba(232,200,112,.25);
  border-radius:20px;padding:.15em .7em;margin-bottom:.3em}
.track-card .ti{font-weight:600;color:var(--light);font-size:1rem}
.track-card .de{font-size:.82rem;color:var(--muted-dark);line-height:1.5}
.track-card .arrow{font-size:.82rem;color:var(--gold);font-weight:600;
  margin-top:auto;padding-top:.5em}
#search-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);
  z-index:1000;align-items:flex-start;justify-content:center;padding-top:10vh}
#search-box{background:var(--dark-lighter);border:1px solid var(--dark-border);
  border-radius:10px;width:min(580px,90vw);max-height:70vh;
  display:flex;flex-direction:column;overflow:hidden}
#search-input{background:transparent;border:none;
  border-bottom:1px solid var(--dark-border);color:var(--light);
  font-size:1rem;padding:1em 1.2em;outline:none}
#search-input::placeholder{color:var(--muted-dark)}
#search-results{overflow-y:auto;padding:.5em 0}
.search-result-item{display:block;padding:.6em 1.2em;text-decoration:none;
  border-bottom:1px solid var(--dark-border);transition:background .1s}
.search-result-item:hover{background:var(--gold-dim)}
.search-result-title{display:block;color:var(--gold);font-size:.9rem;font-weight:600}
.search-result-excerpt{display:block;color:var(--muted-dark);font-size:.8rem;margin-top:.15em}
.search-no-results{color:var(--muted-dark);text-align:center;padding:1.5em;font-size:.9rem}
`;
}

// ─── getPageJs ────────────────────────────────────────────────────────────────
// Returns inlined JS for a page. searchIndex: [{slug,title,excerpt}].
export function getPageJs(searchIndex) {
  const indexJson = JSON.stringify(searchIndex);
  return `
(function(){
  // ── {DOMAIN}/{PROTO} replacement via TreeWalker (text nodes only) ──
  var host=window.location.hostname;
  var domain=host.replace(/^docs\\./,'')||host;
  var proto=window.location.protocol.replace(':','');
  var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null);
  var node;
  while((node=walker.nextNode())){
    var v=node.nodeValue;
    if(v.includes('{DOMAIN}')||v.includes('{PROTO}')){
      node.nodeValue=v.replace(/\\{DOMAIN\\}/g,domain).replace(/\\{PROTO\\}/g,proto);
    }
  }
  document.querySelectorAll('a[href]').forEach(function(a){
    var h=a.getAttribute('href')||'';
    if(h.includes('{DOMAIN}')||h.includes('{PROTO}')){
      a.setAttribute('href',h.replace(/\\{DOMAIN\\}/g,domain).replace(/\\{PROTO\\}/g,proto));
    }
  });

  // ── Copy buttons ──
  document.querySelectorAll('.copy-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var pre=btn.previousElementSibling;
      navigator.clipboard.writeText(pre?pre.textContent:'').then(function(){
        btn.textContent='✓';
        setTimeout(function(){btn.textContent='Copy';},1500);
      });
    });
  });

  // ── SVG panzoom for Mermaid wrappers ──
  document.querySelectorAll('.mermaid-svg-wrapper svg').forEach(function(svg){
    var dx=0,dy=0,scale=1,dragging=false,ox=0,oy=0;
    function upd(){svg.style.transform='translate('+dx+'px,'+dy+'px) scale('+scale+')';}
    svg.style.transformOrigin='0 0';
    svg.addEventListener('wheel',function(e){
      e.preventDefault();
      scale=Math.min(10,Math.max(0.3,scale*(e.deltaY>0?0.9:1.1)));upd();
    },{passive:false});
    svg.addEventListener('pointerdown',function(e){
      dragging=true;ox=e.clientX-dx;oy=e.clientY-dy;
      svg.style.cursor='grabbing';svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove',function(e){
      if(!dragging)return;dx=e.clientX-ox;dy=e.clientY-oy;upd();
    });
    svg.addEventListener('pointerup',function(){dragging=false;svg.style.cursor='grab';});
  });

  // ── Ctrl+K search (safe DOM construction — no innerHTML on untrusted data) ──
  var PAGE_INDEX=${indexJson};
  var overlay=document.getElementById('search-overlay');
  var inp=document.getElementById('search-input');
  var resultsEl=document.getElementById('search-results');
  if(!overlay)return;
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key==='k'){
      e.preventDefault();overlay.style.display='flex';inp.value='';inp.focus();renderResults('');
    }
    if(e.key==='Escape')overlay.style.display='none';
  });
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.style.display='none';});
  inp.addEventListener('input',function(){renderResults(inp.value.trim().toLowerCase());});
  document.querySelector('.sidebar-search-btn')?.addEventListener('click',function(){
    overlay.style.display='flex';inp.value='';inp.focus();renderResults('');
  });
  function renderResults(q){
    while(resultsEl.firstChild)resultsEl.removeChild(resultsEl.firstChild);
    var hits=q?PAGE_INDEX.filter(function(p){
      return p.title.toLowerCase().includes(q)||p.excerpt.toLowerCase().includes(q);
    }):PAGE_INDEX.slice(0,12);
    if(!hits.length){
      var none=document.createElement('p');
      none.className='search-no-results';
      none.textContent='Kein Ergebnis';
      resultsEl.appendChild(none);
      return;
    }
    hits.forEach(function(p){
      var a=document.createElement('a');
      a.href='./'+p.slug+'.html';
      a.className='search-result-item';
      a.addEventListener('click',function(){overlay.style.display='none';});
      var t=document.createElement('span');t.className='search-result-title';
      t.textContent=p.title;
      var ex=document.createElement('span');ex.className='search-result-excerpt';
      ex.textContent=p.excerpt;
      a.appendChild(t);a.appendChild(ex);
      resultsEl.appendChild(a);
    });
  }
})();
`;
}

// ─── buildSearchIndex ─────────────────────────────────────────────────────────
// Builds the search index from a list of {slug, title, rawHtml} objects.
export function buildSearchIndex(pages) {
  return pages.map(({ slug, title, rawHtml }) => {
    const $ = cheerio.load(rawHtml);
    const excerpt = $('p').first().text().trim().slice(0, 120).replace(/\s+/g, ' ');
    return { slug, title, excerpt };
  });
}

// ─── wrapPage ─────────────────────────────────────────────────────────────────
// Assembles a complete standalone HTML page.
export function wrapPage({ slug, title, content, sidebarHtml, searchIndex }) {
  const css = getPageCss();
  const js = getPageJs(searchIndex);
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escHtml(title)} — Workspace MVP</title>
<style>${css}</style>
</head>
<body>
<div id="app">
<aside class="sidebar">
  <div class="sidebar-logo">⬡ Workspace MVP</div>
  <div class="sidebar-search">
    <button class="sidebar-search-btn" aria-label="Suchen (Ctrl+K)">
      🔍 Suchen… <kbd>Ctrl K</kbd>
    </button>
  </div>
  ${sidebarHtml}
</aside>
<main id="main">${content}</main>
</div>
<div id="search-overlay" role="dialog" aria-modal="true" aria-label="Suche">
  <div id="search-box">
    <input id="search-input" type="text" placeholder="Seite suchen…" autocomplete="off" spellcheck="false">
    <div id="search-results"></div>
  </div>
</div>
<script>${js}</script>
</body>
</html>`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}