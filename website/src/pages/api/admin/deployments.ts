import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../lib/k8s';
import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';
import { recordAudit, clientIpFromRequest } from '../../../lib/audit-log';

type DeploymentStatus = 'healthy' | 'degraded' | 'stopped';

function deploymentStatus(desired: number, ready: number): DeploymentStatus {
  if (desired === 0) return 'stopped';
  if (ready === desired) return 'healthy';
  return 'degraded';
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let k8s: Awaited<ReturnType<typeof createK8sClient>>;
  try {
    k8s = await createK8sClient();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Kein Service-Account-Token gefunden.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();
  const ns = brand === 'korczewski' ? 'workspace-korczewski' : 'workspace';

  try {
    interface K8sDeployment {
      metadata: { name: string };
      spec?: { replicas?: number };
      status?: { readyReplicas?: number; availableReplicas?: number };
    }
    const data = await k8s.get<{ items?: K8sDeployment[] }>(`/apis/apps/v1/namespaces/${ns}/deployments`);
    const deployments = (data.items ?? []).map((d: K8sDeployment) => {
      const desired: number = d.spec?.replicas ?? 1;
      const ready: number = d.status?.readyReplicas ?? 0;
      const available: number = d.status?.availableReplicas ?? 0;
      return {
        name: d.metadata.name,
        desired,
        ready,
        available,
        status: deploymentStatus(desired, ready),
      };
    });
    recordAudit(pool, { actor_id: session!.sub, actor_email: session!.email, action: 'deployment.list', ip: clientIpFromRequest(request) });
    return new Response(JSON.stringify({ deployments }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
