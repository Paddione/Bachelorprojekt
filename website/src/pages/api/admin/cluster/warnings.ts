import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../lib/auth';

const NAMESPACES = ['workspace', 'workspace-korczewski', 'website', 'website-korczewski'];

interface K8sEvent {
  type?: string;
  reason?: string;
  message?: string;
  lastTimestamp?: string;
  eventTime?: string;
  count?: number;
  involvedObject?: { kind?: string; name?: string };
}
interface K8sEventList { items?: K8sEvent[] }

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
      JSON.stringify({ error: 'Kein Service-Account-Token gefunden.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const results = await Promise.allSettled(
      NAMESPACES.map((ns) =>
        k8s.get<K8sEventList>(
          `/api/v1/namespaces/${ns}/events?fieldSelector=type%3DWarning&limit=100`
        ).then((data: K8sEventList) =>
          (data.items ?? []).map((e: K8sEvent) => ({
            namespace: ns,
            type: e.type as string,
            reason: e.reason as string,
            object: `${e.involvedObject?.kind ?? ''}/${e.involvedObject?.name ?? ''}`,
            message: e.message as string,
            ts: (e.lastTimestamp ?? e.eventTime ?? '') as string,
            count: (e.count ?? 1) as number,
          }))
        )
      )
    );

    const warnings = results
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 200);

    return new Response(JSON.stringify({ warnings }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
