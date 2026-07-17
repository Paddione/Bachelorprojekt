// Off-script generator for the mentolder Svelte design system → claude.ai/design layout.
// Run from website root:  node .ds-sync/gen.mjs
import esbuild from 'esbuild';
import { compile as twCompile } from '@tailwindcss/node';
import {
  readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sveltePlugin } from './svelte-plugin.mjs';
import { COMPONENTS } from './components.mjs';
import { reactShim, stampHeader, vendorReact, previewHtmlModule, floorCard, emitReviewPage } from './contract.mjs';

const ROOT = process.cwd();
const NM = join(ROOT, 'node_modules');
const OUT = join(ROOT, 'ds-bundle');
const PREVIEWS = join(ROOT, '.design-sync', 'previews');
const GLOBAL = 'MentolderDS';
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const sha12 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

// ── reset output ──
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, '_vendor'), { recursive: true });
mkdirSync(join(OUT, '_preview'), { recursive: true });
mkdirSync(join(OUT, 'tokens'), { recursive: true });

// ── 1. React-wrapped entry over all Svelte components ──
const importLines = COMPONENTS.map((c, i) => `import C${i} from '../${c.file}';`).join('\n');
const exportLines = COMPONENTS.map((c, i) => `export const ${c.name} = wrap(C${i}, ${JSON.stringify(c.name)});`).join('\n');
const entrySrc = `import React, { useRef, useEffect } from 'react';
import { mount, unmount } from 'svelte';
${importLines}
function wrap(SvelteComp, name) {
  function W(props) {
    const ref = useRef(null);
    useEffect(() => {
      if (!ref.current) return;
      let inst;
      try { inst = mount(SvelteComp, { target: ref.current, props: props || {} }); }
      catch (e) { ref.current.textContent = '⚠ ' + (e && e.message || e); }
      return () => { try { if (inst) unmount(inst); } catch (e) {} };
    }, []);
    return React.createElement('div', { ref, 'data-ds-host': name });
  }
  W.displayName = name;
  return W;
}
${exportLines}
`;
const ENTRY = join(ROOT, '.ds-sync', '.entry.jsx');
writeFileSync(ENTRY, entrySrc);

// ── 2. bundle → IIFE window.MentolderDS (svelte inlined, react shimmed) ──
const bundleJs = join(OUT, '_ds_bundle.js');
const res = await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true, format: 'iife', globalName: GLOBAL, outfile: bundleJs,
  platform: 'browser', target: 'es2020', jsx: 'automatic', metafile: true,
  nodePaths: [NM], plugins: [sveltePlugin(), reactShim],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'warning',
});
const inlinedExternals = [...new Set(Object.keys(res.metafile?.inputs ?? {})
  .map((p) => p.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1])
  .filter((pkg) => pkg && !['react', 'react-dom', 'react-is'].includes(pkg)))].sort();
console.error(`bundle: ${(readFileSync(bundleJs).length / 1024).toFixed(0)} KB; inlined: ${inlinedExternals.join(', ') || '(none)'}`);

