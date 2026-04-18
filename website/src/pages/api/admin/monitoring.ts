import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import https from 'node:https';
import { getSession, isAdmin } from '../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
    const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

    let k8sToken = '';
    let caCert = '';

    try {
      k8sToken = await fs.readFile(tokenPath, 'utf-8');
      caCert = await fs.readFile(caPath, 'utf-8');
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Kein Service-Account-Token gefunden. Bitte RBAC für den website-Pod konfigurieren.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const httpsAgent = new https.Agent({
      ca: caCert,
    });

    const fetchK8s = async (path: string) => {
      const res = await fetch(`https://kubernetes.default.svc${path}`, {
        headers: {
          Authorization: `Bearer ${k8sToken}`,
          Accept: 'application/json',
        },
        // @ts-ignore - node-fetch specific
        agent: httpsAgent,
      });
      if (!res.ok) {
        throw new Error(`Kubernetes API error: ${res.status} ${res.statusText}`);
      }
      return res.json();
    };

    // Parallel fetches
    const [podsData, eventsData, podMetricsResult, nodeMetricsResult] = await Promise.allSettled([
      fetchK8s('/api/v1/namespaces/workspace/pods'),
      fetchK8s('/api/v1/namespaces/workspace/events'),
      fetchK8s('/apis/metrics.k8s.io/v1beta1/namespaces/workspace/pods'),
      fetchK8s('/apis/metrics.k8s.io/v1beta1/nodes'),
    ]);

    if (podsData.status === 'rejected') throw podsData.reason;
    if (eventsData.status === 'rejected') throw eventsData.reason;

    const metricsAvailable = podMetricsResult.status === 'fulfilled' && nodeMetricsResult.status === 'fulfilled';
    const podMetrics = metricsAvailable ? (podMetricsResult as PromiseFulfilledResult<any>).value : null;
    const nodeMetrics = metricsAvailable ? (nodeMetricsResult as PromiseFulfilledResult<any>).value : null;

    const pods = podsData.value.items.map((pod: any) => {
      const name = pod.metadata.labels?.app || pod.metadata.name;
      const phase = pod.status.phase;
      
      // Calculate ready status and restarts
      let ready = false;
      let restarts = 0;
      if (pod.status.containerStatuses) {
        ready = pod.status.containerStatuses.every((c: any) => c.ready);
        restarts = pod.status.containerStatuses.reduce((acc: number, c: any) => acc + c.restartCount, 0);
      }

      // Find metrics if available
      let cpu = undefined;
      let memory = undefined;
      if (metricsAvailable && podMetrics) {
        const metrics = podMetrics.items.find((m: any) => m.metadata.name === pod.metadata.name);
        if (metrics && metrics.containers && metrics.containers.length > 0) {
           const cpuUsage = metrics.containers.reduce((acc: number, c: any) => {
              const val = c.usage.cpu;
              if (val.endsWith('n')) return acc + parseInt(val) / 1000000;
              if (val.endsWith('u')) return acc + parseInt(val) / 1000;
              if (val.endsWith('m')) return acc + parseInt(val);
              return acc;
           }, 0);
           cpu = `${Math.round(cpuUsage)}m`;

           const memUsage = metrics.containers.reduce((acc: number, c: any) => {
              const val = c.usage.memory;
              if (val.endsWith('Ki')) return acc + parseInt(val) / 1024;
              if (val.endsWith('Mi')) return acc + parseInt(val);
              if (val.endsWith('Gi')) return acc + parseInt(val) * 1024;
              return acc;
           }, 0);
           memory = `${Math.round(memUsage)}Mi`;
        }
      }

      return {
        name,
        phase,
        ready,
        restarts,
        ...(cpu && { cpu }),
        ...(memory && { memory })
      };
    });

    const events = eventsData.value.items
      .sort((a: any, b: any) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
      .slice(0, 10)
      .map((event: any) => {
        const ageMs = Date.now() - new Date(event.lastTimestamp).getTime();
        const ageMins = Math.floor(ageMs / 60000);
        const age = ageMins < 60 ? `${ageMins}m` : `${Math.floor(ageMins/60)}h`;

        return {
          type: event.type,
          reason: event.reason,
          object: event.involvedObject.name,
          message: event.message,
          age
        };
      });

    let node = undefined;
    if (metricsAvailable && nodeMetrics && nodeMetrics.items.length > 0) {
        // Simplified node metrics mapping
        node = {
            cpu: "N/A", // Calculating percentages requires node capacity, omitting for simplicity or hardcoding if capacity is known
            memory: "N/A"
        };
        // A more complex implementation would fetch /api/v1/nodes to get capacity and compute %
    }

    return new Response(JSON.stringify({
      pods,
      events,
      ...(node && { node }),
      metricsAvailable,
      fetchedAt: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const msg = error.code === 'ECONNREFUSED'
      ? 'Kubernetes API-Server nicht erreichbar. Bitte Netzwerkrichtlinien und RBAC prüfen.'
      : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
