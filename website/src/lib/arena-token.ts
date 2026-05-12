const ISSUER_BY_BRAND: Record<string, string> = {
  mentolder:  'https://auth.mentolder.de/realms/workspace',
  korczewski: 'https://auth.korczewski.de/realms/workspace',
};

export interface ArenaToken {
  token: string;
  expiresIn: number;
}

export type ArenaTokenError =
  | { kind: 'token-exchange-failed'; status: number };

export async function mintArenaToken(userAccessToken: string): Promise<ArenaToken | ArenaTokenError> {
  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder') as 'mentolder' | 'korczewski';
  const issuer = ISSUER_BY_BRAND[brand];

  const res = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: 'arena',
      subject_token: userAccessToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience: 'arena',
    }),
  });

  if (!res.ok) {
    return { kind: 'token-exchange-failed', status: res.status };
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  return { token: json.access_token, expiresIn: json.expires_in };
}
