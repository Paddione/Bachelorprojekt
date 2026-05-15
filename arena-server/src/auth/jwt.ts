import { jwtVerify, type KeyLike } from 'jose';
import { getJwks } from './jwks';
import { log } from '../log';

export type Brand = 'mentolder' | 'korczewski';

export interface TrustedIssuer { url: string; brand: Brand; }

export interface ArenaClaims {
  sub: string;
  brand: Brand;
  displayName: string;
  realmRoles: string[];
  exp: number;
}

export interface VerifyOpts {
  trustedIssuers: TrustedIssuer[];
  /** Test seam: skip JWKS network fetch by supplying a key directly. */
  keyResolver?: (issuer: string) => Promise<KeyLike>;
}

export async function verifyArenaJwt(token: string, opts: VerifyOpts): Promise<ArenaClaims> {
  // Decode issuer claim before signature verification (header is unauthenticated).
  // Use jose's two-step: try each trusted issuer's JWKS until one verifies.
  for (const ti of opts.trustedIssuers) {
    try {
      const key = opts.keyResolver
        ? await opts.keyResolver(ti.url)
        : getJwks(ti.url);
      const { payload } = await jwtVerify(token, key as any, {
        issuer: ti.url,
        audience: 'arena',
      });
      const roles = (payload.realm_access as any)?.roles ?? [];
      return {
        sub: payload.sub!,
        brand: ti.brand,
        displayName: (payload as any).preferred_username ?? payload.sub!,
        realmRoles: roles,
        exp: payload.exp!,
      };
    } catch (err: any) {
      log.info({ issuer: ti.url, err: err.message }, 'verification failed for issuer');
      // Try the next issuer only when issuer mismatch; otherwise rethrow.
      if (!/issuer|iss|JWSSignatureVerificationFailed/i.test(err.message)) {
        log.error({ issuer: ti.url, err: err.message }, 'fatal verification error');
        throw err;
      }
    }
  }
  log.info('no trusted issuer matched the token');
  throw new Error('untrusted issuer');
}

export function playerKey(claims: ArenaClaims): string {
  return `${claims.sub}@${claims.brand}`;
}
