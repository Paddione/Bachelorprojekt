import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CARDS = join(HERE, 'cards');

export function validateCard(html) {
  const problems = [];
  const firstLine = html.split('\n', 1)[0];
  const m = firstLine.match(/^<!--\s*@dsCard\s+group="([^"]*)"\s+name="([^"]*)"\s*-->$/);
  if (!m) {
    problems.push('first line must be `<!-- @dsCard group="..." name="..." -->`');
  } else {
    if (!m[1].trim()) problems.push('@dsCard group is empty');
    if (!m[2].trim()) problems.push('@dsCard name is empty');
  }
  // token region must be present AND filled (proves build ran)
  const tok = html.match(/<!-- tokens:start -->([\s\S]*?)<!-- tokens:end -->/);
  if (!tok) problems.push('missing tokens:start/end region');
  else if (!tok[1].includes('<style')) problems.push('tokens region not injected — run build.mjs');
  // no leftover svg-grid markers without injection
  for (const grid of ['props-grid', 'logos-grid']) {
    const g = html.match(new RegExp(`<!-- ${grid}:start -->([\\s\\S]*?)<!-- ${grid}:end -->`));
    if (g && !g[1].includes('<svg')) problems.push(`${grid} region not injected — run build.mjs`);
  }
  return problems;
}

export function main() {
  if (!existsSync(CARDS)) { console.error('no cards/ directory'); process.exit(1); }
  const files = readdirSync(CARDS).filter((n) => n.endsWith('.html')).sort();
  let bad = 0;
  for (const f of files) {
    const probs = validateCard(readFileSync(join(CARDS, f), 'utf8'));
    if (probs.length) { bad++; console.error(`✗ ${f}:`); probs.forEach((p) => console.error(`   - ${p}`)); }
    else console.log(`✓ ${f}`);
  }
  if (bad) { console.error(`\n${bad} card(s) with problems`); process.exit(1); }
  console.log(`\n${files.length} card(s) OK`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
