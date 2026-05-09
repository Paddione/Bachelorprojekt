import type { APIRoute } from 'astro';
import http from 'node:http';
import https from 'node:https';
import { getSession, isAdmin } from '../../../../lib/auth';

type ServiceCheck = {
  name: string;
  url: string;
  status: 'ok' | 'slow' | 'error';
  latencyMs: number | null;
  error?: string;
};

const SERVICES: Record<string, { name: string; internalUrl: string }[]> = {
  mentolder: [
    { name: 'Keycloak',     internalUrl: 'http://keycloak.workspace.svc.cluster.local:8080/health/ready' },
    { name: 'Nextcloud',    internalUrl: 'http://nextcloud.workspace.svc.cluster.local/status.php' },
    { name: 'Collabora',    internalUrl: 'http://collabora.workspace.svc.cluster.local/hosting/capabilities' },
    { name: 'Vaultwarden',  internalUrl: 'http://vaultwarden.workspace.svc.cluster.local/alive' },
    { name: 'DocuSeal',     internalUrl: 'http://docuseal.workspace.svc.cluster.local:3000' },
    { name: 'Website',      internalUrl: 'http://website.website.svc.cluster.local' },
  ],
  korczewski: [
    { name: 'Keycloak',     internalUrl: 'http://keycloak.workspace-korczewski.svc.cluster.local:8080/health/ready' },
    { name: 'Nextcloud',    internalUrl: 'http://nextcloud.workspace-korczewski.svc.cluster.local/status.php' },
    { name: 'Collabora',    internalUrl: 'http://collabora.workspace-korczewski.svc.cluster.local/hosting/capabilities' },
    { name: 'Vaultwarden',  internalUrl: 'http://vaultwarden.workspace-korczewski.svc.cluster.local/alive' },
    { name: 'Website',      internalUrl: 'http://website.website-korczewski.svc.cluster.local' },
  ],
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

  const results: Record<string, ServiceCheck[]> = {};

  for (const [cluster, services] of Object.entries(SERVICES)) {
    results[cluster] = await Promise.all(
      services.map(async (svc) => {
        try {
          const { latencyMs, ok } = await checkUrl(svc.internalUrl);
          return {
            name: svc.name,
            url: svc.internalUrl,
            status: !ok ? 'error' : latencyMs > 2000 ? 'slow' : 'ok',
            latencyMs,
          } satisfies ServiceCheck;
        } catch (e: any) {
          return { name: svc.name, url: svc.internalUrl, status: 'error', latencyMs: null, error: e.message };
        }
      })
    );
  }

  return new Response(JSON.stringify({ results, checkedAt: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
