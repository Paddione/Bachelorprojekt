#!/usr/bin/env node
/**
 * build-graph-docs.mjs — Mermaid Architecture Page Generator (LAD-3)
 *
 * Reads docs/generated/graph.json + docs/generated/api-map.json
 * and generates k3d/docs-content-built/architecture/index.html
 *
 * Design: Industrial/Loft (factory-tokens)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import {
  mermaidId,
  esc,
  buildServiceMap,
  buildTopology,
  buildApiTable
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
  const apiTable = buildApiTable(apiMap);

  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  const endpointCount = apiMap.endpoints.length;
  const generatedAt = new Date().toISOString();

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Architektur — Living Docs</title>
  <style>
    :root {
      --ff-bg: #0d0d0d;
      --ff-surface: #1a1a1a;
      --ff-amber: #f59e0b;
      --ff-green: #10b981;
      --ff-red: #ef4444;
      --ff-muted: #6b7280;
      --ff-border: #2a2a2a;
      --ff-purple: #8b5cf6;
    }
    * { box-sizing: border-box; }
    body {
      background: var(--ff-bg);
      color: #e5e7eb;
      font-family: 'JetBrains Mono', ui-monospace, 'Cascadia Code', monospace;
      margin: 0;
      padding: 2rem;
      min-height: 100vh;
    }
    .header {
      display: flex;
      align-items: baseline;
      gap: 1rem;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--ff-border);
      padding-bottom: 1rem;
    }
    h1 {
      color: var(--ff-amber);
      font-size: 13px;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      margin: 0;
    }
    .meta {
      font-size: 11px;
      color: var(--ff-muted);
    }
    .stats {
      display: flex;
      gap: 2rem;
      margin-bottom: 2rem;
    }
    .stat {
      background: var(--ff-surface);
      border: 1px solid var(--ff-border);
      border-radius: 4px;
      padding: 0.75rem 1.25rem;
      text-align: center;
    }
    .stat-value {
      font-size: 24px;
      color: var(--ff-amber);
      display: block;
      font-weight: bold;
    }
    .stat-label {
      font-size: 10px;
      color: var(--ff-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .tabs {
      display: flex;
      gap: 1px;
      border-bottom: 1px solid var(--ff-border);
      margin-bottom: 2rem;
    }
    .tab {
      padding: 0.6rem 1.5rem;
      cursor: pointer;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      background: var(--ff-surface);
      border: none;
      color: var(--ff-muted);
      font-family: inherit;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab:hover { color: #e5e7eb; }
    .tab.active { color: var(--ff-amber); border-bottom-color: var(--ff-amber); }
    .panel { display: none; }
    .panel.active { display: block; }
    .diagram-container {
      background: var(--ff-surface);
      border: 1px solid var(--ff-border);
      border-radius: 4px;
      padding: 1.5rem;
      overflow: auto;
      min-height: 300px;
    }
    .diagram-container .mermaid {
      display: flex;
      justify-content: center;
    }
    .diagram-caption {
      font-size: 11px;
      color: var(--ff-muted);
      margin-top: 0.75rem;
      text-align: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      background: var(--ff-surface);
      color: var(--ff-muted);
      text-align: left;
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid var(--ff-border);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      position: sticky;
      top: 0;
    }
    td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--ff-border);
    }
    tr:hover td { background: var(--ff-surface); }
    code {
      color: var(--ff-amber);
      background: var(--ff-surface);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 11px;
      font-family: inherit;
    }
    .filter-bar {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      align-items: center;
    }
    .filter-input {
      background: var(--ff-surface);
      border: 1px solid var(--ff-border);
      color: #e5e7eb;
      padding: 0.4rem 0.75rem;
      border-radius: 3px;
      font-family: inherit;
      font-size: 12px;
      width: 300px;
    }
    .filter-input:focus {
      outline: none;
      border-color: var(--ff-amber);
    }
    .filter-label {
      font-size: 11px;
      color: var(--ff-muted);
    }
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .badge-admin { background: rgba(239,68,68,0.2); color: var(--ff-red); }
    .badge-auth { background: rgba(245,158,11,0.2); color: var(--ff-amber); }
    .badge-public { background: rgba(16,185,129,0.2); color: var(--ff-green); }
  </style>
</head>
<body>
  <div class="header">
    <h1>⬡ Architektur — Living Docs</h1>
    <span class="meta">Generiert: ${generatedAt}</span>
  </div>

  <div class="stats">
    <div class="stat">
      <span class="stat-value">${nodeCount}</span>
      <span class="stat-label">Services</span>
    </div>
    <div class="stat">
      <span class="stat-value">${edgeCount}</span>
      <span class="stat-label">Abhängigkeiten</span>
    </div>
    <div class="stat">
      <span class="stat-value">${endpointCount}</span>
      <span class="stat-label">API Endpoints</span>
    </div>
  </div>

  <div class="tabs">
    <button class="tab active" onclick="switchTab('service-map')">Service-Map</button>
    <button class="tab" onclick="switchTab('topology')">K8s-Topology</button>
    <button class="tab" onclick="switchTab('api-surface')">API-Surface</button>
  </div>

  <!-- Service-Map Tab -->
  <div id="panel-service-map" class="panel active">
    <div class="diagram-container">
      <div class="mermaid">
${serviceMapDiagram}
      </div>
    </div>
    <p class="diagram-caption">Alle ${nodeCount} K8s-Services und ihre ${edgeCount} Abhängigkeitskanten (env-Refs, initContainer-Waits, Ingress-Backends)</p>
  </div>

  <!-- K8s Topology Tab -->
  <div id="panel-topology" class="panel">
    <div class="diagram-container">
      <div class="mermaid">
${topologyDiagram}
      </div>
    </div>
    <p class="diagram-caption">Namespace-Topologie: workspace (mentolder) | workspace-korczewski (korczewski) | website</p>
  </div>

  <!-- API Surface Tab -->
  <div id="panel-api-surface" class="panel">
    <div class="filter-bar">
      <span class="filter-label">Filter:</span>
      <input class="filter-input" type="text" id="api-filter" placeholder="/api/..." oninput="filterApi(this.value)">
      <span class="filter-label" id="api-count">${endpointCount} endpoints</span>
    </div>
    <div style="max-height:70vh;overflow-y:auto;border:1px solid var(--ff-border);border-radius:4px;">
      ${apiTable}
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js"
          integrity="sha384-R63zfMfSwJF4xCR11wXii+QUsbiBIdiDzDbtxia72oGWfkT7WHJfmD/I/eeHPJyT"
          crossorigin="anonymous"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      themeVariables: {
        background: '#0d0d0d',
        mainBkg: '#1a1a1a',
        primaryColor: '#f59e0b',
        primaryTextColor: '#e5e7eb',
        primaryBorderColor: '#2a2a2a',
        lineColor: '#6b7280',
        secondaryColor: '#1a1a1a',
        tertiaryColor: '#0d0d0d',
        edgeLabelBackground: '#1a1a1a',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      },
      flowchart: {
        curve: 'basis',
        padding: 20,
      },
      securityLevel: 'antiscript',
    });

    function switchTab(tabId) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('panel-' + tabId).classList.add('active');
    }

    function filterApi(query) {
      const rows = document.querySelectorAll('#panel-api-surface tbody tr');
      const q = query.toLowerCase();
      let visible = 0;
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const match = !q || text.includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      document.getElementById('api-count').textContent = visible + ' endpoints';
    }
  </script>
</body>
</html>`;

  function hasStructuralChange(path) {
    try {
      const existing = readFileSync(path, 'utf8');
      const stripTs = (s) => s.replace(/<span class="meta">.*?<\/span>/, '');
      return stripTs(existing) !== stripTs(html);
    } catch { return true; }
  }

  const outDir = join(ROOT, 'k3d/docs-content-built/architecture');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'index.html');
  if (hasStructuralChange(outPath)) {
    writeFileSync(outPath, html);
    console.log(`✓ architecture/index.html → ${outPath}`);
  } else {
    console.log(`○ architecture/index.html: no structural change, skipped`);
  }
  console.log(`  ${nodeCount} nodes, ${edgeCount} edges, ${endpointCount} API endpoints`);
}

main();
