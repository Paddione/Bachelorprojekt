import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../lib/k8s';
import { getSession, isAdmin } from '../../../lib/auth';

interface K8sContainerStatus { ready: boolean; restartCount: number }
interface K8sPod {
  metadata: { name: string; labels?: Record<string, string> };
  status: { phase: string; containerStatuses?: K8sContainerStatus[] };
}
interface K8sMetricContainer { usage?: { cpu?: string; memory?: string } }
interface K8sPodMetric { metadata: { name: string }; containers?: K8sMetricContainer[] }
interface K8sEvent {
  type: string;
  reason: string;
  message: string;
  lastTimestamp?: string;
  eventTime?: string;
  involvedObject: { name: string };
}
interface K8sNodeMetric { metadata: { name: string }; usage: { cpu: string; memory: string } }
interface K8sNode { metadata: { name: string }; status: { capacity: { cpu: string; memory: string } } }
interface K8sList<T> { items: T[] }

function parseCpuToNano(val: string): number {
  if (val.endsWith('n')) return parseInt(val);
  if (val.endsWith('u')) return parseInt(val) * 1_000;
  if (val.endsWith('m')) return parseInt(val) * 1_000_000;
  return parseInt(val) * 1_000_000_000; // whole cores e.g. "4"
}

function parseMemToKi(val: string): number {
  if (val.endsWith('Ki')) return parseInt(val);
  if (val.endsWith('Mi')) return parseInt(val) * 1024;
  if (val.endsWith('Gi')) return parseInt(val) * 1024 * 1024;
  return Math.round(parseInt(val) / 1024); // bytes fallback
}

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

  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();
  const ns = brand === 'korczewski' ? 'workspace-korczewski' : 'workspace';

  try {
    const [podsData, eventsData, podMetricsResult, nodeMetricsResult, nodeCapacityResult] =
      await Promise.allSettled([
        k8s.get<K8sList<K8sPod>>(`/api/v1/namespaces/${ns}/pods`),
        k8s.get<K8sList<K8sEvent>>(`/api/v1/namespaces/${ns}/events`),
        k8s.get<K8sList<K8sPodMetric>>(`/apis/metrics.k8s.io/v1beta1/namespaces/${ns}/pods`),
        k8s.get<K8sList<K8sNodeMetric>>('/apis/metrics.k8s.io/v1beta1/nodes'),
        k8s.get<K8sList<K8sNode>>('/api/v1/nodes'),
      ]);

    if (podsData.status === 'rejected') throw podsData.reason;
    if (eventsData.status === 'rejected') throw eventsData.reason;

    const metricsAvailable =
      podMetricsResult.status === 'fulfilled' && nodeMetricsResult.status === 'fulfilled';
    const podMetrics = metricsAvailable
      ? (podMetricsResult as PromiseFulfilledResult<K8sList<K8sPodMetric>>).value
      : null;
    const nodeMetrics = metricsAvailable
      ? (nodeMetricsResult as PromiseFulfilledResult<K8sList<K8sNodeMetric>>).value
      : null;

    const pods = (podsData.value.items as K8sPod[]).map((pod: K8sPod) => {
      const name = pod.metadata.labels?.app || pod.metadata.name;
      const phase = pod.status.phase;
      let ready = false;
      let restarts = 0;
      if (pod.status.containerStatuses) {
        ready = pod.status.containerStatuses.every((c: K8sContainerStatus) => c.ready);
        restarts = pod.status.containerStatuses.reduce(
          (acc: number, c: K8sContainerStatus) => acc + c.restartCount, 0
        );
      }
      let cpu = undefined;
      let memory = undefined;
      if (metricsAvailable && podMetrics) {
        const metrics = podMetrics.items.find((m) => m.metadata.name === pod.metadata.name);
        const containers = metrics?.containers ?? [];
        if (containers.length > 0) {
          const cpuUsage = containers.reduce((acc, c) => {
            const val = c.usage?.cpu;
            if (!val) return acc;
            if (val.endsWith('n')) return acc + parseInt(val) / 1_000_000;
            if (val.endsWith('u')) return acc + parseInt(val) / 1000;
            if (val.endsWith('m')) return acc + parseInt(val);
            return acc + parseInt(val) * 1000;
          }, 0);
          cpu = `${Math.round(cpuUsage)}m`;
          const memUsage = containers.reduce((acc, c) => {
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

    const events = (eventsData.value.items as K8sEvent[])
      .sort((a: K8sEvent, b: K8sEvent) => {
        const tA = new Date(a.lastTimestamp ?? a.eventTime ?? 0).getTime();
        const tB = new Date(b.lastTimestamp ?? b.eventTime ?? 0).getTime();
        return tB - tA;
      })
      .slice(0, 10)
      .map((event: K8sEvent) => {
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

    const nodes: Array<{ name: string; cpu: string; memory: string }> = [];
    if (
      metricsAvailable &&
      (nodeMetrics?.items?.length ?? 0) > 0 &&
      nodeCapacityResult.status === 'fulfilled' &&
      nodeCapacityResult.value?.items?.length > 0
    ) {
      const capacityItems = (nodeCapacityResult as PromiseFulfilledResult<K8sList<K8sNode>>).value.items;
      for (const nodeMetric of nodeMetrics!.items) {
        const nodeName = nodeMetric.metadata.name;
        const capacityItem = capacityItems.find((n: K8sNode) => n.metadata.name === nodeName);
        if (!capacityItem) continue;
        const cpuPercent = Math.round(
          (parseCpuToNano(nodeMetric.usage.cpu) / parseCpuToNano(capacityItem.status.capacity.cpu)) * 100
        );
        const memPercent = Math.round(
          (parseMemToKi(nodeMetric.usage.memory) / parseMemToKi(capacityItem.status.capacity.memory)) * 100
        );
        nodes.push({
          name: nodeName,
          cpu: `${Math.min(cpuPercent, 100)}%`,
          memory: `${Math.min(memPercent, 100)}%`,
        });
      }
    }

    return new Response(
      JSON.stringify({ pods, events, nodes, metricsAvailable, fetchedAt: new Date().toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const e = error as { code?: string; message?: string };
    const msg =
      e.code === 'ECONNREFUSED'
        ? 'Kubernetes API-Server nicht erreichbar. Bitte Netzwerkrichtlinien und RBAC prüfen.'
        : (e.message ?? 'Unbekannter Fehler');
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
