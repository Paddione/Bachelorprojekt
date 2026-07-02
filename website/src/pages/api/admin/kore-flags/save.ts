import type { APIRoute } from 'astro';
import { handleAdminSave } from '../../../../lib/content-publish-handler';

// Persists the Kore (korczewski) homepage feature toggles. T001490
// routes the save through the bot-PR publish pipeline (blob-SHA
// optimistic concurrency + squash-auto-merge PR) instead of writing
// `KORE_FLAGS_KEY` to `site_settings`.
const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async (ctx) =>
  handleAdminSave(ctx, { brand: BRAND, domain: 'kore-flags' });
