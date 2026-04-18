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
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
