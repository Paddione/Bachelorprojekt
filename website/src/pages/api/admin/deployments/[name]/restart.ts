import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { name } = params;
  if (!name || name.length > 63 || !/^[a-z0-9-]+$/.test(name)) {
    return new Response(JSON.stringify({ error: 'Invalid deployment name' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let k8s;
  try {
    k8s = await createK8sClient();
  } catch {
    return new Response(JSON.stringify({ error: 'Kein Service-Account-Token gefunden.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await k8s.patch(`/apis/apps/v1/namespaces/workspace/deployments/${name}`, {
      spec: {
        template: {
          metadata: {
            annotations: {
              'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
            },
          },
        },
      },
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    const msg: string = error.message ?? 'Unknown error';
    console.error('[deployments/restart]', msg);
    const status = /K8s API 404/.test(msg) ? 404
      : /K8s API 403/.test(msg) ? 403
      : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
