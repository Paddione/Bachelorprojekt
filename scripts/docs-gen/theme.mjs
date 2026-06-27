// scripts/docs-gen/theme.mjs
// Editorial theme: light, generous whitespace, strong type hierarchy,
// designed pill cross-links. Inter (sans) + Merriweather (serif) — both
// already bundled by the website. Used by templates.mjs (renderPage) and
// written to OUT_DIR/style.css + OUT_DIR/app.js by the build entry.

// Phase 1.3: search client extracted to search-client.mjs (sole fetch-URL owner).
// Phase 1.4: UX CSS split into styles-ux.mjs (navCss/searchCss/a11yCss).
import { SEARCH_JS as _SEARCH_JS } from './search-client.mjs';
import { navCss, searchCss, a11yCss } from './styles-ux.mjs';

/**
 * Full editorial stylesheet for every generated page.
 * @returns {string} CSS source
 */
// ─── graphCss ───────────────────────────────────────────────────────────────
// Styling for the landing graph: domain regions, node hover states (.dim/.hl),
// the pan/zoom container, and the legend. Surfaced through editorialCss().
// Uses the editorial light-theme custom properties declared in editorialCss():root.
// IC-3: the legend is emitted in-SVG as <g class="graph-legend"> with <text>/<circle>
// rows, so it is styled via SVG-valid element selectors (no .lg-item/.lg-dot, no
// position:absolute).
const GRAPH_CSS = `
#docs-graph{position:relative;overflow:hidden;border:1px solid var(--line);
  border-radius:10px;background:var(--paper-2);margin:0 0 2em;touch-action:none;
  cursor:grab;min-height:60vh}
#docs-graph svg{display:block;width:100%;height:auto}
.graph-region-bg{transition:fill-opacity .12s}
.graph-region-label{font-size:13px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;pointer-events:none}
.graph-edge{stroke:var(--line);stroke-width:1.2;opacity:.7}
[data-node]{cursor:pointer;transition:opacity .12s}
[data-node] circle{transition:stroke .12s,stroke-width .12s}
/* Labels are hidden by default (121 nodes would otherwise overlap into an
   illegible smear) and revealed for the hovered node + its neighbours. */
[data-node] text{fill:var(--ink-soft);font-size:12px;pointer-events:none;
  opacity:0;transition:opacity .12s}
[data-node].dim{opacity:.18}
[data-node].hl circle{stroke:var(--accent);stroke-width:2.5}
[data-node].hl text{fill:var(--accent);font-weight:700;opacity:1}
.graph-legend text{fill:var(--ink-mute);font-size:12px}
.graph-legend-title{fill:var(--ink-soft);font-weight:700}
.graph-legend circle{stroke:var(--line);stroke-width:1}
`;

export function graphCss() {
  return GRAPH_CSS;
}

