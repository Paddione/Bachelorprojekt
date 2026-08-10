// scripts/llm-proxy/bge-routes.test.mjs
// T003205 — Rollenaufloesung und Failover-Kette gegen Stub-Upstreams.
//
// Pruefmodus: command output verification — loadRoles/roleForPath/routeRequest
// werden AUFGERUFEN und Status/Header/Body des Ergebnisses geprueft. Kein
// Source-Grep: dass der Code ein Failover behauptet, belegt nicht, dass es
// eintritt. Der entscheidende Fall — "nimmt die Verbindung an und antwortet
// nie" (T002838) — ist mit echtem bge kaum reproduzierbar, mit einem Stub
// trivial.
//
// Portwahl: ephemere Ports via listen(0) (P4-Konvention). Unter WSL2 sind
// Bereiche wie 49152-49251 von Hyper-V reserviert; fest verdrahtete Ports
// erzeugten einen Fehlschlag, den nur dieser Host kennt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadRoles, roleForPath, routeRequest } from './bge-routes.mjs';

function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
function baseOf(srv) {
  return `http://127.0.0.1:${srv.address().port}`;
}
function close(srv) {
  return new Promise((r) => srv.close(() => r()));
}
function json200(body = '{"ok":true}') {
  return (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(body);
  };
}
function json400(body = '{"error":"client"}') {
  return (req, res) => {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(body);
  };
}

// ── Rollenaufloesung (rein) ─────────────────────────────────────────────
test('roleForPath: Pfad bestimmt die Rolle, nie das model-Feld', () => {
  assert.equal(roleForPath('/v1/embeddings'), 'embed')
  assert.equal(roleForPath('/v1/rerank'), 'rerank')
  assert.equal(roleForPath('/v1/chat/completions'), null)
  assert.equal(roleForPath('/v1/models'), null)
})

test('loadRoles: Ketten werden in loadout- und url-Eintraege klassifiziert', () => {
  const doc = {
    roles: {
      embed: { chain: ['loadout:bge-embed-cpu', 'http://127.0.0.1:8081'] },
      rerank: { chain: ['loadout:bge-rerank-cpu'] },
    },
  }
  const roles = loadRoles(doc)
  assert.deepEqual(roles.get('embed'), [
    { kind: 'loadout', slug: 'bge-embed-cpu' },
    { kind: 'url', baseUrl: 'http://127.0.0.1:8081' },
  ])
  assert.deepEqual(roles.get('rerank'), [{ kind: 'loadout', slug: 'bge-rerank-cpu' }])
})

test('loadRoles: fehlender roles-Schluessel wirft mit nennendem Text', () => {
  assert.throws(() => loadRoles({}), /roles.*fehlt/)
})

test('loadRoles: leere Kette wirft', () => {
  assert.throws(() => loadRoles({ roles: { embed: { chain: [] } } }), /chain.*nicht-leer/)
})

test('loadRoles: unbekannter Praefix wirft mit nennendem Text', () => {
  assert.throws(() => loadRoles({ roles: { embed: { chain: ['blub:bge'] } } }), /unbekannter Ketten-Eintrag/)
})

// ── Failover gegen Stubs ────────────────────────────────────────────────
test('totes erstes Glied -> zweites antwortet, Header nennt das zweite', async (t) => {
  const ok = await listen(json200())
  t.after(() => close(ok))

  const result = await routeRequest({
    role: 'embed', path: '/v1/embeddings', body: { input: ['x'] },
    chain: [{ kind: 'url', baseUrl: 'http://127.0.0.1:1' }, { kind: 'url', baseUrl: baseOf(ok) }],
    doc: { loadouts: [] },
  })
  assert.equal(result.status, 200)
  assert.equal(result.upstream, baseOf(ok))
  assert.deepEqual(JSON.parse(result.body), { ok: true })
})

test('schweigendes erstes Glied -> nach Timeout antwortet das zweite', async (t) => {
  // Nimmt an, antwortet nie — der T002838-Fall, hier als Stub trivial.
  const hang = await listen(() => {})
  const ok = await listen(json200())
  t.after(() => close(hang))
  t.after(() => close(ok))

  const started = Date.now()
  const result = await routeRequest({
    role: 'embed', path: '/v1/embeddings', body: { input: ['x'] },
    chain: [{ kind: 'url', baseUrl: baseOf(hang) }, { kind: 'url', baseUrl: baseOf(ok) }],
    doc: { loadouts: [] },
    timeoutMs: 300,
  })
  const elapsed = Date.now() - started
  assert.equal(result.status, 200)
  assert.equal(result.upstream, baseOf(ok))
  // Der Test soll belegen, dass das schweigende Glied ZEIT gekostet hat und
  // nicht irgendwie sofort uebersprungen wurde — und dass es trotzdem endet.
  assert.ok(elapsed >= 200, `Timeout-Failover endete nach ${elapsed}ms — zu schnell fuer einen echten Timeout`)
})

