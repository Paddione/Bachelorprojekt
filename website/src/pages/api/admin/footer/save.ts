import type { APIRoute } from 'astro';
import { handleAdminSave } from '../../../../lib/content-publish-handler';

// Persists the editable footer (columns + copyright) as JSON content.
// Contact data and the auto-generated Angebote column are resolved at
// render time, so only columns/copyright are stored here. Save goes
// through the bot-PR publish pipeline (T001490).
const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async (ctx) =>
  handleAdminSave(ctx, { brand: BRAND, domain: 'footer' });
