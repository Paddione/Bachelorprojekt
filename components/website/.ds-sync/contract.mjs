// Faithful replication of the design-sync upload contract (header / @dsCard html
// card / vendor React / review page) — see skill lib/{bundle,emit}.mjs. Off-script
// generation per the package-shape SKILL ("produce the layout by whatever means
// the repo allows"); package-validate.mjs remains the oracle for the format.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// react→window.React shim so _ds_bundle.js and the preview cards share ONE React.
export const reactShim = {
  name: 'react-global',
  setup(b) {
    b.onResolve({ filter: /^react(\/(jsx-(dev-)?runtime|compiler-runtime))?$/ }, () => ({ path: 'react-shim', namespace: 'shim' }));
    b.onResolve({ filter: /^react-dom(\/client)?$/ }, () => ({ path: 'react-dom-shim', namespace: 'shim' }));
    b.onLoad({ filter: /^react-shim$/, namespace: 'shim' }, () => ({
      contents: `var R=window.React;
function jsx(t,p,k){return R.createElement(t,k===void 0?p:Object.assign({key:k},p));}
module.exports=R;module.exports.jsx=jsx;module.exports.jsxs=jsx;module.exports.jsxDEV=jsx;module.exports.Fragment=R.Fragment;`,
      loader: 'js',
    }));
    b.onLoad({ filter: /^react-dom-shim$/, namespace: 'shim' }, () => ({
      contents: 'var D=window.ReactDOM,n=function(){};module.exports=Object.assign({preload:n,preinit:n,preconnect:n,prefetchDNS:n,preloadModule:n,preinitModule:n},D);',
      loader: 'js',
    }));
  },
};

