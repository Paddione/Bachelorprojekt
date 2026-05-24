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
  } catch (e) {
    return new Response(JSON.stringify({ error: 'K8s client failed', details: (e as Error).message }), { status: 503 });
  }

  const results: any = {
    cluster: process.env.BRAND_ID || 'mentolder',
    health: { nodes: 0, pods: 0, status: 'ok' },
    flux: { kustomizations: [], imagePolicies: [] }
  };

  try {
    // Basic Health
    const nodes = await k8s.get('/api/v1/nodes');
    results.health.nodes = nodes.items.length;
    
    const pods = await k8s.get('/api/v1/pods?limit=1'); // Just to check if we can list
    // In a real scenario, we might want a count, but listing all pods is expensive.
    // For now, we'll just report node count as a proxy for health.
  } catch (e) {
    results.health.status = 'error';
    results.health.error = (e as Error).message;
  }

  // FluxCD Status (both clusters run FluxCD)
  try {
    const ks = await k8s.get('/apis/kustomize.toolkit.fluxcd.io/v1/kustomizations');
    results.flux.kustomizations = ks.items.map((item: any) => ({
      name: item.metadata.name,
      namespace: item.metadata.namespace,
      status: item.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True' ? 'ready' : 'error',
      message: item.status?.conditions?.find((c: any) => c.type === 'Ready')?.message,
      lastAttempt: item.status?.lastHandledReconcileAt || item.status?.lastAppliedRevision
    }));

    const ip = await k8s.get('/apis/image.toolkit.fluxcd.io/v1/imagepolicies');
    results.flux.imagePolicies = ip.items.map((item: any) => ({
      name: item.metadata.name,
      namespace: item.metadata.namespace,
      latestImage: item.status?.latestImage,
      status: item.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True' ? 'ready' : 'error'
    }));
  } catch (e) {
    results.flux.error = 'FluxCD resources not available or error fetching';
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' }
  });
};
