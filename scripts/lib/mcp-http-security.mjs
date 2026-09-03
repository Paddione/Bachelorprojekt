// scripts/lib/mcp-http-security.mjs
//
// Gemeinsame fail-closed HTTP-Sicherheitsgrenze fuer die nativen MCP-Server
// (factory-mcp-node, bge-mcp, mcp-postgres-local) und den guarded
// Kubernetes/PostgreSQL-Proxy. Kein npm-Abhaengigkeiten — nur node:crypto,
// um DNS-Rebinding (Host/Origin-Validierung) und Browser-CSRF (Origin-Allowlist)
// fuer lokale HTTP-MCP-Server einheitlich abzusichern. [T900052]
//
// Design-Prinzipien:
//   * fail-closed: fehlt ein Pflicht-Wert oder matcht ein Header nicht,
//     wird die Anfrage abgelehnt, BEVOR der Body gelesen oder der Dispatcher
//     aufgerufen wird.
//   * Exact-Allowlisting statt Wildcard: zugelassene Browser-Origins kommen
//     aus MCP_BROWSER_ORIGINS (Komma-getrennt, exakter String-Vergleich).
//   * Konstante-Zeit-Bearer-Vergleich (timingSafeEqual) gegen ein
//     server-spezifisches Token.
//   * CLI-Clients ohne Origin-Header (opencode, Claude Code, curl) bleiben
//     erlaubt; nur Browser-Origins werden geprueft.

import { createHash, timingSafeEqual } from 'node:crypto';

const CODE_FORBIDDEN = 403;
const CODE_UNAUTH = 401;

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

// Liest MCP_BROWSER_ORIGINS (Komma-getrennt) in eine Set exakter, normalisierter
// Origins. Leere/ungueltige Werte werden verworfen; ist kein Wert gesetzt,
// wird der Browser-Zugriff komplett deaktiviert (keine Wildcard-Erlaubnis).
export function allowedBrowserOrigins(env = process.env) {
  const raw = (env.MCP_BROWSER_ORIGINS || '').trim();
  if (!raw) return new Set();
  const out = new Set();
  for (const part of raw.split(',')) {
    const o = part.trim();
    if (!o) continue;
    // Nur http(s)://host[:port] mit explizitem Schema — keine Wildcards.
    if (/^https?:\/\/[^/\s*]+$/i.test(o)) out.add(o);
  }
  return out;
}

// Liest das Pflicht-Token fuer diesen Server aus einer Umgebungsvariable.
// Wirft, wenn es fehlt oder leer ist (fail-strict an der Prozessgrenze).
export function requireToken(envKey, env = process.env) {
  const t = (env[envKey] || '').trim();
  if (t.length === 0) {
    throw new Error(
      `MCP-HTTPSEC: Pflicht-Token fehlt — setze ${envKey} in einer owner-lesbaren Umgebungsdatei, bevor der Server startet.`,
    );
  }
  return t;
}

// ---------------------------------------------------------------------------
// Reine Pruefungen (unit-testbar, ohne HTTP-Stack)
// ---------------------------------------------------------------------------

// Prueft, ob der Host-Header ein lokaler (Loopback) Host ist. Verhindert
// DNS-Rebinding: ein fremder Hostname darf nicht auf die Loopback-Server
// weiterleiten. Akzeptiert 127.0.0.1, localhost, ::1 (mit optionalem Port).
export function isLocalHost(host) {
  if (typeof host !== 'string') return false;
  let hostname = String(host).trim();
  // Bracket-Notation fuer IPv6: [::1]:port -> ::1
  if (hostname.startsWith('[')) {
    const idx = hostname.indexOf(']');
    if (idx >= 0) hostname = hostname.slice(1, idx);
  } else {
    // Host:Port fuer IPv4/Hostnamen — aber ein nacktes IPv6-Literal wie
    // "::1" oder "0:0:0:0:0:0:0:1" enthaelt mehrere Doppelpunkte ohne Port.
    const colons = hostname.split(':');
    if (colons.length > 2) {
      // mehrere Doppelpunkte und keine Bracket-Notation -> IPv6-Literal
      hostname = hostname;
    } else {
      hostname = colons[0];
    }
  }
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0:0:0:0:0:0:0:1'
  );
}

