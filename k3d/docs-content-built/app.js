
(function(){
  var host=window.location.hostname;
  var domain=host.replace(/^docs\./,'')||host;
  var proto=window.location.protocol.replace(':','');
  var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null);
  var node;
  while((node=walker.nextNode())){
    var v=node.nodeValue;
    if(v.indexOf('{DOMAIN}')>-1||v.indexOf('{PROTO}')>-1){
      node.nodeValue=v.replace(/\{DOMAIN\}/g,domain).replace(/\{PROTO\}/g,proto);
    }
  }
  document.querySelectorAll('a[href]').forEach(function(a){
    var h=a.getAttribute('href')||'';
    if(h.indexOf('{DOMAIN}')>-1||h.indexOf('{PROTO}')>-1){
      a.setAttribute('href',h.replace(/\{DOMAIN\}/g,domain).replace(/\{PROTO\}/g,proto));
    }
  });
})();

(function(){
  document.querySelectorAll('.copy-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var pre=btn.previousElementSibling;
      navigator.clipboard.writeText(pre?pre.textContent:'').then(function(){
        var prev=btn.textContent;
        btn.textContent='\u2713';
        setTimeout(function(){btn.textContent=prev||'Copy';},1500);
      });
    });
  });
})();

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
})();

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
    return fold(s).replace(/[^\w\s-]/g,' ').split(/\s+/).map(function(t){return t.replace(/^-+|-+$/g,'');}).filter(function(t){return t.length>=2;});
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
})();

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
})();

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
  container.addEventListener('pointerleave',clearHl);
  svg.addEventListener('click',function(e){
    if(!e.target.closest('[data-node]'))clearHl();
  });

  // ── zoom / pan ──
  var dx=0,dy=0,scale=1,dragging=false,ox=0,oy=0;
  svg.style.transformOrigin='0 0';
  function upd(){svg.style.transform='translate('+dx+'px,'+dy+'px) scale('+scale+')';}
  container.addEventListener('wheel',function(e){
    e.preventDefault();
    scale=Math.min(10,Math.max(0.3,scale*(e.deltaY>0?0.9:1.1)));upd();
  },{passive:false});
  container.addEventListener('pointerdown',function(e){
    if(e.target.closest('[data-node]'))return;
    dragging=true;ox=e.clientX-dx;oy=e.clientY-dy;
    container.style.cursor='grabbing';container.setPointerCapture(e.pointerId);
  });
  container.addEventListener('pointermove',function(e){
    if(!dragging)return;dx=e.clientX-ox;dy=e.clientY-oy;upd();
  });
  container.addEventListener('pointerup',function(){dragging=false;container.style.cursor='grab';});
})();
