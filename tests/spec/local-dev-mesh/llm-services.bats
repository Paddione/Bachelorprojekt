#!/usr/bin/env bats
# tests/spec/local-dev-mesh/llm-services.bats — T900191
# SSOT: openspec/specs/local-dev-mesh.md ("devmesh hosts the CPU-bound LLM and database
#       services", "The GPU endpoint exposes one port per workstation GPU service",
#       "The devmesh backend registry contains no loopback URLs")
#
# Pruefmodus: gemischt.
#   - Render-Assertions (Deployment/Service/EndpointSlice): ERGEBNIS von
#     `scripts/devmesh/render-stack.sh core` gegen das ECHTE devmesh/inventory.yaml, nicht der
#     Quelltext der Kustomize-Bausteine — nur so faellt der Test auch dann rot aus, wenn eine
#     Ressource existiert, aber nicht in die Kustomization aufgenommen wurde. Die erwarteten
#     GPU-Portnamen werden aus demselben Inventar abgeleitet (selbstreferenziell), damit der Test
#     nicht an konkreten Portnummern haengt, die sich mit dem Inventar aendern koennen.
#   - Supervisor-Selektion: AUSGEFUEHRTES `docker/mcp-node/supervisor.sh` gegen PATH-Stubs,
#     nicht gegrept — das Requirement behauptet Laufzeitverhalten ("startet ... und keinen
#     anderen Server"), das ein Quelltext-Grep nicht widerlegen kann.
#   - Migrations-Datei: Quelltext-Ausnahme (T002448-M4) — das Ergebnis der Migration ist ihr
#     SQL-Inhalt, ein Cluster zum Ausfuehren steht in CI nicht zur Verfuegung.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RENDER="$REPO_ROOT/scripts/devmesh/render-stack.sh"
  SUPERVISOR="$REPO_ROOT/docker/mcp-node/supervisor.sh"
  MIGRATION="$REPO_ROOT/scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql"
  INVENTORY="$REPO_ROOT/devmesh/inventory.yaml"
  FIX="$(mktemp -d)"
}

teardown() { rm -rf "$FIX"; }

render() { (cd "$REPO_ROOT" && bash "$RENDER" core) > "$FIX/core.yaml" 2> "$FIX/core.err" || { cat "$FIX/core.err" >&2; return 1; }; }

@test "Requirement 'devmesh hosts the CPU-bound LLM and database services': Deployment und Service im core-Profil" {
  render
  run yq ea -r 'select(.kind == "Deployment" and .metadata.name == "llm-services") | .metadata.name' "$FIX/core.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "llm-services" ]

  run yq ea -r 'select(.kind == "Deployment" and .metadata.name == "llm-services") | .spec.template.spec.containers[] | select(.name == "mcp-node") | .env[] | select(.name == "MCP_NODE_SERVICES") | .value' "$FIX/core.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "llm-proxy,postgres,bge-mcp" ]

  ports="$(yq ea -r 'select(.kind == "Service" and .metadata.name == "llm-services") | .spec.ports[].port' "$FIX/core.yaml" | sort -n)"
  # Positiv-Anker: die Service-Ressource existiert ueberhaupt und traegt Ports
  [ -n "$ports" ]
  expected="$(printf '13001\n13005\n18235\n')"
  [ "$ports" = "$expected" ]
}

