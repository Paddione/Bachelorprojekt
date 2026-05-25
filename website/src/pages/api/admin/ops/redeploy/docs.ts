import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool } from '../../../../../lib/website-db';
import { startAction, finishAction, ConcurrentActionError } from '../../../../../lib/admin-actions';
import { sanitizeForLog } from '../../../../../lib/sanitize';

const CLUSTERS = ['mentolder', 'korczewski'] as const;
type Cluster = typeof CLUSTERS[number];
const NS: Record<Cluster, string> = { mentolder: 'workspace', korczewski: 'workspace-korczewski' };

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung für diese Aktion' }), { status: 403 });

  const body = await request.json().catch(() => ({}));
  const cluster = body.cluster as Cluster;
  if (!CLUSTERS.includes(cluster)) {
    return new Response(JSON.stringify({ error: 'Eingabe ungültig: cluster muss "mentolder" oder "korczewski" sein' }), { status: 400 });
  }

  let actionId: number | null = null;
  try {
    actionId = await startAction(pool, {
      actor: session.preferred_username,
      action: 'redeploy_docs',
      target: cluster,
      cluster,
      payload: { ns: NS[cluster], deployment: 'docs' },
    });

    const k8s = await createK8sClient();
    const restartedAt = new Date().toISOString();
    await k8s.patch(
      `/apis/apps/v1/namespaces/${NS[cluster]}/deployments/docs`,
      { spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': restartedAt } } } } }
    );

    await finishAction(pool, actionId, { status: 'success', payload: { restartedAt } });
    return new Response(JSON.stringify({ action_id: actionId, message: 'Deployment gestartet', restartedAt }), { status: 200 });
  } catch (err) {
    if (err instanceof ConcurrentActionError) {
      const ageMin = Math.floor((Date.now() - new Date(err.created_at).getTime()) / 60_000);
      return new Response(JSON.stringify({ error: `Diese Aktion läuft bereits seit ${ageMin} Minute(n)` }), { status: 409 });
    }
    const msg = sanitizeForLog((err as Error).message);
    if (actionId !== null) {
      await finishAction(pool, actionId, { status: 'failed', error: msg }).catch(() => {});
    }
    console.error('[ops/redeploy/docs]', err);
    return new Response(JSON.stringify({ error: `Aktion fehlgeschlagen: ${msg.slice(0, 200)}` }), { status: 500 });
  }
};
