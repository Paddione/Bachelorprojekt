import { SEARCH_JS as _SEARCH_JS } from './search-client.mjs';

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
`;

export function graphJs() {
  return GRAPH_JS;
}

export function clientJs() {
  return [SUBST_JS, COPY_JS, DIAGRAM_JS, SEARCH_JS, CAT_FILTER_JS, GRAPH_JS].join('\n');
}
