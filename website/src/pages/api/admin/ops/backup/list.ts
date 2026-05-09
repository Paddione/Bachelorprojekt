import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

const NS: Record<string, string> = { mentolder: 'workspace', korczewski: 'workspace-korczewski' };

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const url = new URL(request.url);
  const cluster = url.searchParams.get('cluster') ?? 'mentolder';
  const ns = NS[cluster];
  if (!ns) return new Response(JSON.stringify({ error: 'Ungültiger Cluster' }), { status: 400 });

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  const data = await k8s.get(`/apis/batch/v1/namespaces/${ns}/jobs?labelSelector=app%3Ddb-backup`);
  const jobs = (data.items ?? [])
    .map((j: any) => ({
      name: j.metadata.name,
      trigger: j.metadata.labels?.trigger ?? 'cron',
      startTime: j.status?.startTime ?? null,
      completionTime: j.status?.completionTime ?? null,
      succeeded: (j.status?.succeeded ?? 0) > 0,
      failed: (j.status?.failed ?? 0) > 0,
    }))
    .sort((a: any, b: any) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime())
    .slice(0, 20);

  return new Response(JSON.stringify({ jobs }), { headers: { 'Content-Type': 'application/json' } });
};