test('4xx wird durchgereicht, das zweite Glied wird NICHT kontaktiert', async (t) => {
  let contacted = 0
  const bad = await listen(json400())
  const ok = await listen((req, res) => { contacted++; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}') })
  t.after(() => close(bad))
  t.after(() => close(ok))

  const result = await routeRequest({
    role: 'embed', path: '/v1/embeddings', body: { input: ['x'] },
    chain: [{ kind: 'url', baseUrl: baseOf(bad) }, { kind: 'url', baseUrl: baseOf(ok) }],
    doc: { loadouts: [] },
  })
  assert.equal(result.status, 400)
  assert.equal(result.upstream, baseOf(bad))
  // Der Nachweis haengt an einem Zaehler, nicht an der Laufzeit — sonst belegte
  // der Test nur, dass es schnell ging.
  assert.equal(contacted, 0)
})

test('alle Glieder tot -> 503 mit einem Grund JE Glied', async (t) => {
  // Erst ein schweigendes, dann ein verweigerndes Glied: die Gruende muessen
  // sich unterscheiden (Timeout vs. Verbindungsfehler — getrennte Diagnosen).
  const hang = await listen(() => {})
  t.after(() => close(hang))

  const result = await routeRequest({
    role: 'embed', path: '/v1/embeddings', body: { input: ['x'] },
    chain: [{ kind: 'url', baseUrl: baseOf(hang) }, { kind: 'url', baseUrl: 'http://127.0.0.1:1' }],
    doc: { loadouts: [] },
    timeoutMs: 300,
  })
  assert.equal(result.status, 503)
  const body = JSON.parse(result.body)
  assert.equal(body.error.code, 'bge_chain_exhausted')
  assert.equal(body.error.entries.length, 2)
  assert.ok(body.error.entries[0].reason.includes('ms'), `Timeout-Grund benannt: ${body.error.entries[0].reason}`)
  assert.ok(body.error.entries[1].reason, `Verbindungsfehler-Grund benannt: ${body.error.entries[1].reason}`)
  assert.notEqual(body.error.entries[0].reason, body.error.entries[1].reason)
})

test('Loadout-Glied startet und bedient dann den Request', async (t) => {
  const ok = await listen(json200())
  t.after(() => close(ok))
  let started = false

  const result = await routeRequest({
    role: 'embed', path: '/v1/embeddings', body: { input: ['x'] },
    chain: [{ kind: 'loadout', slug: 'bge-embed-cpu' }],
    doc: { modelRoots: [], defaults: {}, loadouts: [{ slug: 'bge-embed-cpu', port: ok.address().port }] },
    startLoadout: async () => { started = true },
    unitStatus: () => ({ exists: true, active: 'inactive', sub: 'dead' }),
  })
  assert.equal(started, true)
  assert.equal(result.status, 200)
  assert.equal(result.upstream, 'bge-embed-cpu')
})

test('Loadout startet nicht -> Kette rueckt weiter statt zu verschlucken', async (t) => {
  const ok = await listen(json200())
  t.after(() => close(ok))
  let started = false

  const result = await routeRequest({
    role: 'embed', path: '/v1/embeddings', body: { input: ['x'] },
    chain: [
      { kind: 'loadout', slug: 'bge-embed-cpu' },
      { kind: 'url', baseUrl: baseOf(ok) },
    ],
    doc: { modelRoots: [], defaults: {}, loadouts: [{ slug: 'bge-embed-cpu', port: 8095 }] },
    startLoadout: async () => { started = true; throw new Error('startet nicht') },
    unitStatus: () => ({ exists: true, active: 'inactive', sub: 'dead' }),
  })
  assert.equal(started, true)
  assert.equal(result.status, 200)
  assert.equal(result.upstream, baseOf(ok))
})

test('unbekannter Loadout-Slug -> 503, Grund nennt den Slug', async () => {
  const result = await routeRequest({
    role: 'embed', path: '/v1/embeddings', body: { input: ['x'] },
    chain: [{ kind: 'loadout', slug: 'gibt-es-nicht' }],
    doc: { modelRoots: [], defaults: {}, loadouts: [] },
    startLoadout: async () => { throw new Error('wird nicht aufgerufen') },
  })
  assert.equal(result.status, 503)
  const body = JSON.parse(result.body)
  assert.equal(body.error.entries.length, 1)
  assert.equal(body.error.entries[0].entry, 'gibt-es-nicht')
})
