import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let k8s;
  try {
    k8s = await createK8sClient();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Kein Service-Account-Token gefunden. Bitte RBAC für den website-Pod konfigurieren.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const data = await k8s.get('/apis/argoproj.io/v1alpha1/namespaces/argocd/applications');
    const apps = (data.items ?? []).map((app: any) => ({
      name: app.metadata.name,
      namespace: app.metadata.namespace,
      project: app.spec?.project ?? 'default',
      destination: {
        server: app.spec?.destination?.server ?? '',
        namespace: app.spec?.destination?.namespace ?? '',
      },
      source: {
        repoURL: app.spec?.source?.repoURL ?? '',
        path: app.spec?.source?.path ?? '',
        targetRevision: app.spec?.source?.targetRevision ?? '',
      },
      syncStatus: app.status?.sync?.status ?? 'Unknown',
      syncRevision: app.status?.sync?.revision ?? '',
      health: app.status?.health?.status ?? 'Unknown',
      healthMessage: app.status?.health?.message ?? '',
      operationPhase: app.status?.operationState?.phase ?? '',
      lastSyncedAt: app.status?.operationState?.finishedAt ?? null,
    }));
    apps.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return new Response(
      JSON.stringify({ apps, fetchedAt: new Date().toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    const status = String(error.message || '').includes('403') ? 403 : 500;
    return new Response(
      JSON.stringify({ error: error.message ?? 'Kubernetes API error' }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
