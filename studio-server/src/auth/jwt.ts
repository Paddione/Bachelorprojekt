import { jwtVerify, type JWTVerifyGetKey } from 'jose';
import { getJwks } from './jwks';

export type Brand = 'mentolder' | 'korczewski';

export interface TrustedIssuer { url: string; brand: Brand; }

export interface StudioClaims {
  sub: string;
  brand: Brand;
  preferredUsername: string;
  realmRoles: string[];
  exp: number;
}

export interface VerifyOpts {
  trustedIssuers: TrustedIssuer[];
  audience?: string;
  keyResolver?: (issuer: string) => Promise<JWTVerifyGetKey> | JWTVerifyGetKey;
}

export async function verifyStudioJwt(token: string, opts: VerifyOpts): Promise<StudioClaims> {
  const audience = opts.audience ?? 'studio';
  for (const ti of opts.trustedIssuers) {
    try {
      const key = opts.keyResolver
        ? await opts.keyResolver(ti.url)
        : getJwks(ti.url);
      const { payload } = await jwtVerify(token, key as any, {
        issuer: ti.url,
        audience,
      });
      const roles = (payload.realm_access as any)?.roles ?? [];
      return {
        sub: payload.sub!,
        brand: ti.brand,
        preferredUsername: (payload as any).preferred_username ?? payload.sub!,
        realmRoles: roles,
        exp: payload.exp!,
      };
    } catch (err: any) {
      if (!/issuer|iss|JWSSignatureVerificationFailed/i.test(err.message)) {
        throw err;
      }
    }
  }
  throw new Error('untrusted issuer');
}
