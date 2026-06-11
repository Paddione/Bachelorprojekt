#!/usr/bin/env node
/**
 * build-graph.mjs — K8s Service Dependency Graph (LAD-1)
 *
 * Parses k3d/**\/*.yaml + prod*\/**\/*.yaml (excluding docs-content-built)
 * to extract Deployment/StatefulSet/CronJob nodes and service-to-service
 * dependency edges (via env refs, initContainers, ingress backends).
 *
 * Output: docs/generated/graph.json
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

// ── Known service names to match against env values ──────────────────────────
const KNOWN_SERVICES = [
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
  'arena-server',
  'recovery-browser',
];

// ── Namespace → brand mapping ────────────────────────────────────────────────
function mapNamespace(ns) {
  if (!ns) return 'workspace';
  if (ns === 'workspace') return 'mentolder';
  if (ns === 'workspace-korczewski') return 'korczewski';
  if (ns === 'website') return 'website';
  return ns;
}

// ── Glob yaml files recursively ──────────────────────────────────────────────
function globYaml(dir, excludePatterns = []) {
  const results = [];
  function walk(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const entry of entries) {
      const full = join(d, entry);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        // Skip excluded directories
        const rel = relative(ROOT, full);
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

// ── Parse a YAML file safely (multi-document) ────────────────────────────────
function parseYamlFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const docs = [];
  // Split on YAML document separator
  const parts = content.split(/^---\s*$/m);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      const doc = parse(trimmed);
      if (doc && typeof doc === 'object') docs.push(doc);
    } catch {
      // Skip unparseable fragments (e.g. templates with ${VAR} substitutions)
    }
  }
  return docs;
}

// ── Check if a string references a known service ────────────────────────────
function findServiceRefs(value) {
  if (typeof value !== 'string') return [];
  const found = [];
  for (const svc of KNOWN_SERVICES) {
    // Match hostname patterns: svc, svc:PORT, svc.namespace, http://svc
    const pattern = new RegExp(`(?:^|[/:@.])${svc}(?:[:/.]|$)`, 'i');
    if (pattern.test(value) || value === svc) {
      found.push(svc);
    }
  }
  return found;
}

// ── Extract edges from env array ────────────────────────────────────────────
function extractEnvEdges(fromId, envArray) {
  const edges = [];
  if (!Array.isArray(envArray)) return edges;
  for (const envItem of envArray) {
    if (!envItem || typeof envItem !== 'object') continue;
    const varName = envItem.name || '';
    const varValue = envItem.value || '';
    const refs = findServiceRefs(varValue);
    for (const svc of refs) {
      if (svc !== fromId) {
        edges.push({ from: fromId, to: svc, via: `env:${varName}` });
      }
    }
  }
  return edges;
}

// ── Extract edges from initContainers (nc / wait patterns) ──────────────────
function extractInitContainerEdges(fromId, initContainers) {
  const edges = [];
  if (!Array.isArray(initContainers)) return edges;
  for (const c of initContainers) {
    const cmd = Array.isArray(c.command) ? c.command.join(' ') : '';
    const args = Array.isArray(c.args) ? c.args.join(' ') : '';
    const refs = [...findServiceRefs(cmd), ...findServiceRefs(args)];
    for (const svc of refs) {
      if (svc !== fromId) {
        edges.push({ from: fromId, to: svc, via: 'initContainer:wait' });
      }
    }
  }
  return edges;
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const nodes = new Map(); // id → node
  const edgeSet = new Set(); // deduplication key
  const edges = [];

  // Collect yaml files from k3d/ and prod*/ dirs (excluding docs-content-built)
  const dirs = ['k3d', 'prod', 'prod-mentolder', 'prod-korczewski', 'prod-fleet'];
  const yamlFiles = [];
  for (const dir of dirs) {
    const full = join(ROOT, dir);
    const files = globYaml(full, ['k3d/docs-content-built']);
    yamlFiles.push(...files);
  }

  // Ingress backends
  const ingressEdges = [];

  for (const filePath of yamlFiles) {
    const docs = parseYamlFile(filePath);
    for (const doc of docs) {
      if (!doc || !doc.kind || !doc.apiVersion) continue;

      const kind = doc.kind;
      const metadata = doc.metadata || {};
      const name = metadata.name || '';
      const rawNs = metadata.namespace || 'workspace';
      const namespace = mapNamespace(rawNs);

      // ── Nodes: Deployment, StatefulSet, CronJob ───────────────────────────
      if (['Deployment', 'StatefulSet', 'CronJob'].includes(kind)) {
        // Normalize the service id: strip template vars like ${...}
        const cleanName = name.replace(/\$\{[^}]+\}/g, '').trim();
        if (!cleanName) continue;

        // For known services use the canonical name, otherwise use the resource name
        const nodeId = cleanName;

        if (!nodes.has(nodeId)) {
          nodes.set(nodeId, { id: nodeId, namespace, type: kind, name: cleanName });
        }

        // Extract container env refs
        const podSpec =
          kind === 'CronJob'
            ? doc.spec?.jobTemplate?.spec?.template?.spec
            : doc.spec?.template?.spec;

        if (podSpec) {
          const containers = [
            ...(podSpec.containers || []),
          ];

          for (const c of containers) {
            const envEdges = extractEnvEdges(nodeId, c.env || []);
            for (const e of envEdges) {
              const key = `${e.from}→${e.to}→${e.via}`;
              if (!edgeSet.has(key)) { edgeSet.add(key); edges.push(e); }
            }
          }

          // initContainer wait dependencies
          const initEdges = extractInitContainerEdges(nodeId, podSpec.initContainers || []);
          for (const e of initEdges) {
            const key = `${e.from}→${e.to}→${e.via}`;
            if (!edgeSet.has(key)) { edgeSet.add(key); edges.push(e); }
          }
        }
      }

      // ── Ingress backend refs → edges ──────────────────────────────────────
      if (kind === 'Ingress') {
        const rules = doc.spec?.rules || [];
        for (const rule of rules) {
          const paths = rule.http?.paths || [];
          for (const p of paths) {
            const backendName = p.backend?.service?.name || '';
            if (backendName) {
              ingressEdges.push({ from: 'traefik', to: backendName, via: 'ingress' });
            }
          }
        }
      }
    }
  }

  // Add ingress edges (traefik → service) and ensure traefik node exists
  if (ingressEdges.length > 0 && !nodes.has('traefik')) {
    nodes.set('traefik', { id: 'traefik', namespace: 'mentolder', type: 'Deployment', name: 'traefik' });
  }
  for (const e of ingressEdges) {
    const key = `${e.from}→${e.to}→${e.via}`;
    if (!edgeSet.has(key)) { edgeSet.add(key); edges.push(e); }
    // Ensure target node exists (may not be a Deployment in our files)
    if (!nodes.has(e.to)) {
      nodes.set(e.to, { id: e.to, namespace: 'mentolder', type: 'Service', name: e.to });
    }
  }

  // Also ensure well-known services appear as nodes even if not found as Deployments
  for (const svc of KNOWN_SERVICES) {
    if (!nodes.has(svc)) {
      // Only add if referenced in edges
      const referenced = edges.some(e => e.from === svc || e.to === svc);
      if (referenced) {
        nodes.set(svc, { id: svc, namespace: 'mentolder', type: 'Service', name: svc });
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    nodes: [...nodes.values()],
    edges,
  };

  mkdirSync(join(ROOT, 'docs/generated'), { recursive: true });
  const outPath = join(ROOT, 'docs/generated/graph.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`✓ graph.json: ${output.nodes.length} nodes, ${output.edges.length} edges → ${outPath}`);
}

main();
