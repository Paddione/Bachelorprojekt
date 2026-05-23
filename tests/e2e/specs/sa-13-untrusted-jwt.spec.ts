import { test, expect } from '@playwright/test';

const ARENA_URL =
  process.env.ARENA_WS_URL ?? 'https://arena-ws.korczewski.de';

/**
 * Encode a value to base64url (URL-safe base64 without padding).
 */
function base64url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Build a structurally-valid but cryptographically-invalid JWT.
 * The signature is a random string — no real key is used.
 *
 * Header claims RS256 (asymmetric), so the server cannot verify it
 * with any known JWKS, and must reject it.
 */
function buildFakeJwt(options: {
  issuer?: string;
  subject?: string;
  audience?: string;
  algorithm?: string;
  expiresInSec?: number;
} = {}): string {
  const {
    issuer = 'https://untrusted.example.com/realms/evil',
    subject = 'attacker-0000',
    audience = 'arena',
    algorithm = 'RS256',
    expiresInSec = 3600,
  } = options;

  const header = base64url(
    JSON.stringify({ alg: algorithm, typ: 'JWT', kid: 'fake-key-id-xyz' })
  );
  const payload = base64url(
    JSON.stringify({
      iss: issuer,
      sub: subject,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + expiresInSec,
      iat: Math.floor(Date.now() / 1000),
      realm_access: { roles: ['arena-admin'] }, // claim admin role to maximise attack surface
    })
  );
  // Fake signature — not derived from any real private key
  const fakeSignature = base64url('thisisnotavalidsignatureforthisrsa256jwt');

  return `${header}.${payload}.${fakeSignature}`;
}

/**
 * SA-13: Untrusted JWT abgelehnt
 *
 * Prüft, dass ein JWT, das mit einem unbekannten/gefälschten Schlüssel signiert
 * wurde, vom Arena-Server mit HTTP 401 abgelehnt wird.
 *
 * Vorbedingungen:
 *   - Arena-Server läuft und ist erreichbar
 *   - ARENA_WS_URL gesetzt (oder Standard https://arena-ws.korczewski.de)
 */
test.describe('SA-13: Untrusted JWT abgelehnt', () => {
  test.setTimeout(15_000);

  /**
   * T1: Selbst-signiertes JWT erzeugen — strukturell gültig, Signatur ungültig.
   */
  test('T1: Gefälschtes JWT wird korrekt konstruiert', async () => {
    const fakeJwt = buildFakeJwt();
    const parts = fakeJwt.split('.');
    expect(parts).toHaveLength(3);

    // Verify header is parseable and has expected algorithm
    const headerJson = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    expect(headerJson.alg).toBe('RS256');
    expect(headerJson.typ).toBe('JWT');

    // Verify payload contains the untrusted issuer
    const payloadJson = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    expect(payloadJson.iss).toBe('https://untrusted.example.com/realms/evil');
  });

  /**
   * T2: Arena-Server lehnt gefälschtes JWT mit 401 ab (POST /lobby/open).
   */
  test('T2: Gefälschtes JWT an /lobby/open → 401', async ({ request }) => {
    test.skip(
      !process.env.ARENA_WS_URL,
      'ARENA_WS_URL nicht gesetzt — Test übersprungen'
    );

    const fakeJwt = buildFakeJwt();

    const res = await request.post(`${ARENA_URL}/lobby/open`, {
      headers: {
        Authorization: `Bearer ${fakeJwt}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(
      res.status(),
      `Arena-Server hat gefälschtes JWT akzeptiert (${res.status()}) — Sicherheitslücke!`
    ).toBe(401);
  });

  /**
   * Zusatz: Strukturell ungültiges Token (kein JWT-Format) → 401.
   */
  test('Zusatz: Strukturell ungültiges Token → 401', async ({ request }) => {
    test.skip(
      !process.env.ARENA_WS_URL,
      'ARENA_WS_URL nicht gesetzt — Test übersprungen'
    );

    const res = await request.post(`${ARENA_URL}/lobby/open`, {
      headers: {
        Authorization: 'Bearer not-a-jwt-at-all',
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(
      res.status(),
      `Arena-Server hat strukturell ungültiges Token akzeptiert (${res.status()}) — Sicherheitslücke!`
    ).toBe(401);
  });

  /**
   * Zusatz: HS256-gefälschtes JWT (algorithm confusion attack attempt) → 401.
   *
   * Ein Angreifer könnte versuchen, den Server durch Wechsel auf HS256
   * (symmetrisch, mit dem öffentlichen RSA-Key als HMAC-Secret) zu täuschen.
   */
  test('Zusatz: HS256-Algorithm-Confusion-Angriff → 401', async ({ request }) => {
    test.skip(
      !process.env.ARENA_WS_URL,
      'ARENA_WS_URL nicht gesetzt — Test übersprungen'
    );

    const hs256Jwt = buildFakeJwt({ algorithm: 'HS256' });

    const res = await request.post(`${ARENA_URL}/lobby/open`, {
      headers: {
        Authorization: `Bearer ${hs256Jwt}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(
      res.status(),
      `Arena-Server hat HS256-Algorithm-Confusion-JWT akzeptiert (${res.status()}) — Sicherheitslücke!`
    ).toBe(401);
  });
});
