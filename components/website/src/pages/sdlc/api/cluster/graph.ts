import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  resolveGraph,
  type GraphData,
} from '../../../../lib/graph-utils';

export type { GraphNode, GraphEdge, GraphData, PodEntry, NodeStatus } from '../../../../lib/graph-utils';
export { resolveNamespace, resolveGraph, matchPodsToNode, buildStatusMap } from '../../../../lib/graph-utils';

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
