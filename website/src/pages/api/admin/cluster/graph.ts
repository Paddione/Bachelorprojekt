import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface GraphNode {
  id: string;
  namespace: string;
  type: string;
  name: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  via?: string;
  kind?: string;
}

export interface GraphData {
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PodEntry {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
  containers: string[];
  labels?: Record<string, string>;
}

export interface NodeStatus {
  color: string;
  detail: string;
  pods: PodEntry[];
  matched: boolean;
}

const NS_MAP: Record<string, Record<string, string>> = {
  '${WEBSITE_NAMESPACE}': { mentolder: 'website', korczewski: 'website-korczewski' },
  '${WORKSPACE_NAMESPACE}': { mentolder: 'workspace', korczewski: 'workspace-korczewski' },
  '$STAGING_NS': { mentolder: 'workspace-dev', korczewski: 'workspace-dev' },
};

export function resolveNamespace(placeholder: string, brand: string): string {
  const mapping = NS_MAP[placeholder];
  if (mapping) return mapping[brand] ?? mapping.mentolder;
  return placeholder;
}

export function resolveGraph(graph: GraphData, brand: string): GraphData {
  const resolvedNodes = graph.nodes.map(n => ({
    ...n,
    namespace: resolveNamespace(n.namespace, brand),
  }));
  return { ...graph, nodes: resolvedNodes };
}

export function matchPodsToNode(node: GraphNode, pods: PodEntry[]): PodEntry[] {
  const labelMatch = pods.filter(p => {
    const app = p.labels?.app;
    return app === node.id || app === node.name;
  });
  if (labelMatch.length > 0) return labelMatch;

  const prefixMatch = pods.filter(p => p.name.startsWith(node.name + '-'));
  if (prefixMatch.length > 0) return prefixMatch;

  return [];
}

export function buildStatusMap(
  nodes: GraphNode[],
  podsByNamespace: Map<string, PodEntry[]>,
): Map<string, NodeStatus> {
  const map = new Map<string, NodeStatus>();

  for (const node of nodes) {
    const pods = podsByNamespace.get(node.namespace) ?? [];
    const matched = matchPodsToNode(node, pods);

    if (node.type === 'CronJob') {
      map.set(node.id, { color: '#6b7280', detail: 'CronJob — kein laufender Pod erwartet', pods: matched, matched: true });
      continue;
    }

    if (matched.length === 0) {
      map.set(node.id, { color: '#374151', detail: 'Kein Pod zugeordnet', pods: [], matched: false });
      continue;
    }

    const allReady = matched.every(p => p.ready);
    const anyReady = matched.some(p => p.ready);
    const totalRestarts = matched.reduce((a, p) => a + p.restarts, 0);
    const hasCrashLoop = matched.some(p => p.phase === 'CrashLoopBackOff' || p.phase === 'Error');

    if (hasCrashLoop || !anyReady) {
      map.set(node.id, { color: '#ef4444', detail: `Kritisch: ${matched.length} Pods, keiner ready`, pods: matched, matched: true });
    } else if (!allReady || totalRestarts > 0) {
      map.set(node.id, { color: '#eab308', detail: `Degraded: ${matched.filter(p => p.ready).length}/${matched.length} ready, ${totalRestarts} Restarts`, pods: matched, matched: true });
    } else {
      map.set(node.id, { color: '#22c55e', detail: `Healthy: ${matched.length} Pods ready`, pods: matched, matched: true });
    }
  }

  return map;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();

  let raw: string;
  try {
    const graphPath = join(process.cwd(), '..', 'docs', 'generated', 'graph.json');
    raw = await readFile(graphPath, 'utf-8');
  } catch {
    return new Response(JSON.stringify({ error: 'graph.json nicht gefunden' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let graph: GraphData;
  try {
    graph = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: 'graph.json Parse-Fehler' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resolved = resolveGraph(graph, brand);
  const resolvedNamespaces = [...new Set(resolved.nodes.map(n => n.namespace))];

  return new Response(JSON.stringify({
    nodes: resolved.nodes,
    edges: resolved.edges,
    generatedAt: resolved.generatedAt,
    resolvedBrand: brand,
    resolvedNamespaces,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
