// scripts/docs-gen/search-client.mjs
// Browser-side full-text search client, extracted from theme.mjs (Phase 1.3).
// This module is the SOLE owner of the search fetch-URL / index-schema coupling.
//   Phase 1.3 — verbatim extraction from theme.mjs SEARCH_JS (search.json).
//   Phase 2.2 — switched to search-index.json with ranked inverted-index lookup.
//
// Import direction: search-client.mjs is a leaf (no project imports).

/**
 * Ctrl/Cmd-K search overlay client.
 * Fetches ./search-index.json (built by build-docs.mjs Phase 2.1), implements
 * ranked term-frequency + title/heading boost, renders <mark>-highlighted snippets,
 * and navigates to the matched heading anchor on click.
 *
 * Leerer Query → top 12 Seiten wie vorher. Ctrl/⌘-K öffnet, Esc schließt.
 *
 * NOTE: search-index.json is only written on a full build. After an incremental
 * rebuildPage run, search-index.json may be stale — a full build fixes this.
 */
export const SEARCH_JS = `
(function(){
  var IDX=null;
  var pageMap={};
  fetch('./search-index.json').then(function(r){return r.json();}).then(function(j){
    IDX=j;
    if(j.pages){j.pages.forEach(function(p){pageMap[p.slug]=p;});}
  }).catch(function(){});

  var overlay=document.getElementById('search-overlay');
  var inp=document.getElementById('search-input');
  var resultsEl=document.getElementById('search-results');
  if(!overlay||!inp||!resultsEl)return;

  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function fold(s){
    return String(s||'').toLowerCase()
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
  }
  function tokens(s){
    return fold(s).replace(/[^\\w\\s-]/g,' ').split(/\\s+/).map(function(t){return t.replace(/^-+|-+$/g,'');}).filter(function(t){return t.length>=2;});
  }

  function open(){overlay.classList.add('active');inp.value='';inp.focus();renderResults('');}
  function close(){overlay.classList.remove('active');}

  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();open();}
    if(e.key==='Escape')close();
  });
  overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
  inp.addEventListener('input',function(){renderResults(inp.value.trim());});
  document.querySelectorAll('.search-trigger').forEach(function(b){b.addEventListener('click',open);});

  function renderResults(q){
    while(resultsEl.firstChild)resultsEl.removeChild(resultsEl.firstChild);
    var hits=scoreQuery(q);
    if(!hits.length){
      var none=document.createElement('p');
      none.className='search-no-results';
      none.textContent='Kein Ergebnis';
      resultsEl.appendChild(none);
      return;
    }
    hits.forEach(function(h){
      var a=document.createElement('a');
      var href='./'+h.outRelPath;
      if(h.headingId)href+='#'+h.headingId;
      a.href=href;
      a.className='search-result-item';
      a.setAttribute('role','option');
      a.addEventListener('click',close);
      var t=document.createElement('span');t.className='search-result-title';
      t.textContent=h.title;
      var ex=document.createElement('span');ex.className='search-result-excerpt';
      if(q&&h.snippet){ex.innerHTML=h.snippet;}else{ex.textContent=h.sectionPath||'';}
      a.appendChild(t);a.appendChild(ex);
      resultsEl.appendChild(a);
    });
  }

  function scoreQuery(q){
    if(!IDX)return[];
    var toks=q?tokens(q):null;
    if(!toks||!toks.length){
      return(IDX.pages||[]).slice(0,12).map(function(p){return Object.assign({},p,{score:0,headingId:null,snippet:''});});
    }
    var scores={};
    toks.forEach(function(tok){
      var postings=(IDX.index&&IDX.index[tok])||[];
      postings.forEach(function(p){
        if(!scores[p.slug])scores[p.slug]={score:0,headingId:null};
        scores[p.slug].score+=p.weight||1;
        if(!scores[p.slug].headingId&&p.headingId)scores[p.slug].headingId=p.headingId;
      });
    });
    return Object.entries(scores)
      .sort(function(a,b){return b[1].score-a[1].score;})
      .slice(0,12)
      .map(function(entry){
        var slug=entry[0];var info=entry[1];
        var page=pageMap[slug]||{slug:slug,title:slug,sectionPath:'',outRelPath:slug+'.html'};
        var snippet='';
        if(q){
          // HTML-escape the title first, then wrap matched tokens in <mark>.
          // Tokens from tokenize() are already alphanumeric/hyphen-only (no regex
          // metacharacters), so joining with | and using in RegExp is safe.
          // Using esc(title) + hardcoded <mark> tags → no XSS via innerHTML.
          var escTitle=esc(page.title);
          var reStr=toks.join('|');
          var marked2=escTitle.replace(new RegExp('('+reStr+')','gi'),'<mark>$1</mark>');
          snippet=marked2!==escTitle?marked2:esc(page.sectionPath||'');
        }
        return Object.assign({},page,{score:info.score,headingId:info.headingId,snippet:snippet});
      });
  }
})();`;
