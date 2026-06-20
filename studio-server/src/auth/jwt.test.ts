import { describe, it, expect } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK, JWK, createLocalJWKSet, type JWTVerifyGetKey } from 'jose';
import { verifyStudioJwt } from '../auth/jwt';

const ISSUER = 'https://keycloak.test/realms/workspace';
const AUDIENCE = 'studio';
const KEY_PAIR = generateKeyPair('RS256');

async function signToken(claims: Record<string, any>): Promise<string> {
  const { privateKey } = await KEY_PAIR;
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setSubject(claims.sub ?? 'user-1')
    .sign(privateKey);
}

async function makeKeyResolver(): Promise<JWTVerifyGetKey> {
  const { publicKey } = await KEY_PAIR;
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  return createLocalJWKSet({ keys: [jwk] });
}

describe('verifyStudioJwt', () => {
  it('verifies a valid token with the right issuer/audience', async () => {
    const resolver = await makeKeyResolver();
    const token = await signToken({ sub: 'user-1', preferred_username: 'gerald' });
    const claims = await verifyStudioJwt(token, {
      trustedIssuers: [{ url: ISSUER, brand: 'mentolder' }],
      audience: AUDIENCE,
      keyResolver: async () => resolver,
    });
    expect(claims.sub).toBe('user-1');
    expect(claims.brand).toBe('mentolder');
    expect(claims.preferredUsername).toBe('gerald');
  });

  it('rejects an untrusted issuer', async () => {
    const token = await signToken({ sub: 'user-1' });
    await expect(
      verifyStudioJwt(token, {
        trustedIssuers: [{ url: 'https://other.test/realms/x', brand: 'mentolder' }],
        audience: AUDIENCE,
        keyResolver: async () => { throw new Error('issuer mismatch'); },
      }),
    ).rejects.toThrow(/untrusted issuer/);
  });
});
