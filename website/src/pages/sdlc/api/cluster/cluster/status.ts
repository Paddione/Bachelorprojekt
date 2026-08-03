import type { APIRoute } from 'astro';

export const prerender = false;

let cache: { nodes: number; pods: number; brands: number; ts: number } | null = null;
const TTL_MS = 25_000;

async function fetchClusterCounts() {
  try {
    const r = await fetch('http://dashboard.workspace.svc.cluster.local/api/cluster/summary', {
      signal: AbortSignal.timeout(2000),
    });
    if (r.ok) {
      const j = await r.json();
      return { nodes: j.nodes ?? 12, pods: j.pods ?? 0, brands: j.brands ?? 2 };
    }
  } catch {
    // ignore
  }
  return { nodes: 12, pods: 0, brands: 2 };
}

export const GET: APIRoute = async () => {
  const now = Date.now();
  if (!cache || now - cache.ts > TTL_MS) {
    const counts = await fetchClusterCounts();
    cache = { ...counts, ts: now };
  }
  return new Response(JSON.stringify({ nodes: cache.nodes, pods: cache.pods, brands: cache.brands }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
