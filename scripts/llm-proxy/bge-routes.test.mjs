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
import { loadRoles, roleForPath, routeRequest, rolesFromRegistry, resolveRoleChain, forwardPathForRole } from './bge-routes.mjs';

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

test('loadRoles: Ketten bestehen ausschliesslich aus url-Eintraegen', () => {
  const doc = {
    roles: {
      embed: { chain: ['http://127.0.0.1:8085', 'http://127.0.0.1:8081'] },
      rerank: { chain: ['http://127.0.0.1:8081'] },
    },
  }
  const roles = loadRoles(doc)
  assert.deepEqual(roles.get('embed'), [
    { kind: 'url', baseUrl: 'http://127.0.0.1:8085' },
    { kind: 'url', baseUrl: 'http://127.0.0.1:8081' },
  ])
  assert.deepEqual(roles.get('rerank'), [{ kind: 'url', baseUrl: 'http://127.0.0.1:8081' }])
})

// [T900107] Ein 'loadout:'-Glied wird nicht mehr aufgeloest, sondern beim
// Laden abgelehnt. Es still zu ignorieren waere die schlechtere Wahl: die
// Kette waere dann um ein Glied kuerzer, ohne dass es jemand bemerkt.
test('loadRoles: ein loadout:-Glied wird abgelehnt statt still ignoriert', () => {
  assert.throws(
    () => loadRoles({ roles: { embed: { chain: ['loadout:bge-embed-cpu'] } } }),
    /unbekannter Ketten-Eintrag/)
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

// ── Registry-Rollenaufloesung ───────────────────────────────────────────
test('rolesFromRegistry: sortiert nach priority und filtert disabled', () => {
  const backends = [
    { name: 'b-mid', enabled: true, priority: 20, roles: ['embed', 'rerank'], baseUrl: 'http://127.0.0.1:1234' },
    { name: 'b-first', enabled: true, priority: 1, roles: ['embed'], baseUrl: 'http://127.0.0.1:8085' },
    { name: 'b-disabled', enabled: false, priority: 5, roles: ['embed'], baseUrl: 'http://127.0.0.1:9999' },
    // [T900107] loadout_slug wird nicht mehr ausgewertet — die Zeile steuert
    // ihre baseUrl bei wie jede andere.
    { name: 'b-loadout', enabled: true, priority: 30, roles: ['rerank'], baseUrl: 'http://127.0.0.1:18235', loadoutSlug: 'bge-rerank-cpu' },
    { name: 'b-second', enabled: true, priority: 10, roles: ['embed', 'rerank'], baseUrl: 'http://127.0.0.1:8081' },
  ];
  const roles = rolesFromRegistry(backends);
  assert.deepEqual(roles.get('embed'), [
    { kind: 'url', baseUrl: 'http://127.0.0.1:8085' },
    { kind: 'url', baseUrl: 'http://127.0.0.1:8081' },
    { kind: 'url', baseUrl: 'http://127.0.0.1:1234' },
  ]);
  assert.deepEqual(roles.get('rerank'), [
    { kind: 'url', baseUrl: 'http://127.0.0.1:8081' },
    { kind: 'url', baseUrl: 'http://127.0.0.1:1234' },
    { kind: 'url', baseUrl: 'http://127.0.0.1:18235' },
  ]);
});

test('resolveRoleChain: faellt auf loadouts.json zurueck bei leerer Registry', () => {
  const doc = {
    roles: {
      embed: { chain: ['http://127.0.0.1:8085', 'http://127.0.0.1:8081'] },
      rerank: { chain: ['http://127.0.0.1:8081'] },
    },
  };
  const fallback = resolveRoleChain('embed', [], doc);
  assert.equal(fallback.length, 2);
  assert.equal(fallback[0].baseUrl, 'http://127.0.0.1:8085');

  const regBackends = [
    { name: 'reg-embed', enabled: true, priority: 1, roles: ['embed'], baseUrl: 'http://127.0.0.1:9000' },
  ];
  const reg = resolveRoleChain('embed', regBackends, doc);
  assert.equal(reg.length, 1);
  assert.equal(reg[0].baseUrl, 'http://127.0.0.1:9000');
});

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

// [T900107] Die drei Loadout-Glied-Tests sind entfallen: routeRequest kennt
// nur noch url-Glieder. Was sie sicherten — ein nicht startendes Glied darf
// den Request nicht verschlucken — deckt der Failover-Block darueber ab.

// ── Getrennte Retrieval-Rollen (retrieval-chains-split) ─────────────────
test('roleForPath: LFM-Pfad bildet eigene Rolle ab, ColBERT-Pfade sind entfernt', () => {
  assert.equal(roleForPath('/v1/lfm/embeddings'), 'lfm-embed')
  // ColBERT-Rollen entfernt 2026-10-26 (kein Gewinn in der Code-Suche, kein Verbraucher).
  assert.equal(roleForPath('/v1/colbert/embeddings'), null)
  assert.equal(roleForPath('/v1/colbert/rerank'), null)
  // Unbekannte Pfade fallen weiter ins Chat-Fallback (proxyV1, server.mjs).
  assert.equal(roleForPath('/v1/chat/completions'), null)
})

function retrievalBackends() {
  return [
    { name: 'tablet-embed', enabled: true, priority: 5, roles: ['embed'], baseUrl: 'http://llm-gateway-tablet:8081' },
    { name: 'cluster-embed', enabled: true, priority: 10, roles: ['embed'], baseUrl: 'http://cluster-embed:8081' },
    { name: 'cluster-rerank', enabled: true, priority: 10, roles: ['rerank'], baseUrl: 'http://cluster-rerank:8081' },
    { name: 'cluster-lfm-embed', enabled: true, priority: 10, roles: ['lfm-embed'], baseUrl: 'http://lfm-embed:8081' },
    // lmstudio traegt keine Rolle mehr (5fe38fbbb) — darf in keiner Kette landen.
    { name: 'lmstudio', enabled: true, priority: 20, roles: [], baseUrl: 'http://lmstudio:1234/v1' },
  ];
}

test('rolesFromRegistry: drei getrennte Ketten, Tablet-Embed vor Cluster, kein Quer-Glied', () => {
  const roles = rolesFromRegistry(retrievalBackends());
  assert.equal(roles.size, 3)
  assert.deepEqual(roles.get('embed').map((e) => e.baseUrl),
    ['http://llm-gateway-tablet:8081', 'http://cluster-embed:8081'])
  assert.deepEqual(roles.get('rerank').map((e) => e.baseUrl), ['http://cluster-rerank:8081'])
  assert.deepEqual(roles.get('lfm-embed').map((e) => e.baseUrl), ['http://lfm-embed:8081'])
  // Kein Glied steht in zwei Ketten — sonst gaebe es Quer-Fallback.
  const all = [...roles.values()].flat().map((e) => e.baseUrl);
  assert.equal(new Set(all).size, all.length)
  assert.ok(!all.some((u) => u.includes('lmstudio')), 'lmstudio darf in keiner Kette stehen')
})

test('resolveRoleChain: jede neue Rolle faellt auf loadouts.json zurueck', () => {
  const doc = {
    roles: {
      embed: { chain: ['http://t:8081', 'http://c:8081'] },
      rerank: { chain: ['http://t:8080', 'http://c2:8081'] },
      'lfm-embed': { chain: ['http://lfm:8081'] },
    },
  };
  for (const [role, want] of [
    ['embed', 'http://t:8081'], ['rerank', 'http://t:8080'],
    ['lfm-embed', 'http://lfm:8081'],
  ]) {
    const chain = resolveRoleChain(role, [], doc);
    assert.equal(chain[0].baseUrl, want, `E3-Erstglied fuer ${role}`)
  }
})

test('forwardPathForRole: kanonischer Pfad waehlt Rolle, Upstream-Pfad ist nativ', () => {
  assert.equal(forwardPathForRole('embed', '/v1/embeddings'), '/v1/embeddings')
  assert.equal(forwardPathForRole('rerank', '/v1/rerank'), '/v1/rerank')
  assert.equal(forwardPathForRole('lfm-embed', '/v1/lfm/embeddings'), '/v1/embeddings')
  // Unbekannte Rolle: angefragter Pfad unveraendert (kein Wissen, keine Magie).
  assert.equal(forwardPathForRole('unbekannt', '/v1/irgendwo'), '/v1/irgendwo')
})

// Korrigiert 2026-10-26: unveraendertes Durchreichen des kanonischen Pfads
// antwortete an llama.cpp-Upstreams mit 404 (live belegt, Header
// x-llm-proxy-bge-upstream gesetzt). Der kanonische Pfad waehlt nur die
// Rolle; upstream geht der native Pfad raus.
test('routeRequest je Rolle: richtiges Erstglied, Upstream-Pfad ist nativ', async (t) => {
  const seen = [];
  const stub = await listen((req, res) => {
    seen.push(req.url);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  t.after(() => close(stub));

  const cases = [
    // [Rolle, kanonischer Pfad, erwarteter Upstream-Pfad]
    ['embed', '/v1/embeddings', '/v1/embeddings'],
    ['rerank', '/v1/rerank', '/v1/rerank'],
    ['lfm-embed', '/v1/lfm/embeddings', '/v1/embeddings'],
  ];
  for (const [role, path, want] of cases) {
    seen.length = 0;
    const result = await routeRequest({
      role, path, body: { input: ['x'] },
      chain: [{ kind: 'url', baseUrl: baseOf(stub) }],
    });
    assert.equal(result.status, 200, `Rolle ${role}`)
    assert.equal(result.upstream, baseOf(stub), `Erstglied fuer ${role}`)
    assert.deepEqual(seen, [want], `Upstream-Pfad fuer ${role}`)
  }
})

test('embed reicht bereits formatierte Eingaben byte-identisch durch (kein Prefix)', async (t) => {
  // Der gemeinsame Vertrag formatiert genau einmal (embeddings.ts / MCP);
  // der Proxy darf nichts praefixieren, kuerzen oder umschreiben.
  let raw = '';
  const stub = await listen((req, res) => {
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"data":[]}');
    });
  });
  t.after(() => close(stub));

  const formatted = ['task: search result | query: hallo', 'title: none | text: welt'];
  const result = await routeRequest({
    role: 'embed', path: '/v1/embeddings',
    body: { model: 'embeddinggemma-300m', input: formatted },
    chain: [{ kind: 'url', baseUrl: baseOf(stub) }],
  });
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(raw).input, formatted);
  assert.ok(!raw.includes('task: search result | query: task:'), 'kein doppelter Query-Prefix');
  assert.ok(!raw.includes('title: none | text: title:'), 'kein doppelter Index-Prefix');
});
