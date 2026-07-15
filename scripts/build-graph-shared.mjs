import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

export const KNOWN_SERVICES = [
  'shared-db',
  'keycloak',
  'nextcloud',
  'collabora',
  'vaultwarden',
  'website',
  'brett',
  'tracking',
  'docuseal',
  'livekit',
  'coturn',
  'traefik',
  'mailpit',
  'whiteboard',
  'mcp-server',
  'spreed-signaling',
  'janus-gateway',
  'livekit-server',
  'recovery-browser',
  'nats',
  'janus',
];

export function mapNamespace(ns) {
  if (!ns) return 'workspace';
  if (ns === 'workspace') return 'mentolder';
  if (ns === 'workspace-korczewski') return 'korczewski';
  if (ns === 'website') return 'website';
  return ns;
}

export function findServiceRefs(value) {
  if (typeof value !== 'string') return [];
  const found = [];
  for (const svc of KNOWN_SERVICES) {
    const pattern = new RegExp(`(?:^|[\\s'"=/:@.,>])${svc}(?:[\\s'",:@/.>]|$)`, 'i');
    if (pattern.test(value) || value === svc) {
      found.push(svc);
    }
  }
  return found;
}

export function extractEnvEdges(fromId, envArray) {
  const edges = [];
  if (!Array.isArray(envArray)) return edges;
  for (const envItem of envArray) {
    if (!envItem || typeof envItem !== 'object') continue;
    const varName = envItem.name || '';
    const varValue = envItem.value || '';
    const refs = findServiceRefs(varValue);
    for (const svc of refs) {
      if (svc !== fromId) {
        edges.push({ from: fromId, to: svc, via: `env:${varName}`, kind: 'env' });
      }
    }
  }
  return edges;
}

export function collectConfigMapRefs(envArray, envFromArray, volumeArray) {
  const names = new Set();
  if (Array.isArray(envFromArray)) {
    for (const item of envFromArray) {
      const cmName = item?.configMapRef?.name;
      if (cmName) names.add(cmName);
    }
  }
  if (Array.isArray(envArray)) {
    for (const item of envArray) {
      const cmName = item?.valueFrom?.configMapKeyRef?.name;
      if (cmName) names.add(cmName);
    }
  }
  if (Array.isArray(volumeArray)) {
    for (const vol of volumeArray) {
      const cmName = vol?.configMap?.name;
      if (cmName) names.add(cmName);
    }
  }
  return [...names];
}

export function extractCommandEdges(fromId, containers, via) {
  const edges = [];
  if (!Array.isArray(containers)) return edges;
  const edgeKind = via.startsWith('initContainer') ? 'initContainer' : 'command';
  for (const c of containers) {
    const cmd = Array.isArray(c.command) ? c.command.join(' ') : (c.command || '');
    const args = Array.isArray(c.args) ? c.args.join(' ') : (c.args || '');
    const refs = [...findServiceRefs(cmd), ...findServiceRefs(args)];
    for (const svc of refs) {
      if (svc !== fromId) {
        edges.push({ from: fromId, to: svc, via, kind: edgeKind });
      }
    }
  }
  return edges;
}

export function extractAnnotationEdges(fromId, annotations) {
  const edges = [];
  const raw = annotations?.['graph.bachelorprojekt.de/depends-on'] || '';
  if (!raw) return edges;
  for (const svc of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    if (svc !== fromId) {
      edges.push({ from: fromId, to: svc, via: 'annotation', kind: 'annotation' });
    }
  }
  return edges;
}

