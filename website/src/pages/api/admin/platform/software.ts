import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listSoftwareAssets, upsertSoftwareAsset } from '../../../../lib/platform-db';
import { createK8sClient, K8sApiError, type K8sClient } from '../../../../lib/k8s';
import { resolveServiceUrl } from '../../../../lib/platform-links';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const assets = await listSoftwareAssets();
    
    // Enrich with k8s status if possible
    let k8s: K8sClient | undefined;
    try {
      k8s = await createK8sClient();
    } catch (e) {
      locals.requestLogger.warn({ err: e }, '[api/admin/platform/software] k8s client init failed');
    }

    const currentCluster = process.env.BRAND_ID || 'mentolder';
    const brandDomain = process.env.PROD_DOMAIN ?? '';
    const enrichedAssets = await Promise.all(assets.map(async (asset) => {
      let liveStatus = 'unknown';
      let readyReplicas = 0;
      let totalReplicas = 0;

      if (!asset.clusters.includes(currentCluster)) {
        // Asset lives on a different cluster or is unassigned
        liveStatus = asset.clusters.length > 0 ? 'other-cluster' : 'unknown';
      } else if (!asset.namespace || !asset.deployment_name) {
        // Infrastructure-level or external service — no k8s Deployment to probe.
        // k8s connectivity proves cluster-level services (k3s, WireGuard, Traefik DaemonSet, etc.) are alive.
        if (!k8s) {
          liveStatus = 'unknown';
        } else if (asset.base_status === 'optional') {
          liveStatus = 'optional';
        } else {
          liveStatus = 'ready';
        }
      } else if (k8s) {
        try {
          const dep = await k8s.get<{ status?: { readyReplicas?: number }; spec?: { replicas?: number } }>(`/apis/apps/v1/namespaces/${asset.namespace}/deployments/${asset.deployment_name}`);
          readyReplicas = dep.status?.readyReplicas || 0;
          totalReplicas = dep.spec?.replicas || 0;
          liveStatus = readyReplicas > 0 ? (readyReplicas >= totalReplicas ? 'ready' : 'degraded') : 'failing';
        } catch (e) {
          // 403 = RBAC denied (no-access) must not masquerade as a deleted
          // deployment (404 = missing). T000287.
          liveStatus = e instanceof K8sApiError && e.status === 403 ? 'no-access' : 'missing';
        }
      }

      return {
        ...asset,
        live_status: liveStatus,
        replicas: { ready: readyReplicas, total: totalReplicas },
        serviceUrl: resolveServiceUrl(asset, brandDomain),
      };
    }));

    return new Response(JSON.stringify({ assets: enrichedAssets }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
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
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
};
