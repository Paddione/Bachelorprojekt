import type { APIRoute } from 'astro';
import { X509Certificate } from 'node:crypto';
import { createK8sClient } from '../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../lib/auth';

const TLS_SECRETS: Record<string, { ns: string; name: string }> = {
  mentolder:  { ns: 'workspace',            name: 'workspace-wildcard-tls' },
  korczewski: { ns: 'workspace-korczewski', name: 'korczewski-tls' },
};

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  const results: Record<string, { notAfter: string | null; daysLeft: number | null; error?: string }> = {};

  for (const [cluster, { ns, name }] of Object.entries(TLS_SECRETS)) {
    try {
      const secret = await k8s.get(`/api/v1/namespaces/${ns}/secrets/${name}`);
      const certBase64 = secret.data?.['tls.crt'];
      if (!certBase64) { results[cluster] = { notAfter: null, daysLeft: null, error: 'Kein tls.crt im Secret' }; continue; }
      const cert = new X509Certificate(Buffer.from(certBase64, 'base64'));
      const notAfter = cert.validTo;
      const daysLeft = Math.floor((new Date(notAfter).getTime() - Date.now()) / 86400000);
      results[cluster] = { notAfter, daysLeft };
    } catch (e: any) {
      results[cluster] = { notAfter: null, daysLeft: null, error: e.message };
    }
  }

  return new Response(JSON.stringify({ results, checkedAt: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
