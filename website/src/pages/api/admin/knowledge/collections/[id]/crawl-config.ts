import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getCollection, updateCrawlConfig, type CrawlConfig } from '../../../../../../lib/knowledge-db';

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id!;
  const c = await getCollection(id);
  if (!c) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
  if (c.source !== 'web_crawl') {
    return new Response(
      JSON.stringify({ error: 'crawl_config ist nur für web_crawl-Sammlungen relevant' }),
      { status: 400 },
    );
  }

  const body = await request.json() as Partial<CrawlConfig>;

  if (typeof body.startUrl !== 'string' || !body.startUrl.trim()) {
    return new Response(JSON.stringify({ error: 'startUrl erforderlich' }), { status: 400 });
  }

  let parsedUrl: URL;
  try { parsedUrl = new URL(body.startUrl); } catch {
    return new Response(JSON.stringify({ error: 'startUrl ist keine gültige URL' }), { status: 400 });
  }

  // T005900: javascript:/data:/… sind parsebar, aber kein Link-Schema für einen
  // Crawl-Ausgangspunkt — nur http/https persistieren (Stored-XSS-Vektor).
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'startUrl muss http/https sein' }), { status: 400 });
  }

  const config: CrawlConfig = {
    startUrl:       body.startUrl.trim(),
    maxDepth:       body.maxDepth   ?? c.crawl_config?.maxDepth   ?? 3,
    maxPages:       body.maxPages   ?? c.crawl_config?.maxPages   ?? 200,
    includePattern: body.includePattern ?? c.crawl_config?.includePattern ?? undefined,
    userAgent:      body.userAgent  ?? c.crawl_config?.userAgent  ?? undefined,
  };

  try {
    await updateCrawlConfig(id, config);
    return new Response(JSON.stringify({ ok: true, crawl_config: config }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'not_found')
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    throw err;
  }
};