// ── 3. Tailwind v4 CSS (theme :root vars + utilities used by in-scope components) → _ds_bundle.css ──
const themeBlock = readFileSync(join(ROOT, '.ds-sync', 'theme-input.css'), 'utf8');
const candidates = new Set();
for (const c of COMPONENTS) {
  const src = readFileSync(join(ROOT, c.file), 'utf8');
  for (const m of src.matchAll(/class(?:Name)?=["'`]([^"'`]+)["'`]/g))
    for (const tok of m[1].split(/\s+/)) if (tok) candidates.add(tok);
  for (const m of src.matchAll(/class:([\w-]+)/g)) candidates.add(m[1]);
}
const tw = await twCompile(themeBlock, { base: ROOT, onDependency() {} });
// Factory tokens (--factory-*) used by the UI primitives (SegmentDots/Stepper/ToggleSwitch),
// minus the duplicate font @import (styles.css already loads it).
const factoryTokens = readFileSync(join(ROOT, 'src', 'styles', 'factory-tokens.css'), 'utf8')
  .replace(/@import url\([^)]*\);?/g, '');
const twCss = tw.build([...candidates]) + '\n\n/* factory-* tokens for UI primitives */\n' + factoryTokens;
writeFileSync(join(OUT, '_ds_bundle.css'), twCss);

// ── 4. styles.css (the import closure designs receive) + tokens ──
writeFileSync(join(OUT, 'tokens', 'theme.css'), twCss);
writeFileSync(join(OUT, 'styles.css'),
  `/* mentolder design tokens + component utilities. */
/* Fonts are self-hosted via src/styles/fonts.css (T001930) */
@import "./_ds_bundle.css";
html,body{margin:0;background:var(--color-ink-900,#0b111c);color:var(--color-fg,#eef1f3);font-family:var(--font-sans,system-ui)}
`);

// ── 5. _vendor/react.js ──
await vendorReact(esbuild, { nodeModules: NM, out: OUT });

// ── 6. per-component: .d.ts / .jsx / .prompt.md / .html + preview compile ──
const COMMON_TYPES = `type Locale = "de" | "en";\n`;
function propsBody(c) {
  const src = readFileSync(join(ROOT, c.file), 'utf8');
  const m = src.match(/interface Props\s*\{([\s\S]*?)\n\s*\}/);
  if (!m) return '  [key: string]: unknown;';
  // strip JSDoc-only lines? keep them — valid TS. Trim trailing.
  return m[1].replace(/\n+$/, '');
}
function extraTypes(c) {
  const src = readFileSync(join(ROOT, c.file), 'utf8');
  let out = '';
  for (const t of ['WhyMePoint', 'FAQItem', 'NavigationLink']) {
    const tm = src.match(new RegExp(`interface ${t}\\s*\\{[\\s\\S]*?\\n\\s*\\}`));
    if (tm) out += tm[0] + '\n';
  }
  return out;
}

const built = [];
for (const c of COMPONENTS) {
  const dir = join(OUT, 'components', c.group, c.name);
  mkdirSync(dir, { recursive: true });
  // .jsx stub
  writeFileSync(join(dir, `${c.name}.jsx`),
    `// Re-export of mentolder-website@${VERSION} ${c.name}. Implementation is in root _ds_bundle.js (window.${GLOBAL}).\n` +
    `import { ${c.name} } from '../../../_ds_bundle.js';\nexport { ${c.name} };\nexport default ${c.name};\n`);
  // .d.ts
  writeFileSync(join(dir, `${c.name}.d.ts`),
    `import * as React from 'react';\n${COMMON_TYPES}${extraTypes(c)}export interface ${c.name}Props {\n${propsBody(c)}\n}\n\nexport declare const ${c.name}: React.ComponentType<${c.name}Props>;\n`);

  // preview?
  const previewTsx = join(PREVIEWS, `${c.name}.tsx`);
  let hasPreview = false, storyNames = [];
  if (existsSync(previewTsx)) {
    try {
      await esbuild.build({
        entryPoints: [previewTsx], bundle: true, format: 'iife', globalName: '__dsPreview',
        outfile: join(OUT, '_preview', `${c.name}.js`), platform: 'browser', target: 'es2020',
        jsx: 'automatic', nodePaths: [NM], plugins: [reactShim],
        footer: { js: ';window.__dsPreview=__dsPreview;' },
        define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'warning',
      });
      hasPreview = true;
      storyNames = [...readFileSync(previewTsx, 'utf8').matchAll(/export const ([A-Z]\w*)/g)].map((m) => m[1]);
    } catch (e) {
      console.error(`! preview build failed: ${c.name}: ${e.message?.split('\n')[0]}`);
    }
  }
  // .prompt.md (first line = element-index summary, never empty)
  const summary = `${c.name} — mentolder ${c.group.toLowerCase()} component (Svelte, brand-styled).`;
  let prompt = `${summary}\n\n## ${c.name}\n\nImport from \`window.${GLOBAL}.${c.name}\`. Props contract in \`${c.name}.d.ts\`.\n`;
  if (storyNames.length) prompt += `\nVariants (see \`${c.name}.html\`): ${storyNames.join(', ')}.\n`;
  writeFileSync(join(dir, `${c.name}.prompt.md`), prompt);
  // .html
  writeFileSync(join(dir, `${c.name}.html`),
    hasPreview ? previewHtmlModule(c.group, c.name, GLOBAL, c.card || {}) : floorCard(c.group, c.name));
  built.push({ ...c, hasPreview, storyNames });
}

// ── 7. header + sidecar + readme + review page ──
stampHeader(bundleJs, { namespace: GLOBAL, components: COMPONENTS, inlinedExternals });

const bundleSha12 = sha12(readFileSync(bundleJs));
const styleSha = sha12(readFileSync(join(OUT, 'styles.css')) + readFileSync(join(OUT, '_ds_bundle.css')));
const renderHashes = {}, sourceKeys = {};
for (const c of built) {
  renderHashes[c.name] = sha12(readFileSync(join(OUT, 'components', c.group, c.name, `${c.name}.html`)));
  sourceKeys[c.name] = sha12(readFileSync(join(ROOT, c.file)) + (c.hasPreview ? readFileSync(join(PREVIEWS, `${c.name}.tsx`)) : ''));
}
writeFileSync(join(OUT, '_ds_sync.json'), JSON.stringify({
  shape: 'package', styleSha, bundleSha12, renderHashes, sourceKeys,
  keyRecipe: 'sha256(svelteSrc+previewTsx).slice(12)', builtBy: 'cc-design-sync', version: VERSION,
}, null, 2));

const header = existsSync(join(ROOT, '.design-sync', 'conventions.md'))
  ? readFileSync(join(ROOT, '.design-sync', 'conventions.md'), 'utf8') + '\n\n' : '';
const index = built.map((c) => `- **${c.name}** (${c.group}) — ${c.hasPreview ? c.storyNames.length + ' preview(s)' : 'floor card'}`).join('\n');
writeFileSync(join(OUT, 'README.md'),
  `${header}# mentolder design system\n\nReact-wrapped Svelte components. Import from \`window.${GLOBAL}\`.\n\n## Components\n\n${index}\n`);

emitReviewPage(OUT, built);

const authored = built.filter((c) => c.hasPreview).length;
console.error(`\nOK: ${built.length} components (${authored} authored previews, ${built.length - authored} floor cards) → ${OUT}`);
