import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { publishContent } from '../../../../lib/content-publish';
import { publishResultToResponse } from '../../../../lib/content-publish-handler';
import type { HomepageContent } from '../../../../content-schema';

const BRAND = process.env.BRAND || 'mentolder';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function publishAndRespond(
  brand: string,
  payload: HomepageContent,
  editor: string,
  baseSha: string | null,
  logger: { error?: (...args: unknown[]) => void } | undefined,
): Promise<Response> {
  try {
    const result = await publishContent({
      brand,
      domain: 'homepage',
      payload,
      baseSha,
      editor,
    });
    return publishResultToResponse(result);
  } catch (e) {
    logger?.error?.({ e }, 'startseite save failed');
    return jsonResponse(500, { error: 'publish failed' });
  }
}

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const editor = session.email ?? session.name ?? 'unknown';

  if (request.headers.get('content-type')?.includes('application/json')) {
    let body: { payload: HomepageContent; baseSha?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }
    const baseSha = typeof body.baseSha === 'string' && body.baseSha ? body.baseSha : null;
    return publishAndRespond(BRAND, body.payload, editor, baseSha, locals.requestLogger);
  }

  // Legacy form-encoded path — convert form fields to a HomepageContent
  // payload, then publish through the same pipeline (baseSha omitted).
  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  const payload: HomepageContent = {
    hero: {
      tagline: g('hero_tagline'),
      title: g('hero_title'),
      subtitle: g('hero_subtitle'),
      titleEmphasis: g('hero_title_emphasis') || undefined,
    },
    stats: Array.from({ length: parseInt(g('stats_count') || '4', 10) }, (_, i) => ({
      value: g(`stat_${i}_value`),
      label: g(`stat_${i}_label`),
    })),
    servicesHeadline: g('services_headline'),
    servicesSubheadline: g('services_subheadline'),
    whyMeHeadline: g('whyme_headline'),
    whyMeIntro: g('whyme_intro'),
    whyMePoints: Array.from({ length: parseInt(g('whyme_count') || '3', 10) }, (_, i) => ({
      title: g(`whyme_point_${i}_title`),
      text: g(`whyme_point_${i}_text`),
    })),
    avatarType: (g('avatar_type') || 'initials') as 'image' | 'initials',
    avatarSrc: g('avatar_src') || undefined,
    avatarInitials: g('avatar_initials') || undefined,
    quote: g('quote'),
    quoteName: g('quote_name'),
    processSteps: Array.from({ length: parseInt(g('process_count') || '0', 10) }, (_, i) => ({
      num: g(`process_${i}_num`),
      heading: g(`process_${i}_heading`),
      description: g(`process_${i}_description`),
    })),
  };

  const res = await publishAndRespond(BRAND, payload, editor, null, locals.requestLogger);
  if (res.status === 200) return redirect('/admin/startseite?saved=1', 303);
  return res;
};
