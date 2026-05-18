import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../lib/auth';

const NAMESPACES = ['workspace', 'workspace-korczewski', 'website', 'website-korczewski'];

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
        k8s.get(
          `/api/v1/namespaces/${ns}/events?fieldSelector=type%3DWarning&limit=100`
        ).then((data: any) =>
          (data.items ?? []).map((e: any) => ({
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
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message ?? 'Unbekannter Fehler' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
