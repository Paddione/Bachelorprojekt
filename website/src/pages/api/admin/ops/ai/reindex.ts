import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { platformPool } from '../../../../../lib/website-db';
import { startAction, finishAction, ConcurrentActionError } from '../../../../../lib/admin-actions';
import { sanitizeForLog } from '../../../../../lib/sanitize';

const COLLECTION_RE = /^[a-z0-9-]{1,64}$/;
const WORKSPACE_NS = process.env.WORKSPACE_NAMESPACE || 'workspace';

export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403 });

  const body = await request.json().catch(() => ({}));
  const collection = body.collection as string;
  if (!COLLECTION_RE.test(collection || '')) {
    return new Response(JSON.stringify({ error: 'Eingabe ungültig: Collection-Name ungültig' }), { status: 400 });
  }

  let actionId: number | null = null;
  try {
    actionId = await startAction(platformPool, {
      actor: session.preferred_username, action: 'ai_reindex', target: collection, payload: { collection },
    });

    const k8s = await createK8sClient();
    const jobName = `reindex-${collection}-${Date.now()}`.slice(0, 63);
    const job = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: jobName, namespace: WORKSPACE_NS, labels: { app: 'knowledge-reindex', collection } },
      spec: {
        ttlSecondsAfterFinished: 86400,
        backoffLimit: 0,
        template: {
          spec: {
            restartPolicy: 'OnFailure',
            containers: [{
              name: 'reindex',
              image: 'ghcr.io/paddione/website:latest',
              command: ['node', 'scripts/knowledge/reindex.mjs'],
              args: ['--collection', collection],
              envFrom: [{ secretRef: { name: 'workspace-secrets' } }],
            }],
          },
        },
      },
    };
    await k8s.post(`/apis/batch/v1/namespaces/${WORKSPACE_NS}/jobs`, job);

    await finishAction(platformPool, actionId, { status: 'success', payload: { job_name: jobName } });
    return new Response(JSON.stringify({ action_id: actionId, job_name: jobName }), { status: 200 });
  } catch (err) {
    if (err instanceof ConcurrentActionError) {
      return new Response(JSON.stringify({ error: 'Reindex läuft bereits, bitte warten' }), { status: 409 });
    }
    const msg = sanitizeForLog((err as Error).message);
    if (actionId !== null) await finishAction(platformPool, actionId, { status: 'failed', error: msg }).catch(() => {});
    locals.requestLogger.error({ err }, '[ops/ai/reindex]');
    return new Response(JSON.stringify({ error: 'Reindex fehlgeschlagen: ' + msg.slice(0, 200) }), { status: 500 });
  }
};
