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
  'nats',
  'janus',
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
    // Match hostname patterns: svc, svc:PORT, svc.namespace, http://svc, 'svc', "svc", =svc
    const pattern = new RegExp(`(?:^|[\\s'"=/:@.,>])${svc}(?:[\\s'",:@/.>]|$)`, 'i');
    if (pattern.test(value) || value === svc) {
      found.push(svc);
    }
  }
  return found;
}

// ── Extract edges from env array (literal values only) ──────────────────────
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

// ── Collect ConfigMap names referenced via envFrom/valueFrom/volumes ─────────
function collectConfigMapRefs(envArray, envFromArray, volumeArray) {
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
  // ConfigMaps mounted as volumes (e.g. config files injected into the container)
  if (Array.isArray(volumeArray)) {
    for (const vol of volumeArray) {
      const cmName = vol?.configMap?.name;
      if (cmName) names.add(cmName);
    }
  }
  return [...names];
}

// ── Extract edges from container command/args ────────────────────────────────
function extractCommandEdges(fromId, containers, via) {
  const edges = [];
  if (!Array.isArray(containers)) return edges;
  for (const c of containers) {
    const cmd = Array.isArray(c.command) ? c.command.join(' ') : (c.command || '');
    const args = Array.isArray(c.args) ? c.args.join(' ') : (c.args || '');
    const refs = [...findServiceRefs(cmd), ...findServiceRefs(args)];
    for (const svc of refs) {
      if (svc !== fromId) {
        edges.push({ from: fromId, to: svc, via });
      }
    }
  }
  return edges;
}

// ── Extract edges from annotation graph.bachelorprojekt.de/depends-on ───────
function extractAnnotationEdges(fromId, annotations) {
  const edges = [];
  const raw = annotations?.['graph.bachelorprojekt.de/depends-on'] || '';
  if (!raw) return edges;
  for (const svc of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    if (svc !== fromId) {
      edges.push({ from: fromId, to: svc, via: 'annotation' });
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

  // ── Pass 1: collect ConfigMap data → service refs ─────────────────────────
  // ConfigMap data values may contain service hostnames (e.g. nats://nats:4222).
  // We collect them so Pass 2 can add edges for deployments that mount these CMs.
  const configMapServices = new Map(); // configMapName → Set<serviceName>
  for (const filePath of yamlFiles) {
    const docs = parseYamlFile(filePath);
    for (const doc of docs) {
      if (!doc || doc.kind !== 'ConfigMap') continue;
      const cmName = doc.metadata?.name || '';
      if (!cmName) continue;
      const data = doc.data || {};
      const allValues = Object.values(data).join('\n');
      const refs = findServiceRefs(allValues);
      if (refs.length > 0) {
        configMapServices.set(cmName, new Set(refs));
      }
    }
  }

  // Ingress backends
  const ingressEdges = [];

  // ── Pass 2: build nodes and edges ─────────────────────────────────────────
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

        const nodeId = cleanName;

        if (!nodes.has(nodeId)) {
          nodes.set(nodeId, { id: nodeId, namespace, type: kind, name: cleanName });
        }

        const podSpec =
          kind === 'CronJob'
            ? doc.spec?.jobTemplate?.spec?.template?.spec
            : doc.spec?.template?.spec;

        if (podSpec) {
          const containers = podSpec.containers || [];
          const initContainers = podSpec.initContainers || [];

          for (const c of containers) {
            // Literal env values
            const envEdges = extractEnvEdges(nodeId, c.env || []);
            for (const e of envEdges) {
              const key = `${e.from}→${e.to}→${e.via}`;
              if (!edgeSet.has(key)) { edgeSet.add(key); edges.push(e); }
            }

            // ConfigMap-backed env: envFrom + valueFrom.configMapKeyRef + volume mounts
            const cmRefs = collectConfigMapRefs(c.env || [], c.envFrom || [], podSpec.volumes || []);
            for (const cmName of cmRefs) {
              const svcs = configMapServices.get(cmName) || new Set();
              for (const svc of svcs) {
                if (svc !== nodeId) {
                  const e = { from: nodeId, to: svc, via: `configmap:${cmName}` };
                  const key = `${e.from}→${e.to}→${e.via}`;
                  if (!edgeSet.has(key)) { edgeSet.add(key); edges.push(e); }
                }
              }
            }
          }

          // Container command/args (curl calls, wait scripts etc.)
          const cmdEdges = [
            ...extractCommandEdges(nodeId, containers, 'command'),
            ...extractCommandEdges(nodeId, initContainers, 'initContainer:wait'),
          ];
          for (const e of cmdEdges) {
            const key = `${e.from}→${e.to}→${e.via}`;
            if (!edgeSet.has(key)) { edgeSet.add(key); edges.push(e); }
          }
        }

        // Annotation-declared dependencies (for secretKeyRef-hidden refs)
        const annotEdges = extractAnnotationEdges(nodeId, metadata.annotations);
        for (const e of annotEdges) {
          const key = `${e.from}→${e.to}→${e.via}`;
          if (!edgeSet.has(key)) { edgeSet.add(key); edges.push(e); }
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
