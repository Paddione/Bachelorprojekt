import type { APIRoute } from 'astro';
import http from 'node:http';
import https from 'node:https';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listSoftwareAssets } from '../../../../lib/platform-db';
import { resolveHealthUrl } from '../../../../lib/platform-links';

type ServiceCheck = {
  name: string;
  slug: string;
  url: string;
  status: 'ok' | 'slow' | 'error' | 'optional';
  latencyMs: number | null;
  optional: boolean;
  error?: string;
};

function checkUrl(url: string, timeoutMs = 5000): Promise<{ latencyMs: number; ok: boolean }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      const latencyMs = Date.now() - start;
      resolve({ latencyMs, ok: (res.statusCode ?? 500) < 500 });
    });
    req.on('error', () => resolve({ latencyMs: Date.now() - start, ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ latencyMs: timeoutMs, ok: false }); });
  });
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const currentCluster = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();

  let assets;
  try {
    assets = await listSoftwareAssets();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return new Response(
      JSON.stringify({ error: `DB unreachable: ${message}` }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const probeable = assets.filter(
    (a) => a.health_url && a.health_url.trim() !== '' && a.clusters.includes(currentCluster),
  );

  const probeResults = await Promise.all(
    probeable.map(async (asset) => {
      const url = resolveHealthUrl(asset, currentCluster) ?? '';
      const optional = asset.base_status === 'optional';
      try {
        const { latencyMs, ok } = await checkUrl(url);
        let status: ServiceCheck['status'];
        if (!ok) status = optional ? 'optional' : 'error';
        else status = latencyMs > 2000 ? 'slow' : 'ok';
        return { name: asset.name, slug: asset.slug, url, status, latencyMs, optional } satisfies ServiceCheck;
      } catch (e) {
        return {
          name: asset.name, slug: asset.slug, url,
          status: optional ? 'optional' : 'error',
          latencyMs: null, optional, error: e instanceof Error ? e.message : undefined,
        } satisfies ServiceCheck;
      }
    }),
  );

  const results: Record<string, ServiceCheck[]> = { [currentCluster]: probeResults };

  return new Response(JSON.stringify({ results, checkedAt: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
