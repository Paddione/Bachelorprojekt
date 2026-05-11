import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { log } from '../log';

interface CacheEntry { jwks: JWTVerifyGetKey; expiresAt: number; }

const TTL_MS = 60 * 60 * 1000; // 1h
const cache = new Map<string, CacheEntry>();

export function getJwks(issuer: string): JWTVerifyGetKey {
  const now = Date.now();
  const hit = cache.get(issuer);
  if (hit && hit.expiresAt > now) return hit.jwks;
  const url = new URL(`${issuer}/protocol/openid-connect/certs`);
  const jwks = createRemoteJWKSet(url, {
    cooldownDuration: 30_000,
    cacheMaxAge: TTL_MS,
  });
  cache.set(issuer, { jwks, expiresAt: now + TTL_MS });
  log.info({ issuer }, 'jwks cache populated');
  return jwks;
}

export function _resetJwksCache() { cache.clear(); }