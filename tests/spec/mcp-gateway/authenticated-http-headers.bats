#!/usr/bin/env bats
# tests/spec/mcp-gateway/authenticated-http-headers.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002487
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-orientiert.
# Die Tests messen die tatsaechliche Generator-Ausgabe (mcp-sync.sh render/check
# gegen eine Fixture-Registry in einem tmpdir) statt Implementierungsmuster im
# Skript zu grepen. Ausnahme sind die beiden Registry-Assertions: die Registry
# IST die Konfiguration, ihr Inhalt ist damit selbst das Ergebnis.
#
# Deckt ab: HTTP-MCP-Server mit Bearer-Auth (bge-mcp, :13005) waren in allen
# Harnesses unerreichbar (HTTP 401), weil die HTTP-Zweige der Renderer ein
# 2-Feld-Literal ohne Header-Durchreichung emittierten.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SYNC="$REPO/scripts/mcp-sync.sh"
  REGISTRY="$REPO/docs/agent-guide/registry/mcp.yaml"
}

# ── Registry deklariert den Header als Env-Referenz ──────────────────────

@test "registry declares an Authorization header for bge-mcp" {
  run bash -c "node -e \"
    const fs=require('fs'),y=require('yaml');
    const d=y.parse(fs.readFileSync('$REGISTRY','utf8'));
    const c=d.clients['bge-mcp'];
    if(!c.headers) process.exit(1);
    const a=c.headers.Authorization;
    if(!a) process.exit(1);
    console.log(a);
  \""
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == Bearer* ]]
}

@test "registry Authorization value is an env reference, never a literal token" {
  # Positiv-Anker zuerst (T002356-M1): der Header muss ueberhaupt existieren,
  # sonst bestuende die Negativ-Aussage vakuos.
  run bash -c "node -e \"
    const fs=require('fs'),y=require('yaml');
    const d=y.parse(fs.readFileSync('$REGISTRY','utf8'));
    const a=d.clients['bge-mcp'].headers.Authorization;
    console.log(a);
  \""
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  # Erst jetzt die Negativ-Aussage: kein expandierter Token im Klartext.
  [[ "$output" == *'${BGE_MCP_TOKEN}'* ]]
}

# ── Generator reicht Header in die HTTP-Harness-Configs durch ────────────

@test "generated .mcp.json carries the bge-mcp Authorization header" {
  run bash -c "node -e \"
    const fs=require('fs');
    const d=JSON.parse(fs.readFileSync('$REPO/.mcp.json','utf8'));
    const s=d.mcpServers['bge-mcp'];
    if(!s.headers) process.exit(1);
    console.log(s.headers.Authorization||'');
  \""
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'${BGE_MCP_TOKEN}'* ]]
}

@test "generated opencode.jsonc carries the bge-mcp Authorization header" {
  run bash -c "grep -A8 '\"bge-mcp\"' '$REPO/.opencode/opencode.jsonc' | grep -c 'Authorization'"
  echo "output: $output"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "mcp-sync.sh check stays green — headers are generated, not hand-edited" {
  # Wenn der Header in .mcp.json steht und check gruen ist, dann hat der
  # Generator ihn reproduzierbar aus der Registry erzeugt. Genau das trennt
  # den Fix von einem manuellen Eintrag, den der naechste sync ueberschreibt.
  run bash "$SYNC" check
  echo "output: $output"
  [ "$status" -eq 0 ]
}

# ── Generizitaet: kein bge-mcp-Sonderfall im Renderer ────────────────────

@test "renderers pass headers through for any http client, not just bge-mcp" {
  local tmpd fixture
  tmpd="$(mktemp -d)"
  fixture="$tmpd/registry.yaml"
  cat > "$fixture" <<'YAML'
clients:
  probe-http:
    transport: http
    endpoint: http://localhost:19999/mcp
    headers:
      Authorization: "Bearer ${PROBE_TOKEN}"
      X-Probe: "static-value"
    harness:
      claude_code:
        type: http
        url: http://localhost:19999/mcp
      agy:
        serverUrl: http://localhost:19999/mcp
      opencode:
        type: remote
        url: http://localhost:19999/mcp
        enabled: true
cluster: {}
YAML

  # SICHERHEIT: Solange MCP_OUT_DIR nicht unterstuetzt wird (RED-Zustand), faellt
  # `render` auf die echten Ziele zurueck statt zu scheitern. Deshalb werden die
  # Repo-Ziele gesichert und danach zurueckgespielt; HOME zeigt auf das tmpdir,
  # damit der agy-Renderer nicht die reale ~/.gemini-Config ausserhalb des Repos
  # ueberschreibt (dort greift kein git als Sicherheitsnetz).
  local backup="$tmpd/backup"
  mkdir -p "$backup/.opencode" "$backup/scripts/llm"
  cp "$REPO/.mcp.json" "$backup/.mcp.json"
  cp "$REPO/.opencode/opencode.jsonc" "$backup/.opencode/opencode.jsonc"
  cp "$REPO/scripts/llm/mcp-servers.json" "$backup/scripts/llm/mcp-servers.json"

  run env HOME="$tmpd/fakehome" MCP_REGISTRY="$fixture" MCP_OUT_DIR="$tmpd" bash "$SYNC" render
  local render_status="$status"
  local render_output="$output"

  cp "$backup/.mcp.json" "$REPO/.mcp.json"
  cp "$backup/.opencode/opencode.jsonc" "$REPO/.opencode/opencode.jsonc"
  cp "$backup/scripts/llm/mcp-servers.json" "$REPO/scripts/llm/mcp-servers.json"

  echo "render output: $render_output"
  [ "$render_status" -eq 0 ]

  # Ergebnis messen: beide Header stehen in der gerenderten Claude-Config.
  run bash -c "node -e \"
    const fs=require('fs');
    const d=JSON.parse(fs.readFileSync('$tmpd/.mcp.json','utf8'));
    const h=d.mcpServers['probe-http'].headers;
    console.log(h.Authorization+'|'+h['X-Probe']);
  \""
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == 'Bearer ${PROBE_TOKEN}|static-value' ]]

  rm -rf "$tmpd"
}

# ── Kein Secret in getrackten Dateien ────────────────────────────────────

@test "no expanded bearer token leaks into tracked harness configs" {
  # Positiv-Anker: die Dateien existieren und tragen ueberhaupt einen Header.
  [ -f "$REPO/.mcp.json" ]
  run grep -c 'Authorization' "$REPO/.mcp.json"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Negativ-Aussage: jeder Authorization-Wert ist eine ${VAR}-Referenz.
  run bash -c "node -e \"
    const fs=require('fs');
    const d=JSON.parse(fs.readFileSync('$REPO/.mcp.json','utf8'));
    let bad=[];
    for (const [n,s] of Object.entries(d.mcpServers)) {
      if(!s.headers) continue;
      for (const [k,v] of Object.entries(s.headers)) {
        if(/authorization/i.test(k) && !/\\\$\{[A-Z_]+\}/.test(v)) bad.push(n+'.'+k);
      }
    }
    console.log(bad.join(',')||'clean');
  \""
  echo "output: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "clean" ]
}
