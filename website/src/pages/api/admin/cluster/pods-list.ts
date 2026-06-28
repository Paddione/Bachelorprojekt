import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../lib/auth';

const CONTEXT_TO_NS: Record<string, string> = {
  mentolder: 'workspace',
  korczewski: 'workspace-korczewski',
};

const SAFE_NS = /^[a-z0-9][a-z0-9-]{0,62}$/;

interface K8sContainerStatus { ready: boolean; restartCount?: number }
interface K8sPod {
  metadata: { name: string; labels?: Record<string, string> };
  status?: { phase?: string; containerStatuses?: K8sContainerStatus[] };
  spec?: { containers?: { name: string }[] };
}
interface CompactPod {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
  containers: string[];
  labels: Record<string, string>;
}

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
    const data = await k8s.get<{ items?: K8sPod[] }>(`/api/v1/namespaces/${encodeURIComponent(ns)}/pods`);
    const pods: CompactPod[] = (data.items ?? []).map((p: K8sPod) => ({
      name: p.metadata.name,
      phase: p.status?.phase ?? 'Unknown',
      ready: p.status?.containerStatuses?.every((c: K8sContainerStatus) => c.ready) ?? false,
      restarts: (p.status?.containerStatuses ?? []).reduce((a: number, c: K8sContainerStatus) => a + (c.restartCount ?? 0), 0),
      containers: (p.spec?.containers ?? []).map((c) => c.name),
      labels: p.metadata.labels ?? {},
    }));
    pods.sort((a: CompactPod, b: CompactPod) => a.name.localeCompare(b.name));
    return new Response(JSON.stringify({ pods, namespace: ns }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Kubernetes API error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
