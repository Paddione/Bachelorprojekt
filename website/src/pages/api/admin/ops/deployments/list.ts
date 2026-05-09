import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

const NAMESPACES = [
  { ns: 'workspace',            label: 'mentolder' },
  { ns: 'workspace-korczewski', label: 'korczewski' },
  { ns: 'website',              label: 'website (mentolder)' },
  { ns: 'website-korczewski',   label: 'website (korczewski)' },
];

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  const deployments: Array<{ ns: string; nsLabel: string; name: string; desired: number; ready: number; status: string }> = [];

  await Promise.allSettled(
    NAMESPACES.map(async ({ ns, label }) => {
      const data = await k8s.get(`/apis/apps/v1/namespaces/${ns}/deployments`);
      for (const d of data.items ?? []) {
        const desired = d.spec?.replicas ?? 0;
        const ready = d.status?.readyReplicas ?? 0;
        const status = ready === desired && desired > 0 ? 'healthy' : desired === 0 ? 'stopped' : 'degraded';
        deployments.push({ ns, nsLabel: label, name: d.metadata.name, desired, ready, status });
      }
    })
  );

  deployments.sort((a, b) => a.nsLabel.localeCompare(b.nsLabel) || a.name.localeCompare(b.name));
  return new Response(JSON.stringify({ deployments }), { headers: { 'Content-Type': 'application/json' } });
};
