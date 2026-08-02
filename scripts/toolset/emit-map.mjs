// scripts/toolset/emit-map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadRegistry } from './lib/registry.mjs';

const registryPath = process.env.TOOLSET_REGISTRY || path.join(process.cwd(), 'docs', 'agent-guide', 'registry', 'capabilities.yaml');
const mapPath = path.join(process.cwd(), 'docs', 'agent-guide', 'maps', 'toolset-map.md');

const registry = loadRegistry(registryPath);

let md = `# Toolset Map — Fähigkeit & Instanzen\n\n`;
md += `_Generiert aus \`docs/agent-guide/registry/capabilities.yaml\`_\n\n`;

for (const [capName, instances] of Object.entries(registry.capabilities)) {
  md += `## Fähigkeit: \`${capName}\`\n\n`;
  for (const [instKey, instCfg] of Object.entries(instances)) {
    md += `- **\`${instKey}\`**: Status \`${instCfg.state}\``;
    if (instCfg.reason) {
      md += ` — _${instCfg.reason}_`;
    }
    md += `\n`;
  }
  md += `\n`;
}

fs.mkdirSync(path.dirname(mapPath), { recursive: true });
fs.writeFileSync(mapPath, md);
console.log(`Generated map at ${mapPath}`);
