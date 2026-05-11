import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { verifyArenaJwt } from './jwt';

let pair: { publicKey: CryptoKey; privateKey: CryptoKey };
let jwk: any;

beforeAll(async () => {
  pair = await generateKeyPair('RS256');
  jwk = await exportJWK(pair.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
});

async function makeToken(opts: { iss: string; aud?: string; roles?: string[]; exp?: number }) {
  return new SignJWT({
    realm_access: { roles: opts.roles ?? [] },
    preferred_username: 'patrick',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(opts.iss)
    .setAudience(opts.aud ?? 'arena')
    .setSubject('user-uuid-1')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 60)
    .sign(pair.privateKey);
}

describe('verifyArenaJwt', () => {
  it('accepts a token from a trusted issuer with aud=arena', async () => {
    const issuer = 'https://auth.mentolder.de/realms/workspace';
    const token = await makeToken({ iss: issuer, roles: ['arena_admin'] });
    const claims = await verifyArenaJwt(token, {
      trustedIssuers: [{ url: issuer, brand: 'mentolder' }],
      keyResolver: async () => pair.publicKey,
    });
    expect(claims.sub).toBe('user-uuid-1');
    expect(claims.brand).toBe('mentolder');
    expect(claims.realmRoles).toContain('arena_admin');
  });

  it('rejects untrusted issuer', async () => {
    const token = await makeToken({ iss: 'https://evil.example.com/' });
    await expect(verifyArenaJwt(token, {
      trustedIssuers: [{ url: 'https://auth.mentolder.de/realms/workspace', brand: 'mentolder' }],
      keyResolver: async () => pair.publicKey,
    })).rejects.toThrow(/untrusted issuer/i);
  });

  it('rejects wrong audience', async () => {
    const issuer = 'https://auth.mentolder.de/realms/workspace';
    const token = await makeToken({ iss: issuer, aud: 'other' });
    await expect(verifyArenaJwt(token, {
      trustedIssuers: [{ url: issuer, brand: 'mentolder' }],
      keyResolver: async () => pair.publicKey,
    })).rejects.toThrow();
  });
});