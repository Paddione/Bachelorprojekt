import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listHardwareAssets } from '../../../../lib/platform-db';
import { createK8sClient, type K8sClient } from '../../../../lib/k8s';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const assets = await listHardwareAssets();

    // Enrich with k8s node status if possible
    let k8s: K8sClient | undefined;
    try {
      k8s = await createK8sClient();
    } catch (e) {
      locals.requestLogger.warn({ err: e }, '[api/admin/platform/hardware] k8s client init failed');
    }

    const currentCluster = process.env.BRAND_ID || 'mentolder';
    const enrichedAssets = await Promise.all(assets.map(async (asset) => {
      let liveStatus = 'unknown';
      let readyStatus = 'Unknown';

      if (k8s && asset.cluster === currentCluster && asset.k8s_node_name) {
        try {
          const node = await k8s.get<{ status?: { conditions?: Array<{ type: string; status: string }> } }>(`/api/v1/nodes/${asset.k8s_node_name}`);
          const readyCond = node.status?.conditions?.find((c) => c.type === 'Ready');
          readyStatus = readyCond?.status || 'Unknown';
          liveStatus = readyStatus === 'True' ? 'ready' : 'failing';
        } catch {
          liveStatus = 'missing';
        }
      }

      return {
        ...asset,
        live_status: liveStatus,
        ready_status: readyStatus
      };
    }));

    return new Response(JSON.stringify({ assets: enrichedAssets }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
};