export function editorialCss() {
  return `
:root {
  --paper:#0b111c;--paper-2:#101826;--paper-3:#161f30;
  --ink:#eef1f3;--ink-soft:#c2ccd9;--ink-mute:#8b97a8;
  --line:#243044;--line-soft:#1b2433;
  --accent:#e8c870;--accent-soft:#f0d98f;--accent-bg:rgba(232,200,112,0.10);
  --accent-line:rgba(232,200,112,0.32);
  --repo-bg:#11241a;--repo-fg:#5fd29a;--repo-line:#1f4030;
  --plugin-bg:#1c1733;--plugin-fg:#b39cf0;--plugin-line:#332a52;
  --warn-bg:#2a1f10;--warn-fg:#e8b366;--warn-line:#4a371c;
  --code-bg:#0e1622;--code-ink:#e6ebf2;
  --font-sans:'Geist',system-ui,-apple-system,'Segoe UI',sans-serif;
  --font-serif:'Instrument Serif',Georgia,'Times New Roman',serif;
  --maxw:760px;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper-2);color:var(--ink);
  font-family:var(--font-sans);font-size:17px;line-height:1.7;
  -webkit-font-smoothing:antialiased}
.page,#app,#main{max-width:var(--maxw);margin:0 auto;padding:2.5rem 1.5rem 5rem;
  background:var(--paper)}
/* #app is the outer wrapper, #main the inner column — only #main carries the
   column padding/card frame so the two don't double-pad. */
#app{max-width:none;padding:0;background:var(--paper-2)}
@media(min-width:820px){.page,#main{margin:2rem auto;border:1px solid var(--line);
  border-radius:12px;box-shadow:0 1px 3px rgba(27,35,48,0.05);padding:3rem 3.25rem 5rem}}

/* ── breadcrumbs ── */
.breadcrumbs{font-size:.8rem;color:var(--ink-mute);margin:0 0 1.4rem;
  display:flex;flex-wrap:wrap;align-items:center;gap:.4rem}
.breadcrumbs a{color:var(--ink-mute);text-decoration:none}
.breadcrumbs a:hover{color:var(--accent)}
.breadcrumbs .sep{color:var(--line)}

/* ── page header ── */
.page-header{margin:0 0 2.2rem;padding-bottom:1.4rem;border-bottom:1px solid var(--line)}
.page-header h1{font-family:var(--font-serif);font-weight:900;font-size:2.1rem;
  line-height:1.2;color:var(--ink);margin:.2rem 0 .6rem;letter-spacing:-0.01em}
.page-desc{font-size:1.05rem;line-height:1.6;color:var(--ink-soft);margin:.4rem 0 0;
  max-width:62ch}
.page-meta{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:1rem 0 0}

/* ── provenance badges ── */
.provenance-badge{display:inline-flex;align-items:center;gap:.35em;
  font-size:.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;
  border-radius:999px;padding:.22em .7em;border:1px solid transparent;font-family:var(--font-sans)}
.provenance-badge.repo{background:var(--repo-bg);color:var(--repo-fg);border-color:var(--repo-line)}
.provenance-badge.plugin{background:var(--plugin-bg);color:var(--plugin-fg);border-color:var(--plugin-line)}
.provenance-badge .pv-ver{font-weight:500;text-transform:none;opacity:.85;letter-spacing:0}

/* ── domain tag ── */
.domain-tag{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--accent);background:var(--accent-bg);
  border:1px solid var(--accent-line);border-radius:999px;padding:.2em .7em}

/* ── body type ──
   Selectors match BOTH .content (legacy) and .doc-body (the class
   templates.mjs#renderPage actually emits around rendered markdown). */
.content,.doc-body{font-size:1.02rem}
.content h2,.doc-body h2{font-family:var(--font-serif);font-weight:700;font-size:1.5rem;color:var(--ink);
  margin:2.6rem 0 .8rem;padding-bottom:.3rem;border-bottom:1px solid var(--line-soft);
  scroll-margin-top:1.5rem}
.content h3,.doc-body h3{font-family:var(--font-sans);font-weight:700;font-size:1.18rem;color:var(--ink);
  margin:1.9rem 0 .5rem}
.content h4,.doc-body h4{font-family:var(--font-sans);font-weight:600;font-size:1.02rem;color:var(--ink-soft);
  margin:1.4rem 0 .4rem}
.content p,.doc-body p{margin:.8rem 0 1.1rem;color:var(--ink-soft)}
.content strong,.doc-body strong{color:var(--ink);font-weight:600}
.content a,.doc-body a{color:var(--accent);text-decoration:none;border-bottom:1px solid var(--accent-line)}
.content a:hover,.doc-body a:hover{color:var(--accent-soft);border-bottom-color:var(--accent-soft)}
.content ul,.content ol,.doc-body ul,.doc-body ol{padding-left:1.4rem;margin:.6rem 0 1.2rem;color:var(--ink-soft)}
.content li,.doc-body li{margin-bottom:.4rem}
.content blockquote,.doc-body blockquote{border-left:3px solid var(--accent-line);background:var(--accent-bg);
  color:var(--ink-soft);padding:.7em 1.1em;border-radius:0 6px 6px 0;margin:1.2rem 0}
.content blockquote p,.doc-body blockquote p{margin:0}
.content hr,.doc-body hr{border:none;border-top:1px solid var(--line);margin:2.4rem 0}
.content img,.doc-body img{max-width:100%;height:auto;border-radius:6px}
.content table,.doc-body table{border-collapse:collapse;width:100%;margin:1.2rem 0;font-size:.92rem}
.content thead th,.doc-body thead th{text-align:left;font-size:.7rem;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:var(--ink-mute);background:var(--paper-3);
  border:1px solid var(--line);padding:.55em .85em}
.content tbody td,.doc-body tbody td{border:1px solid var(--line);padding:.5em .85em;color:var(--ink-soft);
  vertical-align:top}
.content tbody tr:nth-child(even),.doc-body tbody tr:nth-child(even){background:var(--paper-2)}

/* ── code blocks + copy ── */
.content code,.doc-body code{background:var(--code-bg);color:var(--code-ink);border:1px solid var(--line);
  border-radius:4px;padding:.12em .4em;font-size:.86em;
  font-family:'SFMono-Regular',ui-monospace,'Cascadia Code',Consolas,monospace}
.content pre,.doc-body pre{background:var(--code-bg);border:1px solid var(--line);border-radius:8px;
  padding:1em 1.1em;overflow-x:auto;margin:1.2rem 0}
.content pre code,.doc-body pre code{background:transparent;border:none;padding:0;color:var(--code-ink);font-size:.85em}
.code-wrapper{position:relative}
.copy-btn{position:absolute;top:8px;right:8px;background:var(--paper);
  border:1px solid var(--line);border-radius:5px;padding:3px 10px;font-size:.72rem;
  font-weight:600;color:var(--ink-mute);cursor:pointer;transition:all .15s}
.copy-btn:hover{color:var(--accent);border-color:var(--accent-line)}

/* ── table of contents ── */
.toc-box{background:var(--paper-2);border:1px solid var(--line);border-radius:8px;
  padding:1.1em 1.4em;margin:1.8rem 0 2.2rem}
.toc-title{font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-mute);margin:0 0 .7em}
.toc-list{list-style:none;padding:0;margin:0;
  display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.25em 1.4em}
.toc-item a{color:var(--ink-soft);text-decoration:none;font-size:.88rem;border:none;
  display:flex;align-items:baseline;gap:.45em}
.toc-item a:hover{color:var(--accent)}
.toc-num{color:var(--accent);font-size:.75rem;font-weight:700;min-width:1.4em}

/* ── designed cross-link pills ── */
.xref{display:inline-flex;align-items:center;gap:.3em;font-size:.92em;font-weight:600;
  color:var(--accent);background:var(--accent-bg);border:1px solid var(--accent-line);
  border-radius:999px;padding:.05em .65em;text-decoration:none;line-height:1.5;
  transition:all .15s}
.xref::before{content:"\\2192";font-weight:700;opacity:.7}
.xref:hover{background:var(--accent);color:var(--paper);border-color:var(--accent)}
.xref.unresolved{color:var(--ink-mute);background:var(--paper-3);border-color:var(--line);
  border-style:dashed;cursor:default}
.xref.unresolved::before{content:"?"}

/* ── section index card grid ── */
.section-intro{color:var(--ink-soft);margin:.4rem 0 2rem;max-width:62ch}
.section-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));
  gap:1.1rem;margin:1.5rem 0}
.section-card{display:flex;flex-direction:column;gap:.5rem;background:var(--paper);
  border:1px solid var(--line);border-radius:10px;padding:1.2rem 1.3rem;
  text-decoration:none;color:inherit;transition:border-color .15s,transform .15s,box-shadow .15s}
.section-card:hover{border-color:var(--accent-line);transform:translateY(-2px);
  box-shadow:0 4px 14px rgba(27,35,48,0.08)}
.section-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem}
.section-card-title{font-family:var(--font-serif);font-weight:700;font-size:1.08rem;color:var(--ink)}
.section-card-desc{font-size:.88rem;color:var(--ink-mute);line-height:1.55;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

/* ── diagrams ── */
.diagram-figure{margin:1.4rem 0}
.diagram-figure .diagram-svg-wrapper,.diagram-figure .diagram-fallback{margin:0}
.diagram-caption{margin:.55rem 0 0;font-size:.82rem;line-height:1.5;color:var(--ink-mute);
  font-style:italic;text-align:center}
.diagram-caption::before{content:"Abbildung: ";font-style:normal;font-weight:700;
  color:var(--ink-soft)}
.diagram-svg-wrapper{position:relative;border:1px solid var(--line);border-radius:8px;
  margin:1.4rem 0;background:var(--paper-2);overflow:hidden}
.diagram-svg-wrapper svg{display:block;width:100%;height:auto;cursor:grab;
  transform-origin:0 0}
.diagram-svg-wrapper svg:active{cursor:grabbing}
.diagram-zoom-hint{position:absolute;bottom:6px;right:8px;font-size:11px;
  color:var(--ink-mute);background:rgba(255,255,255,.75);border-radius:4px;
  padding:1px 6px;pointer-events:none}
.diagram-fallback{position:relative;border:1px dashed var(--warn-line) !important;
  background:var(--warn-bg) !important}
.diagram-fallback::before{content:"Diagramm-Renderer fehlt — Quelltext";
  display:block;font-size:.7rem;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:var(--warn-fg);margin:0 0 .6em}

/* ── Ctrl/Cmd-K search overlay ── */
#search-overlay{display:none;position:fixed;inset:0;background:rgba(27,35,48,.45);
  z-index:1000;align-items:flex-start;justify-content:center;padding-top:12vh}
#search-overlay.active{display:flex}
#search-box{background:var(--paper);border:1px solid var(--line);border-radius:12px;
  width:min(600px,92vw);max-height:70vh;display:flex;flex-direction:column;
  overflow:hidden;box-shadow:0 16px 48px rgba(27,35,48,.25)}
#search-input{background:transparent;border:none;border-bottom:1px solid var(--line);
  color:var(--ink);font-size:1.05rem;padding:1em 1.2em;outline:none;font-family:var(--font-sans)}
#search-input::placeholder{color:var(--ink-mute)}
#search-results{overflow-y:auto;padding:.4em 0}
.search-result-item{display:block;padding:.65em 1.2em;text-decoration:none;
  border-bottom:1px solid var(--line-soft);transition:background .1s}
.search-result-item:last-child{border-bottom:none}
.search-result-item:hover{background:var(--accent-bg)}
.search-result-title{display:block;color:var(--accent);font-size:.95rem;font-weight:600}
.search-result-excerpt{display:block;color:var(--ink-mute);font-size:.82rem;margin-top:.15em}
.search-no-results{color:var(--ink-mute);text-align:center;padding:1.6em;font-size:.92rem}
.search-trigger{display:inline-flex;align-items:center;gap:.5em;background:var(--paper-2);
  border:1px solid var(--line);border-radius:8px;color:var(--ink-mute);
  padding:.4em .8em;cursor:pointer;font-size:.85rem;font-family:var(--font-sans)}
.search-trigger kbd{font-size:.72rem;background:var(--paper);border:1px solid var(--line);
  border-radius:4px;padding:1px 6px;color:var(--ink-mute)}

/* ── misc emitted hooks (header body, breadcrumb current, landing extras) ── */
.page-header-body{display:block}
.crumb-current{color:var(--ink);font-weight:600}
.landing-hero{text-align:left}
.landing-tracks{margin-top:1.8rem}
.kicker{font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  color:var(--accent);margin:0 0 .3rem}
.count-badge{display:inline-block;font-size:.78rem;font-weight:700;color:var(--accent);
  background:var(--accent-bg);border:1px solid var(--accent-line);border-radius:999px;
  padding:.05em .55em;vertical-align:middle;margin-left:.35em}
.arrow{font-size:.85rem;font-weight:600;color:var(--accent);margin-top:.2rem}

/* ── related links footer ── */
.related-footer{margin-top:3rem;padding-top:1.6rem;border-top:1px solid var(--line)}
.related-title{font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-mute);margin:0 0 .9em}
.related-list{display:flex;flex-wrap:wrap;gap:.6rem;list-style:none;padding:0;margin:0}

/* ── site header & footer ── */
.site-header{position:sticky;top:0;z-index:5;display:flex;align-items:center;
  gap:.6rem;padding:.7rem 1.2rem;background:var(--paper);
  border-bottom:1px solid var(--line)}
.site-header-brand{display:inline-flex;align-items:center;gap:.5rem;
  text-decoration:none;color:var(--ink);font-family:var(--font-sans);font-weight:700}
.site-mark{color:var(--accent);font-size:1.1rem}
.site-wordmark{letter-spacing:.02em}
.site-footer{max-width:var(--maxw);margin:0 auto;padding:2rem 1.5rem 3rem;
  color:var(--ink-mute);font-size:.85rem;font-family:var(--font-sans);
  border-top:1px solid var(--line)}

/* ── hub landing tiles ── */
.hub-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:1.5rem 0 2.2rem}
@media(max-width:600px){.hub-tiles{grid-template-columns:1fr}}
.hub-tile{display:flex;flex-direction:column;align-items:flex-start;background:var(--paper);
  border:1px solid var(--line);border-radius:10px;padding:1.3rem 1.4rem;
  text-decoration:none;color:inherit;transition:border-color .15s,transform .15s}
.hub-tile:hover{border-color:var(--accent-line);transform:translateY(-2px)}
.hub-tile-count{font-family:var(--font-serif);font-size:2rem;font-weight:900;
  color:var(--accent);line-height:1;margin:.15rem 0 .25rem}
.hub-tile-label{font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-mute)}
.hub-tile-name{font-size:1rem;font-weight:600;color:var(--ink);margin-top:.2rem}

.hub-section{margin:2.5rem 0}
.hub-section-title{font-family:var(--font-serif);font-size:1.4rem;font-weight:700;
  color:var(--ink);display:flex;align-items:baseline;gap:.8rem;margin:0 0 .8rem;
  padding-bottom:.5rem;border-bottom:1px solid var(--line)}
.hub-section-title .arrow{font-family:var(--font-sans);font-size:.85rem;font-weight:600;
  color:var(--accent);text-decoration:none;margin-left:auto}
.hub-section-title .arrow:hover{color:var(--accent-soft)}

/* ── skill star (repo-eigene Skills) ── */
.skill-star{color:var(--repo-fg);font-size:.8em;margin-right:.2em}
.section-card.skill-repo{border-left:2px solid var(--repo-line)}

/* ── category filter strip (skills.html) ── */
.cat-filter-row{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.2rem 0 1.8rem}
.cat-filter-btn{background:var(--paper-2);border:1px solid var(--line);border-radius:999px;
  padding:.3em .9em;font-size:.78rem;font-weight:600;color:var(--ink-mute);
  cursor:pointer;transition:all .15s;font-family:var(--font-sans)}
.cat-filter-btn:hover{border-color:var(--accent-line);color:var(--accent)}
.cat-filter-btn.active{background:var(--accent-bg);border-color:var(--accent-line);
  color:var(--accent)}

/* ── agent group + doc group headers ── */
.agent-group-header,.doc-group-header{font-size:.72rem;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-mute);margin:2rem 0 .8rem;
  padding-bottom:.4rem;border-bottom:1px solid var(--line-soft)}
.agent-group-header:first-child,.doc-group-header:first-child{margin-top:.5rem}

${GRAPH_CSS}
${navCss()}${searchCss()}${a11yCss()}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Composable client JS pieces. Each is a self-contained IIFE so they can be
// concatenated in any order; Plan 2 appends graphJs() the same way.
// ───────────────────────────────────────────────────────────────────────────

/** {DOMAIN}/{PROTO} runtime text + href substitution. */
export const SUBST_JS = `
(function(){
  var host=window.location.hostname;
  var domain=host.replace(/^docs\\./,'')||host;
  var proto=window.location.protocol.replace(':','');
  var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null);
  var node;
  while((node=walker.nextNode())){
    var v=node.nodeValue;
    if(v.indexOf('{DOMAIN}')>-1||v.indexOf('{PROTO}')>-1){
      node.nodeValue=v.replace(/\\{DOMAIN\\}/g,domain).replace(/\\{PROTO\\}/g,proto);
    }
  }
  document.querySelectorAll('a[href]').forEach(function(a){
    var h=a.getAttribute('href')||'';
    if(h.indexOf('{DOMAIN}')>-1||h.indexOf('{PROTO}')>-1){
      a.setAttribute('href',h.replace(/\\{DOMAIN\\}/g,domain).replace(/\\{PROTO\\}/g,proto));
    }
  });
})();`;

/** Copy-to-clipboard buttons inside .code-wrapper. */
export const COPY_JS = `
(function(){
  document.querySelectorAll('.copy-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var pre=btn.previousElementSibling;
      navigator.clipboard.writeText(pre?pre.textContent:'').then(function(){
        var prev=btn.textContent;
        btn.textContent='\\u2713';
        setTimeout(function(){btn.textContent=prev||'Copy';},1500);
      });
    });
  });
})();`;

/** Pan + zoom for rendered diagram SVGs. */
export const DIAGRAM_JS = `
(function(){
  document.querySelectorAll('.diagram-svg-wrapper svg').forEach(function(svg){
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
})();`;

// SEARCH_JS is defined in search-client.mjs (the sole owner of the fetch-URL
// and index-schema). Re-exported here for backward compatibility with callers
// (including theme.test.mjs) that import SEARCH_JS from theme.mjs.
export const SEARCH_JS = _SEARCH_JS;

/** Category filter for skills.html — toggles .section-card visibility by data-category. */
export const CAT_FILTER_JS = `
(function(){
  var btns=document.querySelectorAll('.cat-filter-btn');
  if(!btns.length)return;
  btns.forEach(function(btn){
    btn.addEventListener('click',function(){
      var cat=btn.getAttribute('data-cat');
      btns.forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      document.querySelectorAll('.section-card[data-category]').forEach(function(card){
        card.style.display=(cat==='all'||card.getAttribute('data-category')===cat)?'':'none';
      });
    });
  });
})();`;

/**
 * Compose the full client script from the named pieces.
 * @returns {string} client JS source
 */
// ─── graphJs ────────────────────────────────────────────────────────────────
// Client interactivity for the landing graph SVG. Reuses the diagram pan/zoom
// approach (wheel clamp 0.3..10, pointer drag with setPointerCapture) and adds
// neighbor hover-highlight via data-neighbors. Binds to the #docs-graph container
// (IC-2) which wraps the <svg class="graph-svg"> (IC-1).
const GRAPH_JS = `
(function(){
  var container=document.getElementById('docs-graph');
  if(!container)return;
  var svg=container.querySelector('svg');
  if(!svg)return;

  // ── hover-highlight neighbors ──
  var nodes=Array.prototype.slice.call(container.querySelectorAll('[data-node]'));
  function clearHl(){
    nodes.forEach(function(n){n.classList.remove('dim');n.classList.remove('hl');});
  }
  function highlight(active){
    var raw=active.getAttribute('data-neighbors')||'';
    var keep={};
    keep[active.getAttribute('data-node')]=true;
    raw.split(/[ ,]+/).forEach(function(id){if(id)keep[id]=true;});
    nodes.forEach(function(n){
      var id=n.getAttribute('data-node');
      if(keep[id]){n.classList.add('hl');n.classList.remove('dim');}
      else{n.classList.add('dim');n.classList.remove('hl');}
    });
  }
  nodes.forEach(function(n){
    n.addEventListener('pointerover',function(){highlight(n);});
    n.addEventListener('pointerout',clearHl);
    n.addEventListener('focus',function(){highlight(n);});
    n.addEventListener('blur',clearHl);
  });
  // background click / pointer leave clears the highlight (the <a> handles nav)
  container.addEventListener('pointerleave',clearHl);
  svg.addEventListener('click',function(e){
    if(!e.target.closest('[data-node]'))clearHl();
  });

  // ── zoom / pan (same model as diagram wrappers) ──
  var dx=0,dy=0,scale=1,dragging=false,ox=0,oy=0;
  svg.style.transformOrigin='0 0';
  function upd(){svg.style.transform='translate('+dx+'px,'+dy+'px) scale('+scale+')';}
  container.addEventListener('wheel',function(e){
    e.preventDefault();
    scale=Math.min(10,Math.max(0.3,scale*(e.deltaY>0?0.9:1.1)));upd();
  },{passive:false});
  container.addEventListener('pointerdown',function(e){
    if(e.target.closest('[data-node]'))return; // let node clicks navigate
    dragging=true;ox=e.clientX-dx;oy=e.clientY-dy;
    container.style.cursor='grabbing';container.setPointerCapture(e.pointerId);
  });
  container.addEventListener('pointermove',function(e){
    if(!dragging)return;dx=e.clientX-ox;dy=e.clientY-oy;upd();
  });
  container.addEventListener('pointerup',function(){dragging=false;container.style.cursor='grab';});
})();
`;

export function graphJs() {
  return GRAPH_JS;
}

export function clientJs() {
  return [SUBST_JS, COPY_JS, DIAGRAM_JS, SEARCH_JS, CAT_FILTER_JS, GRAPH_JS].join('\n');
}
