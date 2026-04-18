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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { replicas } = body ?? {};
  if (typeof replicas !== 'number' || !Number.isInteger(replicas) || replicas < 0 || replicas > 10) {
    return new Response(
      JSON.stringify({ error: 'replicas must be an integer between 0 and 10' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let k8s: Awaited<ReturnType<typeof createK8sClient>>;
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
      spec: { replicas },
    });
    return new Response(JSON.stringify({ ok: true, replicas }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    const msg: string = error.message ?? 'Unknown error';
    console.error('[deployments/scale]', msg);
    const status = /K8s API 404/.test(msg) ? 404
      : /K8s API 403/.test(msg) ? 403
      : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
