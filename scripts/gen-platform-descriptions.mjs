import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export function buildDescriptions(componentsPath) {
  const components = parse(readFileSync(componentsPath, 'utf8')) ?? [];
  const out = { software: {}, hardware: {} };
  for (const c of components) {
    out[c.kind][c.slug] = { de: c.summary_de, en: c.placeholder_en };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.cwd();
  const out = buildDescriptions(join(repoRoot, 'docs', 'agent-guide', 'registry', 'components.yaml'));
  const target = join(repoRoot, 'website', 'src', 'lib', 'platform-descriptions.generated.json');
  writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  console.log(`✓ wrote ${target}`);
}
