import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../lib/auth';

const NS: Record<string, string> = { mentolder: 'workspace', korczewski: 'workspace-korczewski' };
const VALID_DBS = ['keycloak', 'nextcloud', 'vaultwarden', 'website', 'docuseal', 'all'];

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = await request.json().catch(() => ({}));
  const cluster = body.cluster as string;
  const db = body.db as string;
  const backupJobName = body.backupJobName as string;

  const ns = NS[cluster];
  if (!ns) return new Response(JSON.stringify({ error: 'Ungültiger Cluster' }), { status: 400 });
  if (!VALID_DBS.includes(db)) return new Response(JSON.stringify({ error: 'Ungültige DB' }), { status: 400 });
  if (!backupJobName || !/^[a-z0-9-]+$/.test(backupJobName)) {
    return new Response(JSON.stringify({ error: 'Ungültiger Backup-Job-Name' }), { status: 400 });
  }

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  const jobData = await k8s.get(`/apis/batch/v1/namespaces/${ns}/jobs/${backupJobName}`);
  const startTime = jobData.status?.startTime;
  if (!startTime) return new Response(JSON.stringify({ error: 'Backup-Job hat keinen Startzeitstempel' }), { status: 400 });

  const ts = new Date(startTime);
  const timestamp = [
    ts.getUTCFullYear(),
    String(ts.getUTCMonth() + 1).padStart(2, '0'),
    String(ts.getUTCDate()).padStart(2, '0'),
    '_',
    String(ts.getUTCHours()).padStart(2, '0'),
    String(ts.getUTCMinutes()).padStart(2, '0'),
    String(ts.getUTCSeconds()).padStart(2, '0'),
  ].join('');

  const cronJob = await k8s.get(`/apis/batch/v1/namespaces/${ns}/cronjobs/db-backup`);
  const jobName = `db-restore-${db}-${Date.now()}`;
  const spec = structuredClone(cronJob.spec.jobTemplate.spec);

  const container = spec.template.spec.containers[0];
  container.env = [
    ...(container.env ?? []),
    { name: 'RESTORE_MODE', value: 'true' },
    { name: 'RESTORE_DB', value: db },
    { name: 'RESTORE_TIMESTAMP', value: timestamp },
  ];

  const job = {
    apiVersion: 'batch/v1', kind: 'Job',
    metadata: { name: jobName, namespace: ns, labels: { app: 'db-backup', trigger: 'restore' } },
    spec,
  };
  await k8s.post(`/apis/batch/v1/namespaces/${ns}/jobs`, job);

  return new Response(JSON.stringify({ ok: true, jobName, timestamp }), { headers: { 'Content-Type': 'application/json' } });
};