// Prueft, ob ein Origin-Header zu einer zugelassenen Browser-Origin gehoert.
// Fehlender Origin (= CLI/curl) ist zulaessig; ein nicht gelisteter Browser-
// Origin wird abgelehnt.
export function isAllowedOrigin(origin, allowed) {
  if (origin === undefined || origin === null || origin === '') return true;
  return allowed.has(String(origin));
}

// Konstante-Zeit-Bearer-Bearer-Pruefung gegen "Authorization: Bearer <t>".
// Laengen-Diskrepanz wird ueber einen Platzhalter-Hash kaschiert, damit die
// Antwortzeit nicht die Token-Laenge verraet.
export function authorizeBearer(authHeader, expected) {
  const expect = String(expected);
  if (!expect) return false;
  const m = /^Bearer\s+(.+)$/i.exec(String(authHeader || ''));
  if (!m) return false;
  const provided = m[1].trim();
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expect).digest();
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// CORS-/Security-Header fuer zulaessige Browser-Origins
// ---------------------------------------------------------------------------

// Liefert die festen CORS-Header. Ist eine Origin zugelassen, wird exakt diese
// Origin zurueckgegeben; ohne zugelassene Browser-Origin wird Origin nicht
// widergespiegelt (Browser erhalten dann keinen CORS-Zugriff).
export function corsHeadersFor(origin, allowed) {
  const headers = {
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type, Accept, mcp-protocol-version',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
  };
  if (origin && allowed.has(String(origin))) {
    headers['access-control-allow-origin'] = String(origin);
    headers.vary = 'Origin';
  }
  // Kein access-control-allow-origin: * — nie wildcard erlauben.
  return headers;
}

// ---------------------------------------------------------------------------
// HTTP-Helfer: konsistente 401/403-Antworten (MCP-freundlich)
// ---------------------------------------------------------------------------

export function writeSecurityError(res, status, message) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: null,
    error: { code: status === CODE_UNAUTH ? -32001 : -32003, message },
  });
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

// ---------------------------------------------------------------------------
// Hohe API: guardRequest(req, opts) -> { ok, status?, message? }
//
// Fuehrt die komplette Grenze vor dem Body-Lesen/Dispatcher aus:
//   1. Host-Header muss ein lokaler Host sein (DNS-Rebinding).
//   2. Origin (falls vorhanden) muss in der Browser-Allowlist stehen.
//   3. Authorization-Bearer-Token muss zum Server-Token passen.
// Bei jedem Fehlschlag: { ok:false, status, message }. Bei Erfolg:
// { ok:true, allowedOrigin? }.
// ---------------------------------------------------------------------------

export function guardRequest(req, opts) {
  const { token, allowedOrigins, requireAuth = true } = opts || {};

  // 1. Host
  if (!isLocalHost(req?.headers?.host)) {
    return { ok: false, status: CODE_FORBIDDEN, message: 'forbidden: host not allowed' };
  }

  // 2. Origin
  const origin = req?.headers?.origin;
  if (origin !== undefined && origin !== '' && !isAllowedOrigin(origin, allowedOrigins)) {
    return { ok: false, status: CODE_FORBIDDEN, message: 'forbidden: origin not allowed' };
  }

  // 3. Token
  if (requireAuth) {
    if (!authorizeBearer(req?.headers?.authorization, token)) {
      return { ok: false, status: CODE_UNAUTH, message: 'unauthorized: invalid or missing bearer token' };
    }
  }

  return { ok: true, allowedOrigin: origin && allowedOrigins.has(String(origin)) ? String(origin) : undefined };
}
