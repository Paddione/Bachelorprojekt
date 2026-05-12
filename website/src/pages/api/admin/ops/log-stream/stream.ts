import type { APIRoute } from 'astro';
import https from 'node:https';
import { readK8sCredentials } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

const ALLOWED_NS = ['workspace', 'workspace-korczewski', 'argocd', 'website', 'website-korczewski'];

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const ns = url.searchParams.get('ns') ?? 'workspace';
  const pod = url.searchParams.get('pod') ?? '';
  const container = url.searchParams.get('container') ?? '';
  const tail = Math.min(parseInt(url.searchParams.get('tail') ?? '200'), 1000);

  if (!ALLOWED_NS.includes(ns) || !pod || !/^[a-z0-9-]+$/.test(pod.split('-').join(''))) {
    return new Response('Ungültige Parameter', { status: 400 });
  }

  if (container && !/^[a-z0-9-]+$/.test(container)) {
    return new Response('Ungültiger Container-Name', { status: 400 });
  }

  let creds: { token: string; ca: string };
  try { creds = await readK8sCredentials(); }
  catch { return new Response('Kein Service-Account-Token.', { status: 503 }); }

  const logPath = `/api/v1/namespaces/${ns}/pods/${pod}/log?follow=true&tailLines=${tail}${container ? `&container=${container}` : ''}`;
  const encoder = new TextEncoder();

  let k8sReq: ReturnType<typeof https.request> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      k8sReq = https.request(
        {
          hostname: 'kubernetes.default.svc.cluster.local',
          path: logPath,
          method: 'GET',
          headers: { Authorization: `Bearer ${creds.token}`, Accept: 'text/plain' },
          ca: creds.ca,
        },
        (res) => {
          res.on('data', (chunk: Buffer) => {
            const lines = chunk.toString().split('\n').filter(Boolean);
            for (const line of lines) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(line)}\n\n`));
            }
          });
          res.on('end', () => { controller.enqueue(encoder.encode('data: {"_eof":true}\n\n')); controller.close(); });
          res.on('error', (e) => controller.error(e));
        }
      );
      k8sReq.on('error', (e) => controller.error(e));
      k8sReq.end();
    },
    cancel() { k8sReq?.destroy(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
};