export function mermaidId(name) {
  return name.replace(/[-./]/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
}

export function globYaml(dir, rootDir, excludePatterns = []) {
  const results = [];
  function walk(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const entry of entries) {
      const full = join(d, entry);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        const rel = relative(rootDir, full);
        if (excludePatterns.some(p => rel.startsWith(p))) continue;
        walk(full);
      } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

export function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function buildServiceMap(graph) {
  const lines = [
    '%%{init: {"theme": "dark", "themeVariables": {"background": "#0d0d0d", "primaryColor": "#f59e0b", "edgeLabelBackground": "#1a1a1a"}}}%%',
    'flowchart LR',
    '  classDef default fill:#1a1a1a,stroke:#2a2a2a,color:#e5e7eb',
    '  classDef db fill:#1a1a1a,stroke:#f59e0b,color:#f59e0b',
    '  classDef ingress fill:#1a1a1a,stroke:#10b981,color:#10b981',
    '  classDef auth fill:#1a1a1a,stroke:#8b5cf6,color:#8b5cf6',
  ];

  const allIds = new Set(graph.nodes.map(n => n.id));
  for (const node of graph.nodes) {
    const id = mermaidId(node.id);
    const label = node.id;
    let cls = 'default';
    if (node.id === 'shared-db') cls = 'db';
    else if (node.id === 'traefik') cls = 'ingress';
    else if (node.id === 'keycloak') cls = 'auth';
    lines.push(`  ${id}["${esc(label)}"]:::${cls}`);
  }

  const seen = new Set();
  for (const edge of graph.edges) {
    const key = `${edge.from}→${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!allIds.has(edge.from) && edge.from !== 'traefik') continue;
    if (!allIds.has(edge.to) && !['shared-db', 'keycloak', 'nextcloud', 'collabora', 'vaultwarden', 'website', 'brett', 'tracking', 'docuseal', 'livekit', 'coturn', 'traefik', 'mailpit'].includes(edge.to)) continue;
    const fromId = mermaidId(edge.from);
    const toId = mermaidId(edge.to);
    const via = edge.via.replace('initContainer:', '').replace('env:', '');
    const shortVia = via.length > 20 ? via.slice(0, 18) + '…' : via;
    lines.push(`  ${fromId} -->|"${esc(shortVia)}"| ${toId}`);
  }

  return lines.join('\n');
}

export function buildTopology(graph) {
  const lines = [
    '%%{init: {"theme": "dark", "themeVariables": {"background": "#0d0d0d", "primaryColor": "#f59e0b"}}}%%',
    'flowchart TB',
  ];

  const byNamespace = {};
  for (const node of graph.nodes) {
    const ns = node.namespace || 'unknown';
    if (!byNamespace[ns]) byNamespace[ns] = [];
    byNamespace[ns].push(node);
  }

  const nsLabels = {
    mentolder: 'workspace (mentolder)',
    korczewski: 'workspace-korczewski (korczewski)',
    website: 'website',
    unknown: 'unknown',
  };

  for (const [ns, nodes] of Object.entries(byNamespace)) {
    const label = nsLabels[ns] || ns;
    lines.push(`  subgraph ${mermaidId(ns)}["${esc(label)}"]`);
    for (const node of nodes) {
      const id = mermaidId(node.id);
      const shape = node.type === 'CronJob' ? `(["${esc(node.id)}"])` : `["${esc(node.id)}"]`;
      lines.push(`    ${id}${shape}`);
    }
    lines.push('  end');
  }

  return lines.join('\n');
}

export function buildApiTableMarkdown(apiMap) {
  const authIcon = { admin: '🔐', auth: '🔑', public: '🌐' };
  const header = '| Path | Methods | Auth |\n|------|---------|------|';
  const rows = apiMap.endpoints.map(ep => {
    const methods = ep.methods.join(', ');
    const icon = authIcon[ep.auth] || '❓';
    const pathShort = ep.path.length > 80 ? ep.path.slice(0, 78) + '…' : ep.path;
    return `| \`${pathShort}\` | ${methods} | ${icon} ${ep.auth} |`;
  });
  return [header, ...rows].join('\n');
}

export function buildApiTable(apiMap) {
  const authIcon = { admin: '🔐', auth: '🔑', public: '🌐' };
  const authColor = { admin: '#ef4444', auth: '#f59e0b', public: '#10b981' };

  const rows = apiMap.endpoints.map(ep => {
    const methods = ep.methods.map(m =>
      `<code style="background:#1a1a1a;color:#f59e0b;padding:1px 5px;border-radius:3px;font-size:11px">${esc(m)}</code>`
    ).join(' ');
    const color = authColor[ep.auth] || '#6b7280';
    const icon = authIcon[ep.auth] || '?';
    const pathShort = ep.path.length > 60 ? ep.path.slice(0, 58) + '…' : ep.path;
    return `<tr>
      <td><code>${esc(pathShort)}</code></td>
      <td>${methods}</td>
      <td style="color:${color}">${icon} ${esc(ep.auth)}</td>
    </tr>`;
  });

  return `<table>
    <thead>
      <tr>
        <th>Path</th>
        <th>Methods</th>
        <th>Auth</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join('\n      ')}
    </tbody>
  </table>`;
}

