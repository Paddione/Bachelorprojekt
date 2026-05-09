import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

const NS: Record<string, string> = { mentolder: 'workspace', korczewski: 'workspace-korczewski' };

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = await request.json().catch(() => ({}));
  const cluster = body.cluster as string;
  const ns = NS[cluster];
  if (!ns) return new Response(JSON.stringify({ error: 'Ungültiger Cluster (mentolder|korczewski)' }), { status: 400 });

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  const cronJob = await k8s.get(`/apis/batch/v1/namespaces/${ns}/cronjobs/db-backup`);
  const jobName = `db-backup-manual-${Date.now()}`;
  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: jobName, namespace: ns, labels: { app: 'db-backup', trigger: 'manual' } },
    spec: cronJob.spec.jobTemplate.spec,
  };
  await k8s.post(`/apis/batch/v1/namespaces/${ns}/jobs`, job);

  return new Response(JSON.stringify({ ok: true, jobName }), { headers: { 'Content-Type': 'application/json' } });
};
