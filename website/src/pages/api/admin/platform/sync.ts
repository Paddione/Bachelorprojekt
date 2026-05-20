import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { name, namespace } = await request.json();
  if (!name || !namespace) {
    return new Response(JSON.stringify({ error: 'Missing name or namespace' }), { status: 400 });
  }

  let k8s;
  try {
    k8s = await createK8sClient();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'K8s client failed' }), { status: 503 });
  }

  try {
    // Trigger Flux reconciliation via annotation
    await k8s.mergePatch(`/apis/kustomize.toolkit.fluxcd.io/v1/namespaces/${namespace}/kustomizations/${name}`, {
      metadata: {
        annotations: {
          'reconcile.fluxcd.io/requestedAt': new Date().toISOString()
        }
      }
    });

    return new Response(JSON.stringify({ ok: true, message: `Reconciliation requested for ${name}` }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to trigger sync', details: e.message }), { status: 500 });
  }
};
