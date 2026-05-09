import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = await request.json().catch(() => ({}));
  const app = body.app as string;
  const hard = body.hard === true;

  if (!app || !/^[a-z0-9-]+$/.test(app)) {
    return new Response(JSON.stringify({ error: 'Ungültiger App-Name' }), { status: 400 });
  }

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  await k8s.patch(`/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/${app}`, {
    operation: {
      sync: {
        revision: 'HEAD',
        prune: false,
        dryRun: false,
        force: hard,
      },
    },
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
