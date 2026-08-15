import type { APIRoute } from 'astro';
import { handleAdminSave } from '../../../../lib/content-publish-handler';

// Persists the editable referenzen config (heading/subheading/types/items).
// T001490 routes the save through the bot-PR publish pipeline (blob-SHA
// optimistic concurrency + squash-auto-merge PR) instead of writing to
// `site_settings`.
const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async (ctx) =>
  handleAdminSave(ctx, { brand: BRAND, domain: 'referenzen' });
