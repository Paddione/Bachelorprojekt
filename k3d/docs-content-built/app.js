
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
  var PAGE_INDEX=[];
  fetch('./search.json').then(function(r){return r.json()}).then(function(j){PAGE_INDEX=j}).catch(function(){});
  var overlay=document.getElementById('search-overlay');
  var inp=document.getElementById('search-input');
  var resultsEl=document.getElementById('search-results');
  if(!overlay||!inp||!resultsEl)return;
  function open(){overlay.classList.add('active');inp.value='';inp.focus();renderResults('');}
  function close(){overlay.classList.remove('active');}
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();open();}
    if(e.key==='Escape')close();
  });
  overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
  inp.addEventListener('input',function(){renderResults(inp.value.trim().toLowerCase());});
  document.querySelectorAll('.search-trigger').forEach(function(b){
    b.addEventListener('click',open);
  });
  function renderResults(q){
    while(resultsEl.firstChild)resultsEl.removeChild(resultsEl.firstChild);
    var hits=q?PAGE_INDEX.filter(function(p){
      return (p.title||'').toLowerCase().indexOf(q)>-1||(p.excerpt||'').toLowerCase().indexOf(q)>-1;
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
      a.addEventListener('click',close);
      var t=document.createElement('span');t.className='search-result-title';
      t.textContent=p.title;
      var ex=document.createElement('span');ex.className='search-result-excerpt';
      ex.textContent=p.excerpt||'';
      a.appendChild(t);a.appendChild(ex);
      resultsEl.appendChild(a);
    });
  }
})();