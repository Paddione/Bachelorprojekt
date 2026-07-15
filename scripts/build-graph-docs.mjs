#!/usr/bin/env node
/**
 * build-graph-docs.mjs — Mermaid Architecture Page Generator (LAD-3)
 *
 * Reads docs/generated/graph.json + docs/generated/api-map.json
 * and generates docs/diagrams/architecture.md — pure Markdown with fenced
 * ```mermaid diagrams and a Markdown API table. No inline HTML/CSS/JS, no
 * CDN script, no embedded timestamp (byte-deterministic across reruns with
 * unchanged input — required by the plain `freshness:check` FILES diff).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import {
  buildServiceMap,
  buildTopology,
  buildApiTableMarkdown
} from './build-graph-shared.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

function readJson(relPath) {
  const full = join(ROOT, relPath);
  return JSON.parse(readFileSync(full, 'utf8'));
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const graph = readJson('docs/generated/graph.json');
  const apiMap = readJson('docs/generated/api-map.json');

  const serviceMapDiagram = buildServiceMap(graph);
  const topologyDiagram = buildTopology(graph);
  const apiTable = buildApiTableMarkdown(apiMap);

  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  const endpointCount = apiMap.endpoints.length;

  const markdown = `# Architektur — Living Docs

${nodeCount} Services · ${edgeCount} Abhängigkeitskanten · ${endpointCount} API-Endpoints

## Service-Map

\`\`\`mermaid
${serviceMapDiagram}
\`\`\`

## K8s-Topology

\`\`\`mermaid
${topologyDiagram}
\`\`\`

## API-Surface

${apiTable}
`;

  const outDir = join(ROOT, 'docs/diagrams');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'architecture.md');
  writeFileSync(outPath, markdown);
  console.log(`✓ docs/diagrams/architecture.md → ${outPath}`);
  console.log(`  ${nodeCount} nodes, ${edgeCount} edges, ${endpointCount} API endpoints`);
}

main();
