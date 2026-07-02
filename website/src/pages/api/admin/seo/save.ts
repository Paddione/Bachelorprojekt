import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { publishContent } from '../../../../lib/content-publish';
import { publishResultToResponse } from '../../../../lib/content-publish-handler';
import { bundleSeo } from '../../../../lib/content-bundle';
import type { SeoContent, SeoPageKey } from '../../../../content-schema';

// Persists per-page-key SEO overrides (title, meta-description, og-image).
// T001490 routes the save through the bot-PR publish pipeline instead of
// writing per-key rows to `site_settings`. We merge the editor's per-key
// delta into the build-time bundle so the published `seo.json` is a full
// SeoContent payload (Zod validates the merged shape fail-closed).
const BRAND = process.env.BRAND || 'mentolder';

const PAGE_KEYS: ReadonlyArray<SeoPageKey> = [
  'home', 'leistungen', 'kontakt', 'faq', 'ueber-mich', 'referenzen',
  'impressum', 'datenschutz',
];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mergeSeo(current: SeoContent, patch: {
  pageKey: string;
  description?: string;
  title?: string;
  ogImage?: string;
}): SeoContent {
  const titles = { ...current.titles };
  const descriptions = { ...current.descriptions };
  const ogImages = { ...current.ogImages };
  if (typeof patch.title === 'string') {
    if (patch.title.trim()) titles[patch.pageKey] = patch.title;
    else delete titles[patch.pageKey];
  }
  if (typeof patch.description === 'string') {
    descriptions[patch.pageKey] = patch.description;
  }
  if (typeof patch.ogImage === 'string') {
    if (patch.ogImage.trim()) ogImages[patch.pageKey] = patch.ogImage;
    else delete ogImages[patch.pageKey];
  }
  return { titles, descriptions, ogImages };
}

export const POST: APIRoute = async (ctx) => {
  const { request, locals } = ctx;
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  let raw: { pageKey?: string; description?: string; title?: string; ogImage?: string; baseSha?: string };
  try {
    raw = await request.json() as typeof raw;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }
  if (!raw || typeof raw.pageKey !== 'string' || !raw.pageKey) {
    return jsonResponse(400, { error: 'pageKey is required' });
  }
  if (!(PAGE_KEYS as readonly string[]).includes(raw.pageKey)) {
    return jsonResponse(400, { error: `unknown pageKey ${raw.pageKey}` });
  }
  if (raw.description !== undefined && typeof raw.description !== 'string') {
    return jsonResponse(400, { error: 'description must be a string' });
  }
  if (raw.title !== undefined && typeof raw.title !== 'string') {
    return jsonResponse(400, { error: 'title must be a string' });
  }
  if (raw.ogImage !== undefined && typeof raw.ogImage !== 'string') {
    return jsonResponse(400, { error: 'ogImage must be a string' });
  }
  // Merge into the current bundle (read at build-time), then publish the
  // full SeoContent. publishContent reads the live current SHA via GitHub
  // for optimistic concurrency.
  const current = bundleSeo(BRAND);
  const payload = mergeSeo(current, {
    pageKey: raw.pageKey,
    description: raw.description,
    title: raw.title,
    ogImage: raw.ogImage,
  });
  const editor = session.email ?? session.name ?? 'unknown';
  const baseSha = typeof raw.baseSha === 'string' && raw.baseSha ? raw.baseSha : null;
  try {
    const result = await publishContent({
      brand: BRAND,
      domain: 'seo',
      payload,
      baseSha,
      editor,
    });
    return publishResultToResponse(result);
  } catch (e) {
    locals.requestLogger?.error({ e }, 'seo save failed');
    return jsonResponse(500, { error: 'publish failed' });
  }
};
