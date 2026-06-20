import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

const cache = new Map<string, JWTVerifyGetKey>();

export function getJwks(issuer: string): JWTVerifyGetKey {
  const cached = cache.get(issuer);
  if (cached) return cached;
  const url = new URL(`${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`);
  const jwks = createRemoteJWKSet(url);
  cache.set(issuer, jwks);
  return jwks;
}
