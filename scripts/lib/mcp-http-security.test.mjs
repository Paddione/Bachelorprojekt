// scripts/lib/mcp-http-security.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedBrowserOrigins,
  requireToken,
  isLocalHost,
  isAllowedOrigin,
  authorizeBearer,
  corsHeadersFor,
  guardRequest,
  writeSecurityError,
} from './mcp-http-security.mjs';

// --- allowedBrowserOrigins ---
test('allowedBrowserOrigins parses comma list, drops wildcards and junk', () => {
  const env = {
    MCP_BROWSER_ORIGINS: ' https://app.example.com , http://localhost:3000 ,* ,not-a-url ,',
  };
  const s = allowedBrowserOrigins(env);
  assert.ok(s.has('https://app.example.com'));
  assert.ok(s.has('http://localhost:3000'));
  assert.equal(s.has('*'), false);
  assert.equal(s.size, 2);
});

test('allowedBrowserOrigins returns empty set when unset', () => {
  assert.equal(allowedBrowserOrigins({}).size, 0);
});

// --- requireToken ---
test('requireToken returns trimmed token when present', () => {
  assert.equal(requireToken('FACTORY_MCP_TOKEN', { FACTORY_MCP_TOKEN: '  abc  ' }), 'abc');
});

test('requireToken throws when missing or empty', () => {
  assert.throws(() => requireToken('FACTORY_MCP_TOKEN', {}), /Pflicht-Token/);
  assert.throws(() => requireToken('FACTORY_MCP_TOKEN', { FACTORY_MCP_TOKEN: '   ' }), /Pflicht-Token/);
});

// --- isLocalHost ---
test('isLocalHost accepts loopback hosts, rejects foreign', () => {
  assert.ok(isLocalHost('127.0.0.1'));
  assert.ok(isLocalHost('127.0.0.1:13003'));
  assert.ok(isLocalHost('localhost'));
  assert.ok(isLocalHost('localhost:13003'));
  assert.ok(isLocalHost('[::1]:13003'));
  assert.ok(isLocalHost('::1'));
  assert.equal(isLocalHost('10.0.0.5'), false);
  assert.equal(isLocalHost('example.com'), false);
  assert.equal(isLocalHost('example.com:443'), false);
  assert.equal(isLocalHost(undefined), false);
});

// --- isAllowedOrigin ---
test('isAllowedOrigin allows missing origin (CLI), rejects foreign, allows exact', () => {
  const allowed = new Set(['https://app.example.com']);
  assert.ok(isAllowedOrigin(undefined, allowed));
  assert.ok(isAllowedOrigin('', allowed));
  assert.ok(isAllowedOrigin('https://app.example.com', allowed));
  assert.equal(isAllowedOrigin('https://evil.example.com', allowed), false);
  // Keine Sub- oder Teil-Praefixe
  assert.equal(isAllowedOrigin('https://app.example.com.evil.com', allowed), false);
  assert.equal(isAllowedOrigin('https://app.example.com/path', allowed), false);
});

// --- authorizeBearer ---
test('authorizeBearer constant-time check accepts valid, rejects invalid/missing', () => {
  const tok = 'super-secret-token';
  assert.ok(authorizeBearer('Bearer super-secret-token', tok));
  assert.equal(authorizeBearer('Bearer wrong', tok), false);
  assert.equal(authorizeBearer('Basic abc', tok), false);
  assert.equal(authorizeBearer(undefined, tok), false);
  assert.equal(authorizeBearer('', tok), false);
  // Case-insensitive Bearer-Keyword
  assert.ok(authorizeBearer('bearer super-secret-token', tok));
});

// --- corsHeadersFor ---
test('corsHeadersFor reflects only exact allowed origin, never wildcard', () => {
  const allowed = new Set(['https://app.example.com']);
  const h = corsHeadersFor('https://app.example.com', allowed);
  assert.equal(h['access-control-allow-origin'], 'https://app.example.com');
  assert.equal(h.vary, 'Origin');

  const denied = corsHeadersFor('https://evil.example.com', allowed);
  assert.equal(denied['access-control-allow-origin'], undefined);
  assert.equal(denied['access-control-allow-origin'], undefined);

  const noOrigin = corsHeadersFor(undefined, allowed);
  assert.equal(noOrigin['access-control-allow-origin'], undefined);
});

// --- guardRequest: full boundary, fail-closed before body/dispatcher ---
function req({ host, origin, authorization }) {
  return { headers: { host, origin, authorization } };
}

test('guardRequest allows loopback CLI request with valid bearer + no origin', () => {
  const opts = { token: 'tok', allowedOrigins: new Set(), requireAuth: true };
  const r = guardRequest(req({ host: '127.0.0.1:13003', authorization: 'Bearer tok' }), opts);
  assert.deepEqual(r.ok, true);
});

test('guardRequest rejects foreign Host (DNS rebinding) regardless of token', () => {
  const opts = { token: 'tok', allowedOrigins: new Set() };
  const r = guardRequest(req({ host: 'evil.com', authorization: 'Bearer tok' }), opts);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test('guardRequest rejects disallowed browser Origin', () => {
  const opts = { token: 'tok', allowedOrigins: new Set(['https://app.example.com']) };
  const r = guardRequest(
    req({ host: 'localhost', origin: 'https://evil.example.com', authorization: 'Bearer tok' }),
    opts,
  );
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test('guardRequest rejects missing or wrong token', () => {
  const opts = { token: 'tok', allowedOrigins: new Set() };
  assert.equal(guardRequest(req({ host: 'localhost' }), opts).ok, false);
  assert.equal(guardRequest(req({ host: 'localhost', authorization: 'Bearer nope' }), opts).ok, false);
});

test('guardRequest allows allowed browser origin when paired with valid token', () => {
  const opts = { token: 'tok', allowedOrigins: new Set(['https://app.example.com']) };
  const r = guardRequest(
    req({ host: 'localhost', origin: 'https://app.example.com', authorization: 'Bearer tok' }),
    opts,
  );
  assert.equal(r.ok, true);
  assert.equal(r.allowedOrigin, 'https://app.example.com');
});

test('guardRequest allowAuth=false skips token but still checks Host/Origin', () => {
  const opts = { token: 'tok', allowedOrigins: new Set(), requireAuth: false };
  assert.equal(guardRequest(req({ host: 'localhost' }), opts).ok, true);
  // Host weiterhin fail-closed
  assert.equal(guardRequest(req({ host: 'evil.com' }), opts).ok, false);
});

// --- writeSecurityError produces MCP-shaped error response ---
test('writeSecurityError writes 401/403 MCP JSON', () => {
  const calls = [];
  const res = {
    writeHead: (s, h) => calls.push(['head', s, h]),
    end: (b) => calls.push(['end', b]),
  };
  writeSecurityError(res, 401, 'unauthorized: nope');
  assert.equal(calls[0][1], 401);
  const body = JSON.parse(calls[1][1]);
  assert.equal(body.error.message, 'unauthorized: nope');
});
