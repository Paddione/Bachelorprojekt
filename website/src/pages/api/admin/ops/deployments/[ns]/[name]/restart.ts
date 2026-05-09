import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../../../lib/auth';

const ALLOWED_NS = ['workspace', 'workspace-korczewski', 'website', 'website-korczewski'];

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { ns, name } = params;
  if (!ns || !ALLOWED_NS.includes(ns)) return new Response(JSON.stringify({ error: 'Ungültiger Namespace' }), { status: 400 });
  if (!name || !/^[a-z0-9-]+$/.test(name)) return new Response(JSON.stringify({ error: 'Ungültiger Name' }), { status: 400 });

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  await k8s.patch(`/apis/apps/v1/namespaces/${ns}/deployments/${name}`, {
    spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } } } },
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
