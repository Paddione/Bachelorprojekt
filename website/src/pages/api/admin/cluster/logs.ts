import type { APIRoute } from 'astro';
import https from 'node:https';
import fs from 'node:fs/promises';
import { getSession, isAdmin } from '../../../../lib/auth';

const CONTEXT_TO_NS: Record<string, string> = {
  mentolder: 'workspace',
  korczewski: 'workspace-korczewski',
};

const SAFE_NAME = /^[a-z0-9][a-z0-9.-]{0,253}$/;

// Logs return text/plain, not JSON — k8s.ts only parses JSON, so do a raw fetch here.
async function fetchLogs(path: string): Promise<{ status: number; body: string }> {
  const token = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8');
  const ca = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', 'utf-8');
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'kubernetes.default.svc.cluster.local',
        path,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/plain' },
        ca,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const pod = url.searchParams.get('pod')?.trim() ?? '';
  const container = url.searchParams.get('container')?.trim() ?? '';
  const context = url.searchParams.get('context')?.trim() ?? 'mentolder';
  const ns = url.searchParams.get('ns')?.trim() ?? CONTEXT_TO_NS[context] ?? 'workspace';
  const tail = Math.min(Math.max(parseInt(url.searchParams.get('tail') ?? '200', 10) || 200, 1), 2000);

  if (!pod || !SAFE_NAME.test(pod)) {
    return new Response('invalid or missing ?pod=', { status: 400 });
  }
  if (container && !SAFE_NAME.test(container)) {
    return new Response('invalid ?container=', { status: 400 });
  }
  if (ns && !SAFE_NAME.test(ns)) {
    return new Response('invalid ?ns=', { status: 400 });
  }

  const params = new URLSearchParams({ tailLines: String(tail), timestamps: 'true' });
  if (container) params.set('container', container);

  try {
    const path = `/api/v1/namespaces/${encodeURIComponent(ns)}/pods/${encodeURIComponent(pod)}/log?${params}`;
    const { status, body } = await fetchLogs(path);
    if (status >= 400) {
      return new Response(`K8s API ${status}: ${body.slice(0, 500)}`, { status });
    }
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error: any) {
    return new Response(`Error: ${error.message ?? 'unknown'}`, { status: 500 });
  }
};
