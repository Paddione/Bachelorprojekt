import type { APIRoute } from 'astro';
import { handleAdminSave } from '../../../../lib/content-publish-handler';

// Persists the editable main navigation. T001490 routes the save
// through the bot-PR publish pipeline (blob-SHA optimistic concurrency
// + squash-auto-merge PR) instead of `setJsonSetting(NAV_KEY, …)`.
const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async (ctx) =>
  handleAdminSave(ctx, { brand: BRAND, domain: 'navigation' });
