#!/usr/bin/env node
/**
 * build-blast-radius.mjs — Blast-Radius-Report (LAD-2)
 *
 * Reads docs/generated/graph.json and generates docs/generated/blast-radius.md
 * with a ranking of services by transitive dependent count (BFS on reverse adjacency).
 *
 * Output: docs/generated/blast-radius.md
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

function main() {
  const graphPath = join(ROOT, 'docs/generated/graph.json');
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));

  const directUpstream = new Map();
  const directDownstream = new Map();

  for (const node of graph.nodes) {
    directUpstream.set(node.id, new Set());
    directDownstream.set(node.id, new Set());
  }

  for (const edge of graph.edges) {
    if (directUpstream.has(edge.to)) directUpstream.get(edge.to).add(edge.from);
    if (directDownstream.has(edge.from)) directDownstream.get(edge.from).add(edge.to);
  }

  function getTransitiveDependents(nodeId) {
    const visited = new Set();
    const queue = [];
    const startDeps = directUpstream.get(nodeId) || new Set();
    for (const dep of startDeps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
      }
    }
    while (queue.length > 0) {
      const current = queue.shift();
      const nextDeps = directUpstream.get(current) || new Set();
      for (const dep of nextDeps) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }
    return visited;
  }

  const ranked = [];
  for (const node of graph.nodes) {
    const transitive = getTransitiveDependents(node.id);
    const direct = directUpstream.get(node.id) || new Set();
    if (transitive.size === 0 && direct.size === 0) continue;
    ranked.push({
      id: node.id,
      type: node.type,
      transitiveCount: transitive.size,
      directCount: direct.size,
      transitiveDeps: transitive,
      directDeps: direct,
    });
  }

  ranked.sort((a, b) => b.transitiveCount - a.transitiveCount || b.directCount - a.directCount);

  const connectedNodes = new Set([...graph.edges.map(e => e.from), ...graph.edges.map(e => e.to)]);
  const isolatedCount = graph.nodes.filter(n => !connectedNodes.has(n.id)).length;

  const generatedAt = new Date().toISOString();
  const lines = [];
  lines.push('# Blast-Radius-Report');
  lines.push(`> Generated: ${generatedAt}`);
  lines.push(`> Nodes: ${graph.nodes.length} | Edges: ${graph.edges.length} | Isolated: ${isolatedCount}`);
  lines.push('');
  lines.push('## Ranking (transitive Abhängige)');
  lines.push('');
  lines.push('| Rang | Service | Direkt abhängig | Transitiv abhängig | In-Degree |');
  lines.push('|------|---------|-----------------|--------------------| ----------|');
  ranked.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${r.id} | ${r.directCount} | ${r.transitiveCount} | ${r.directCount} |`);
  });
  lines.push('');
  lines.push('## Details');
  lines.push('');

  for (const r of ranked) {
    lines.push(`### ${r.id}`);
    lines.push(`**Direkte Abhängige:** ${r.directCount} — ${[...r.directDeps].sort().join(', ') || '—'}`);
    lines.push(`**Transitive Abhängige:** ${r.transitiveCount} — ${[...r.transitiveDeps].sort().join(', ') || '—'}`);
    lines.push(`**Upstream (In-Degree):** ${r.directCount}`);
    lines.push('');
  }

  const content = lines.join('\n');

  function hasStructuralChange(path) {
    try {
      const existing = readFileSync(path, 'utf8');
      const stripTs = (s) => s.replace(/^> Generated: .*/m, '').replace(/^> Nodes:.*/m, '');
      return stripTs(existing) !== stripTs(content);
    } catch { return true; }
  }

  mkdirSync(join(ROOT, 'docs/generated'), { recursive: true });
  const outPath = join(ROOT, 'docs/generated/blast-radius.md');
  if (hasStructuralChange(outPath)) {
    writeFileSync(outPath, content);
    console.log(`✓ blast-radius.md: ${ranked.length} ranked services → ${outPath}`);
  } else {
    console.log(`○ blast-radius.md: no structural change, skipped`);
  }
}

main();
