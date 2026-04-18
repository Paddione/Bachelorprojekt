import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../lib/k8s';
import { getSession, isAdmin } from '../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let k8s;
  try {
    k8s = await createK8sClient();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Kein Service-Account-Token gefunden. Bitte RBAC für den website-Pod konfigurieren.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const [podsData, eventsData, podMetricsResult, nodeMetricsResult] = await Promise.allSettled([
      k8s.get('/api/v1/namespaces/workspace/pods'),
      k8s.get('/api/v1/namespaces/workspace/events'),
      k8s.get('/apis/metrics.k8s.io/v1beta1/namespaces/workspace/pods'),
      k8s.get('/apis/metrics.k8s.io/v1beta1/nodes'),
    ]);

    if (podsData.status === 'rejected') throw podsData.reason;
    if (eventsData.status === 'rejected') throw eventsData.reason;

    const metricsAvailable =
      podMetricsResult.status === 'fulfilled' && nodeMetricsResult.status === 'fulfilled';
    const podMetrics = metricsAvailable ? (podMetricsResult as PromiseFulfilledResult<any>).value : null;
    const nodeMetrics = metricsAvailable ? (nodeMetricsResult as PromiseFulfilledResult<any>).value : null;

    const pods = podsData.value.items.map((pod: any) => {
      const name = pod.metadata.labels?.app || pod.metadata.name;
      const phase = pod.status.phase;
      let ready = false;
      let restarts = 0;
      if (pod.status.containerStatuses) {
        ready = pod.status.containerStatuses.every((c: any) => c.ready);
        restarts = pod.status.containerStatuses.reduce(
          (acc: number, c: any) => acc + c.restartCount, 0
        );
      }
      let cpu = undefined;
      let memory = undefined;
      if (metricsAvailable && podMetrics) {
        const metrics = podMetrics.items.find((m: any) => m.metadata.name === pod.metadata.name);
        if (metrics?.containers?.length > 0) {
          const cpuUsage = metrics.containers.reduce((acc: number, c: any) => {
            const val = c.usage?.cpu;
            if (!val) return acc;
            if (val.endsWith('n')) return acc + parseInt(val) / 1_000_000;
            if (val.endsWith('u')) return acc + parseInt(val) / 1000;
            if (val.endsWith('m')) return acc + parseInt(val);
            return acc + parseInt(val) * 1000;
          }, 0);
          cpu = `${Math.round(cpuUsage)}m`;
          const memUsage = metrics.containers.reduce((acc: number, c: any) => {
            const val = c.usage?.memory;
            if (!val) return acc;
            if (val.endsWith('Ki')) return acc + parseInt(val) / 1024;
            if (val.endsWith('Mi')) return acc + parseInt(val);
            if (val.endsWith('Gi')) return acc + parseInt(val) * 1024;
            return acc;
          }, 0);
          memory = `${Math.round(memUsage)}Mi`;
        }
      }
      return { name, phase, ready, restarts, ...(cpu && { cpu }), ...(memory && { memory }) };
    });

    const events = eventsData.value.items
      .sort((a: any, b: any) => {
        const tA = new Date(a.lastTimestamp ?? a.eventTime ?? 0).getTime();
        const tB = new Date(b.lastTimestamp ?? b.eventTime ?? 0).getTime();
        return tB - tA;
      })
      .slice(0, 10)
      .map((event: any) => {
        const ts = event.lastTimestamp ?? event.eventTime;
        const ageMs = ts ? Date.now() - new Date(ts).getTime() : 0;
        const ageMins = Math.floor(ageMs / 60000);
        const age = ageMins < 60 ? `${ageMins}m` : `${Math.floor(ageMins / 60)}h`;
        return {
          type: event.type,
          reason: event.reason,
          object: event.involvedObject.name,
          message: event.message,
          age,
        };
      });

    // Node metrics — N/A placeholder; fixed in Task 2
    let node = undefined;
    if (metricsAvailable && nodeMetrics?.items?.length > 0) {
      node = { cpu: 'N/A', memory: 'N/A' };
    }

    return new Response(
      JSON.stringify({ pods, events, ...(node && { node }), metricsAvailable, fetchedAt: new Date().toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    const msg =
      error.code === 'ECONNREFUSED'
        ? 'Kubernetes API-Server nicht erreichbar. Bitte Netzwerkrichtlinien und RBAC prüfen.'
        : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
