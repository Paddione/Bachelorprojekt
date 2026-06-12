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
        edges.push({ from: fromId, to: svc, via: `env:${varName}`, kind: 'env' });
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

// ── Extract edges from annotation graph.bachelorprojekt.de/depends-on ───────
function extractAnnotationEdges(fromId, annotations) {
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
  const serviceSelectors = new Map(); // serviceName → { selector: {labelKey: labelValue} }
  for (const filePath of yamlFiles) {
    const docs = parseYamlFile(filePath);
    for (const doc of docs) {
      if (!doc || !doc.kind) continue;
      if (doc.kind === 'ConfigMap') {
        const cmName = doc.metadata?.name || '';
        if (!cmName) continue;
        const data = doc.data || {};
        const allValues = Object.values(data).join('\n');
        const refs = findServiceRefs(allValues);
        if (refs.length > 0) {
          configMapServices.set(cmName, new Set(refs));
        }
      }
      if (doc.kind === 'Service') {
        const svcName = doc.metadata?.name || '';
        const selector = doc.spec?.selector;
        if (svcName && selector && typeof selector === 'object') {
          serviceSelectors.set(svcName, { selector });
        }
      }
    }
  }

  // Ingress backends
  const ingressEdges = [];

  // Secret → workloads mapping (for shared-secret edges)
  const secretConsumers = new Map(); // secretName → Set<workloadId>
  // Workload → pod labels (for selector resolution)
  const workloadPodLabels = new Map(); // workloadId → {labelKey: labelValue}

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

          // Collect pod labels for selector resolution
          const podLabels = kind === 'CronJob'
            ? doc.spec?.jobTemplate?.spec?.template?.metadata?.labels || {}
            : doc.spec?.template?.metadata?.labels || {};
          workloadPodLabels.set(nodeId, podLabels);

          // Collect secret references (excluding imagePullSecrets)
          const allContainers = [...containers, ...initContainers];
          for (const c of allContainers) {
            if (Array.isArray(c.env)) {
              for (const env of c.env) {
                const secretName = env?.valueFrom?.secretKeyRef?.name;
                if (secretName) {
                  if (!secretConsumers.has(secretName)) secretConsumers.set(secretName, new Set());
                  secretConsumers.get(secretName).add(nodeId);
                }
              }
            }
            if (Array.isArray(c.envFrom)) {
              for (const ef of c.envFrom) {
                const secretName = ef?.secretRef?.name;
                if (secretName) {
                  if (!secretConsumers.has(secretName)) secretConsumers.set(secretName, new Set());
                  secretConsumers.get(secretName).add(nodeId);
                }
              }
            }
          }
          if (Array.isArray(podSpec.volumes)) {
            for (const vol of podSpec.volumes) {
              const secretName = vol?.secret?.secretName;
              if (secretName) {
                if (!secretConsumers.has(secretName)) secretConsumers.set(secretName, new Set());
                secretConsumers.get(secretName).add(nodeId);
              }
            }
          }

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
                  const e = { from: nodeId, to: svc, via: `configmap:${cmName}`, kind: 'configmap' };
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
              ingressEdges.push({ from: 'traefik', to: backendName, via: 'ingress', kind: 'ingress' });
            }
          }
        }
      }

      if (kind === 'IngressRoute' && doc.apiVersion?.startsWith('traefik.io/')) {
        const routes = doc.spec?.routes || [];
        for (const route of routes) {
          const services = route.services || [];
          for (const svc of services) {
            const svcName = svc.name || '';
            if (svcName) {
              ingressEdges.push({ from: 'traefik', to: svcName, via: 'ingress', kind: 'ingress' });
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

  // ── Selector resolution: Service → Workload ───────────────────────────────
  for (const [svcName, { selector }] of serviceSelectors) {
    if (svcName === 'traefik') continue;
    const selectorEntries = Object.entries(selector);
    if (selectorEntries.length === 0) continue;
    for (const [workloadId, podLabels] of workloadPodLabels) {
      if (workloadId === 'traefik') continue;
      const matches = selectorEntries.every(([k, v]) => podLabels[k] === v);
      if (matches) {
        const e = { from: svcName, to: workloadId, via: 'selector', kind: 'selector' };
        const key = `${e.from}→${e.to}→${e.via}`;
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push(e); }
        if (!nodes.has(svcName)) {
          nodes.set(svcName, { id: svcName, namespace: 'mentolder', type: 'Service', name: svcName });
        }
      }
    }
  }

  // ── Pass 3: Shared-secret edges ───────────────────────────────────────────
  for (const [secretName, consumers] of secretConsumers) {
    if (consumers.size < 2) continue;
    const consumerList = [...consumers];
    for (let i = 0; i < consumerList.length; i++) {
      for (let j = i + 1; j < consumerList.length; j++) {
        const wA = consumerList[i];
        const wB = consumerList[j];
        const e1 = { from: wA, to: wB, via: `secret:${secretName}`, kind: 'secret' };
        const e2 = { from: wB, to: wA, via: `secret:${secretName}`, kind: 'secret' };
        const key1 = `${e1.from}→${e1.to}→${e1.via}`;
        const key2 = `${e2.from}→${e2.to}→${e2.via}`;
        if (!edgeSet.has(key1)) { edgeSet.add(key1); edges.push(e1); }
        if (!edgeSet.has(key2)) { edgeSet.add(key2); edges.push(e2); }
      }
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