// Prepend `/* @ds-bundle: {…} */` first-line header read by the app self-check.
export function stampHeader(bundleJs, { namespace, components, inlinedExternals }) {
  const body = readFileSync(bundleJs, 'utf8');
  const out = dirname(bundleJs);
  const sourceHashes = Object.fromEntries(
    components.flatMap((c) => {
      const base = `components/${c.group}/${c.name}/${c.name}`;
      return ['.jsx', '.d.ts', '.prompt.md']
        .map((ext) => base + ext)
        .filter((rel) => existsSync(join(out, rel)))
        .map((rel) => [rel, createHash('sha256').update(readFileSync(join(out, rel))).digest('hex').slice(0, 12)]);
    }),
  );
  const meta = {
    namespace,
    components: components.map((c) => ({ name: c.name, sourcePath: `components/${c.group}/${c.name}/${c.name}.jsx` })),
    sourceHashes,
    inlinedExternals,
    builtBy: 'cc-design-sync',
  };
  const headerJson = JSON.stringify(meta).replace(/\*\//g, '*\\/');
  writeFileSync(bundleJs, `/* @ds-bundle: ${headerJson} */\n` + body);
}

// React 19 has no UMD — bundle our own IIFE that sets window.React/ReactDOM.
export async function vendorReact(esbuild, { nodeModules, out }) {
  const noClobber =
    ';window.React=window.React||window.__dsReact;window.ReactDOM=window.ReactDOM||window.__dsReactDOM;' +
    'try{delete window.__dsReact;delete window.__dsReactDOM;}catch(e){}';
  await esbuild.build({
    stdin: {
      contents:
        'window.__dsReact=require("react");window.__dsReactDOM=require("react-dom");' +
        'try{Object.assign(window.__dsReactDOM,require("react-dom/client"))}catch(e){}',
      resolveDir: nodeModules,
    },
    bundle: true, format: 'iife', outfile: join(out, '_vendor', 'react.js'),
    platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'error', footer: { js: noClobber }, nodePaths: [nodeModules],
  });
  writeFileSync(join(out, '_vendor', 'react-dom.js'), '/* merged into react.js */');
}

// <Name>.html — renders preview exports from window.__dsPreview (loaded from
// _preview/<Name>.js). Faithful to lib/emit.mjs previewHtmlModule, no provider.
export function previewHtmlModule(group, name, GLOBAL, card = {}) {
  const viewportAttr = card.viewport ? ` viewport="${escapeHtml(card.viewport)}"` : '';
  const mode = card.cardMode === 'single' ? 'single' : card.cardMode === 'column' ? 'column' : 'grid';
  return `<!-- @dsCard group="${escapeHtml(group)}"${viewportAttr} -->
<!doctype html>
<html><head><meta charset="utf-8">
  <link rel="stylesheet" href="../../../styles.css">
  <link rel="stylesheet" href="../../../_ds_bundle.css">
  <style>
    /* mentolder is a dark-brand DS — render cards on the brand ink so light
       component text (--color-fg) is visible. Self-dark components are unaffected. */
    body{margin:0;padding:24px;background:var(--color-ink-900,#0b111c);color:var(--color-fg,#eef1f3)}
    .ds-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;align-items:start}
    .ds-grid.ds-col{grid-template-columns:1fr}
    .ds-cell{border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:12px;min-width:0;overflow:hidden;transform:translateZ(0)}
    .ds-cell>h4{margin:0 0 8px;font:600 12px system-ui;color:#8c96a3;text-transform:uppercase;letter-spacing:.04em}
    .ds-single{transform:translateZ(0)}
  </style>
</head><body>
  <div class="ds-grid" id="g"></div>
  <script src="../../../_vendor/react.js"></script>
  <script src="../../../_vendor/react-dom.js"></script>
  <script src="../../../_ds_bundle.js"></script>
  <script src="../../../_preview/${name}.js"></script>
  <script>
    var h=React.createElement, g=document.getElementById('g');
    var E=[]; for (var k in (window.__dsPreview||{})) { if (typeof window.__dsPreview[k]==='function' && /^[A-Z]/.test(k)) E.push(k); }
    window.__dsCells=E.slice();
    var q=null; try{q=new URLSearchParams(location.search).get('story')}catch(e){}
    var MODE=${JSON.stringify(mode)}; window.__dsMode=MODE;
    var PRIMARY=${JSON.stringify(card.primaryStory ?? '')};
    if(MODE==='column'){g.className+=' ds-col';var cpi=PRIMARY?E.indexOf(PRIMARY):-1;if(cpi>0){E.splice(cpi,1);E.unshift(PRIMARY)}}
    function mount(id,key){try{ReactDOM.createRoot(document.getElementById(id)).render(h(window.__dsPreview[key]))}catch(e){document.getElementById(id).textContent='⚠ '+(e&&e.message||e)}}
    var pick=null;
    if(q){for(var j=0;j<E.length;j++){if(E[j]===q||E[j].toLowerCase()===q.toLowerCase()){pick=E[j];break}}}
    else if(MODE==='single'&&E.length){pick=E.indexOf(PRIMARY)>=0?PRIMARY:E[0]}
    if(q&&!pick){g.textContent='⚠ no export named '+q}
    else if(pick){var s=document.createElement('div');s.className='ds-single';s.id='r0';if(!q)document.body.style.padding='0';g.parentNode.replaceChild(s,g);mount('r0',pick);}
    else {for(var i=0;i<E.length;i++){var cell=document.createElement('section');cell.className='ds-cell';cell.innerHTML='<h4>'+E[i]+'</h4><div id="r'+i+'"></div>';g.appendChild(cell);mount('r'+i,E[i]);}if(E.length===0){g.textContent='⚠ no PascalCase exports in _preview/${name}.js'}}
  </script>
</body></html>
`;
}

// Floor card — honest typographic block for an unauthored component (still fully importable).
export function floorCard(group, name) {
  return `<!-- @dsCard group="${escapeHtml(group)}" -->
<!doctype html>
<html><head><meta charset="utf-8">
  <link rel="stylesheet" href="../../../styles.css">
  <link rel="stylesheet" href="../../../_ds_bundle.css">
  <style>body{margin:0;padding:40px;background:var(--color-ink-900,#0b111c);color:var(--color-fg,#eef1f3);font-family:system-ui}</style>
</head><body data-ds-fallback="1">
  <div style="border:1px dashed rgba(255,255,255,.18);border-radius:10px;padding:28px">
    <div style="font:600 18px system-ui;color:var(--color-fg,#eef1f3)">${escapeHtml(name)}</div>
    <div style="font-size:12px;color:#8c96a3;margin-top:14px;line-height:1.5">Preview not yet authored. The component is fully importable — its API is in <code>${escapeHtml(name)}.d.ts</code> and usage in <code>${escapeHtml(name)}.prompt.md</code>.</div>
  </div>
</body></html>
`;
}

export function emitReviewPage(OUT, components) {
  const rows = components.map((c) =>
    `<h3 style="font:600 13px system-ui;margin:24px 0 6px">${escapeHtml(c.group)} / ${escapeHtml(c.name)}</h3>` +
    `<iframe src="components/${encodeURIComponent(c.group)}/${encodeURIComponent(c.name)}/${encodeURIComponent(c.name)}.html" loading="lazy" style="width:100%;height:360px;border:1px solid #eee;border-radius:8px" title="${escapeHtml(c.name)}"></iframe>`,
  ).join('\n');
  writeFileSync(join(OUT, '.review.html'),
    `<!doctype html><meta charset="utf-8"><title>mentolder DS review</title><body style="margin:0;padding:24px;background:#fafafa;max-width:1200px;margin:auto">${rows}</body>`);
}
