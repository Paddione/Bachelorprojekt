import type { APIRoute } from 'astro';
import { unsubscribeByToken } from '../../../lib/newsletter-db';

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token') ?? '';
  if (!token) {
    return new Response('Ungültiger Abmeldelink.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const success = await unsubscribeByToken(token);

  return new Response(
    success
      ? 'Du wurdest erfolgreich vom Newsletter abgemeldet.'
      : 'Ungültiger oder bereits verarbeiteter Abmeldelink.',
    {
      status: success ? 200 : 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }
  );
};
