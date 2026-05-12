import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';

const ISSUER_BY_BRAND: Record<string, string> = {
  mentolder:  'https://auth.mentolder.de/realms/workspace',
  korczewski: 'https://auth.korczewski.de/realms/workspace',
};

export const POST: APIRoute = async (ctx) => {
  const user = await getSession(ctx.request.headers.get('cookie'));
  if (!user) return new Response('unauthorised', { status: 401 });

  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder') as 'mentolder' | 'korczewski';
  const issuer = ISSUER_BY_BRAND[brand];

  // Token exchange against the user's home realm, requesting aud=arena.
  const tokenUrl = `${issuer}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: 'arena',
    subject_token: user.access_token,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    audience: 'arena',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'token-exchange-failed', status: res.status }), {
      status: 502, headers: { 'content-type': 'application/json' },
    });
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  return new Response(JSON.stringify({ token: json.access_token, expiresIn: json.expires_in }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};