@test "Requirement 'The GPU endpoint exposes one port per workstation GPU service': ein benannter Port je Inventar-Eintrag zusaetzlich zu http" {
  render
  # Positiv-Anker: das Inventar listet mindestens einen GPU-Dienst — sonst waere die
  # Teilmengen-Pruefung unten vakuos erfuellt.
  inv_count="$(yq -r '.gpu_endpoint.ports // [] | length' "$INVENTORY")"
  [ "$inv_count" -gt 0 ]

  while IFS=$'\t' read -r pname pport; do
    [ -z "$pname" ] && continue
    svc_port="$(yq ea -r "select(.kind == \"Service\" and .metadata.name == \"llm-gateway-host\") | .spec.ports[] | select(.name == \"$pname\") | .port" "$FIX/core.yaml")"
    [ "$svc_port" = "$pport" ] || { echo "Service-Port fuer $pname: erwartet $pport, war '$svc_port'"; return 1; }
    eps_port="$(yq ea -r "select(.kind == \"EndpointSlice\" and .metadata.name == \"llm-gateway-host\") | .ports[] | select(.name == \"$pname\") | .port" "$FIX/core.yaml")"
    [ "$eps_port" = "$pport" ] || { echo "EndpointSlice-Port fuer $pname: erwartet $pport, war '$eps_port'"; return 1; }
  done < <(yq -r '.gpu_endpoint.ports[] | [.name, .port] | @tsv' "$INVENTORY")

  # http bleibt zusaetzlich bestehen (Requirement fordert "einen Port je Dienst", nicht den
  # Ersatz des bestehenden Ports).
  http_port="$(yq ea -r 'select(.kind == "Service" and .metadata.name == "llm-gateway-host") | .spec.ports[] | select(.name == "http") | .port' "$FIX/core.yaml")"
  [ "$http_port" = "80" ]

  addr="$(yq ea -r 'select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .endpoints[0].addresses[0]' "$FIX/core.yaml")"
  inv_addr="$(yq -r '.gpu_endpoint.address' "$INVENTORY")"
  [ "$addr" = "$inv_addr" ]
}

@test "Requirement 'Only the three services start in the component': Supervisor startet genau llm-proxy, postgres, bge-mcp" {
  [ -f "$SUPERVISOR" ]
  BIN="$FIX/bin"; mkdir -p "$BIN"
  LOG="$FIX/supervisor.log"
  for t in node supergateway; do
    cat > "$BIN/$t" << STUB
#!/bin/sh
echo "invoked:$t:\$*" >> "$LOG"
sleep 30
STUB
    chmod +x "$BIN/$t"
  done

  # Token-Attrappen: postgres/bge-mcp pruefen nur Nicht-Leere (P2) — ohne sie
  # starten sie nicht und 'start ...' erschiene nie; der Test wuerde das
  # fehlende Token statt der Supervisor-Auswahl messen. Supervisor-stdout
  # landet ebenfalls in $LOG: 'start <dienst>' schreibt supervise() nach
  # stdout, die Stubs schreiben 'invoked:...' direkt ins Log.
  run env -i PATH="$BIN:/usr/bin:/bin" \
    MCP_NODE_SERVICES="llm-proxy,postgres,bge-mcp" \
    MCP_SUPERVISOR_RESTART_DELAY=100 \
    MCP_POSTGRES_TOKEN="guard" \
    BGE_MCP_TOKEN="guard" \
    DATABASE_URL="postgresql://x/y" \
    DEV_POD_REPO="$REPO_ROOT" \
    bash -c 'timeout 2 sh "$0" >> "$1" 2>&1' "$SUPERVISOR" "$LOG"
  # timeout beendet den Supervisor per SIGTERM (Exit 124) — das Log entsteht trotzdem.
  [ -s "$LOG" ]

  grep -qF 'start llm-proxy' "$LOG"
  grep -qF 'start postgres' "$LOG"
  grep -qF 'start bge-mcp' "$LOG"
  # Positiv-Anker oben (llm-proxy startete) belegt: fehlende Zeilen unten sind
  # tatsaechliche Abwesenheit, nicht ein grundsaetzlich leeres Log.
  refused="$(grep -cE 'start (github|ticket-mcp|task-runner|codebase-memory)' "$LOG" || true)"
  [ "$refused" -eq 0 ]
}

@test "Requirement 'devmesh backend registry contains no loopback URLs': Migration seedet keine 127.0.0.1/localhost-base_url" {
  [ -f "$MIGRATION" ]
  hits="$(grep -ciE '127\.0\.0\.1|localhost' "$MIGRATION" || true)"
  [ "$hits" -eq 0 ]
}

@test "Requirement 'devmesh backend registry contains no loopback URLs': mindestens eine llm-gateway-host-Zeile (Positiv-Anker)" {
  [ -f "$MIGRATION" ]
  hits="$(grep -ciF 'llm-gateway-host' "$MIGRATION" || true)"
  [ "$hits" -ge 1 ]
}
