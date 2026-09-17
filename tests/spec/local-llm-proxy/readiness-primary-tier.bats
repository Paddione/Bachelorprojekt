#!/usr/bin/env bats
# tests/spec/local-llm-proxy/readiness-primary-tier.bats
# SSOT: openspec/specs/local-llm-proxy.md (Requirement: Health endpoint reports readiness, not liveness)
# Ticket: T900212
#
# Seit T900189 traegt das einzige Chat-Backend (freetoken-local) priority 0.
# evaluateReadiness kannte nur priority === 1 als Primaerstufe, /health blieb
# deshalb dauerhaft ready:false, obwohl alle Backends gesund waren.
#
# Pruefmodus: OUTPUT-basiert. Ein Node-Aufruf seedet den Health-Zustand ueber
# _testSeed, ruft evaluateReadiness und gibt das Ergebnis als JSON aus.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  command -v node >/dev/null 2>&1 || skip "node binary not installed"
}

# $1 = JSON-Array der Backends mit name, priority, kind, healthy
readiness() {
  BACKENDS="$1" node --input-type=module -e "
    const mod = await import('${REPO}/scripts/llm-proxy/discovery.mjs');
    const list = JSON.parse(process.env.BACKENDS);
    mod._testSeed({ backends: list.map((b) => ({ name: b.name, priority: b.priority, healthy: b.healthy, models: [] })) });
    const backends = list.map((b) => ({ name: b.name, priority: b.priority, kind: b.kind, baseUrl: 'http://192.0.2.1:' + (8000 + b.priority) + '/v1' }));
    const r = mod.evaluateReadiness(() => backends);
    console.log(JSON.stringify({ ready: r.ready, degraded: r.degraded.map((d) => d.name) }));
  "
}

@test "T900212: gesundes priority-0-Backend macht den Proxy ready" {
  run readiness '[
    {"name":"freetoken-local","priority":0,"kind":"openai","healthy":true},
    {"name":"cluster-rerank","priority":10,"kind":"tei","healthy":true}
  ]'
  [ "$status" -eq 0 ]
  [ "$output" = '{"ready":true,"degraded":[]}' ]
}

@test "T900212: totes priority-0-Backend mit lebendem Cloud-Fallback bleibt not ready" {
  run readiness '[
    {"name":"freetoken-local","priority":0,"kind":"openai","healthy":false},
    {"name":"deepseek","priority":2,"kind":"openai-remote","healthy":true}
  ]'
  [ "$status" -eq 0 ]
  [ "$output" = '{"ready":false,"degraded":["freetoken-local"]}' ]
}

@test "T900212: ohne Backend mit priority <= 1 bleibt der Proxy not ready" {
  run readiness '[
    {"name":"deepseek","priority":2,"kind":"openai-remote","healthy":true},
    {"name":"cluster-embed","priority":10,"kind":"tei","healthy":true}
  ]'
  [ "$status" -eq 0 ]
  [ "$output" = '{"ready":false,"degraded":[]}' ]
}
