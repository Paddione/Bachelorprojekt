import type { APIRoute } from 'astro';
export const POST: APIRoute = async () => new Response('Stripe removed', { status: 410 });
