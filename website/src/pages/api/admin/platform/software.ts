import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listSoftwareAssets, upsertSoftwareAsset } from '../../../../lib/platform-db';
import { createK8sClient } from '../../../../lib/k8s';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const assets = await listSoftwareAssets();
    
    // Enrich with k8s status if possible
    let k8s;
    try {
      k8s = await createK8sClient();
    } catch (e) {
      console.warn('[api/admin/platform/software] k8s client init failed:', e.message);
    }

    const currentCluster = process.env.BRAND_ID || 'mentolder';
    const enrichedAssets = await Promise.all(assets.map(async (asset) => {
      let liveStatus = 'unknown';
      let readyReplicas = 0;
      let totalReplicas = 0;

      if (k8s && asset.clusters.includes(currentCluster) && asset.namespace && asset.deployment_name) {
        try {
          const dep = await k8s.get(`/apis/apps/v1/namespaces/${asset.namespace}/deployments/${asset.deployment_name}`);
          readyReplicas = dep.status?.readyReplicas || 0;
          totalReplicas = dep.spec?.replicas || 0;
          liveStatus = readyReplicas > 0 ? (readyReplicas >= totalReplicas ? 'ready' : 'degraded') : 'failing';
        } catch (e) {
          liveStatus = 'missing';
        }
      }

      return {
        ...asset,
        live_status: liveStatus,
        replicas: { ready: readyReplicas, total: totalReplicas }
      };
    }));

    return new Response(JSON.stringify({ assets: enrichedAssets }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const asset = await request.json();
    const result = await upsertSoftwareAsset(asset);
    return new Response(JSON.stringify(result), { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
