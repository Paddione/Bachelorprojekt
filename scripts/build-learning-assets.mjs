import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TYPES = ['illustration', 'icon', 'diagram', 'motion', 'sfx', 'voice', 'ambient'];
const REGISTERS = ['technical', 'coaching', 'neutral'];
const TONES = ['active', 'calm'];

export function validateManifest(manifest, { exists }) {
  const errs = [];
  const assets = manifest.assets ?? [];
  const seen = new Set();
  for (const [i, a] of assets.entries()) {
    const at = `assets[${i}]${a.id ? ` (${a.id})` : ''}`;
    if (!a.id) errs.push(`${at}: missing id`);
    else if (seen.has(a.id)) errs.push(`${at}: duplicate id`);
    else seen.add(a.id);
    if (!TYPES.includes(a.type)) errs.push(`${at}: invalid type ${JSON.stringify(a.type)}`);
    if (!REGISTERS.includes(a.register)) errs.push(`${at}: invalid register ${JSON.stringify(a.register)}`);
    if (!TONES.includes(a.tone)) errs.push(`${at}: invalid tone ${JSON.stringify(a.tone)}`);
    if (!Array.isArray(a.concept) || a.concept.length === 0) errs.push(`${at}: concept[] required`);
    if (!a.provenance || !a.provenance.license) errs.push(`${at}: provenance.license required`);
    if (!a.formats || Object.keys(a.formats).length === 0) errs.push(`${at}: formats required`);
    for (const [fmt, rel] of Object.entries(a.formats ?? {})) {
      if (!exists(rel)) errs.push(`${at}: file not found for ${fmt}: ${rel}`);
    }
    if (!a.a11y || (!a.a11y.alt && !a.a11y.transcript && !a.a11y.caption)) {
      errs.push(`${at}: a11y needs alt, caption or transcript`);
    }
  }
  if (errs.length) throw new Error('learning-assets manifest invalid:\n  - ' + errs.join('\n  - '));
  return assets;
}

export function sanitizeSvg(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .trim();
}

export function buildGenerated(manifest, { exists, readSvg }) {
  const assets = validateManifest(manifest, { exists }).map((a) => {
    const out = { ...a };
    if (a.formats.svg) out.formats = { ...a.formats, svgInline: sanitizeSvg(readSvg(a.formats.svg)) };
    return out;
  });
  return {
    $schema: 'learning-assets.generated/v1',
    generatedFrom: 'website/src/data/learning-assets.manifest.json',
    assets,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.cwd();
  const publicDir = join(repoRoot, 'website', 'public');
  const rel2abs = (rel) => join(publicDir, rel.replace(/^\//, ''));
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'website', 'src', 'data', 'learning-assets.manifest.json'), 'utf8'));
  const generated = buildGenerated(manifest, { exists: (rel) => existsSync(rel2abs(rel)), readSvg: (rel) => readFileSync(rel2abs(rel), 'utf8') });

  const target = join(repoRoot, 'website', 'src', 'lib', 'learning-assets.generated.json');
  writeFileSync(target, JSON.stringify(generated, null, 2) + '\n');

  const lines = ['# Third-Party Learning Assets', '', '> Auto-generiert aus learning-assets.manifest.json — nicht von Hand editieren.', '', '| ID | Quelle | Lizenz | Attribution |', '|---|---|---|---|'];
  for (const a of generated.assets) lines.push(`| ${a.id} | ${a.provenance.source} | ${a.provenance.license} | ${a.provenance.attribution ?? '—'} |`);
  writeFileSync(join(publicDir, 'learning-assets', 'THIRD-PARTY-ASSETS.md'), lines.join('\n') + '\n');

  console.log(`✓ wrote ${target} (${generated.assets.length} assets)`);
}
