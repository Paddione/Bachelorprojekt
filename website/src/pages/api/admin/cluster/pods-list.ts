import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../lib/auth';

const CONTEXT_TO_NS: Record<string, string> = {
  mentolder: 'workspace',
  korczewski: 'workspace-korczewski',
};

const SAFE_NS = /^[a-z0-9][a-z0-9-]{0,62}$/;

// Compact pod list with phase/restarts — used by the Logs tab to populate
// the pod dropdown without fetching the full /api/admin/monitoring payload.
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const context = url.searchParams.get('context')?.trim() ?? 'mentolder';
  const ns = url.searchParams.get('ns')?.trim() ?? CONTEXT_TO_NS[context] ?? 'workspace';
  if (!SAFE_NS.test(ns)) {
    return new Response(JSON.stringify({ error: 'invalid ?ns=' }), { status: 400 });
  }

  let k8s;
  try {
    k8s = await createK8sClient();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Kein Service-Account-Token gefunden. Bitte RBAC prüfen.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const data = await k8s.get(`/api/v1/namespaces/${encodeURIComponent(ns)}/pods`);
    const pods = (data.items ?? []).map((p: any) => ({
      name: p.metadata.name,
      phase: p.status?.phase ?? 'Unknown',
      ready: p.status?.containerStatuses?.every((c: any) => c.ready) ?? false,
      restarts: (p.status?.containerStatuses ?? []).reduce((a: number, c: any) => a + (c.restartCount ?? 0), 0),
      containers: (p.spec?.containers ?? []).map((c: any) => c.name),
    }));
    pods.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return new Response(JSON.stringify({ pods, namespace: ns }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message ?? 'Kubernetes API error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
