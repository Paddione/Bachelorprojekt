#!/usr/bin/env bats
# tests/spec/software-factory/local-llm-freetoken-direct.bats — T900208
#
# Der llm-proxy (127.0.0.1:18235) ist seit 2026-09-03 stillgelegt (ADR-007).
# Einziges lokales Generierungs-Backend ist llama.cpp auf :1919 (T900348) mit dem
# Checkpoint Qwen3.8-27B-gsq. Diese Datei ersetzt
# software-factory/factory-model-lock.bats: der Modell-Pin/Lock kam aus dem
# /admin/factory-Endpunkt des Proxys und ist mit ihm entfallen.
#
# PRUEFMODUS: gemischt. route-provider.sh wird AUSGEFUEHRT (opus-Fallback ohne
# erreichbare DB — genau der Pfad, den CI hat). Die uebrigen Aussagen lesen die
# Quelle, weil sich ihr Ergebnis nur als DB-Zeile bzw. als Workflow-Laufzeit
# zeigt (dokumentierter Ausnahmefall T002448-M4). Kommentarzeilen sind
# ausgenommen: sie dokumentieren die Historie.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export TEST_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$TEST_BIN"
  # Ein curl, das einen gesperrten Pin liefern WUERDE: wird er noch gelesen,
  # taucht 'pinned-model' in der Ausgabe auf.
  cat >"$TEST_BIN/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s' '{"model":"pinned-model","locked":true}'
EOF
  # Kein DB-Zugang: factory_psql scheitert, route-provider nimmt den Default.
  cat >"$TEST_BIN/psql" <<'EOF'
#!/usr/bin/env bash
exit 2
EOF
  chmod +x "$TEST_BIN/curl" "$TEST_BIN/psql"
  export PATH="$TEST_BIN:$PATH"
  export FACTORY_PG_URL="postgres://invalid.invalid/none"
  unset FACTORY_MODEL_ID FACTORY_LOCAL_URL
  SURFACES=(
    scripts/factory/lib.sh
    scripts/factory/provider-register-local.sh
    scripts/factory/route-provider.sh
    scripts/factory/dispatcher-bridge.sh
    scripts/factory/pipeline.mjs
  )
}

_active_lines() { grep -nE "$1" "$2" | grep -vE '^[0-9]+:[[:space:]]*(#|//)' || true; }

@test "T900208: route-provider-Fallback zeigt auf FreeToken :1919 mit Qwen3.8" {
  cd "$REPO_ROOT"
  run bash scripts/factory/route-provider.sh factory-scout opus
  [ "$status" -eq 0 ]
  local json; json="$(printf '%s\n' "$output" | tail -1)"
  [ "$(jq -r .baseUrl <<<"$json")" = "http://127.0.0.1:1919" ]
  [ "$(jq -r .modelId <<<"$json")" = "Qwen3.8-27B-gsq" ]
  [ "$(jq -r .slotId <<<"$json")" = "null" ]
  # Der fruehere Proxy-Pin wird nicht mehr gelesen.
  [[ "$output" != *pinned-model* ]]
}

@test "T900208: FACTORY_MODEL_ID und FACTORY_LOCAL_URL ueberschreiben den Fallback" {
  cd "$REPO_ROOT"
  FACTORY_MODEL_ID=other-ckpt FACTORY_LOCAL_URL=http://127.0.0.1:2929 \
    run bash scripts/factory/route-provider.sh factory-scout opus
  [ "$status" -eq 0 ]
  local json; json="$(printf '%s\n' "$output" | tail -1)"
  [ "$(jq -r .modelId <<<"$json")" = "other-ckpt" ]
  [ "$(jq -r .baseUrl <<<"$json")" = "http://127.0.0.1:2929" ]
}

@test "T900208: factory_model_pin existiert nicht mehr" {
  cd "$REPO_ROOT"
  # Positiv-Anker: lib.sh laesst sich laden und liefert seine uebrigen Funktionen.
  run bash -c 'source scripts/factory/lib.sh; declare -F factory_backlog_count'
  [ "$status" -eq 0 ]
  run bash -c 'source scripts/factory/lib.sh; declare -F factory_model_pin'
  [ "$status" -ne 0 ]
}

@test "T900208: keine Routing-Flaeche nennt den stillgelegten Proxy oder seinen Pin" {
  local hits="" f h
  for f in "${SURFACES[@]}"; do
    [ -f "$REPO_ROOT/$f" ]   # Positiv-Anker: jede Flaeche existiert
    h="$(_active_lines '18235|/admin/factory([^-]|$)|factory_model_pin|FACTORY_MODEL_LOCKED' "$REPO_ROOT/$f")"
    [ -n "$h" ] && hits="${hits}${f}:\n${h}\n"
  done
  if [ -n "$hits" ]; then
    printf 'Verweise auf den stillgelegten llm-proxy:\n' >&2
    printf "$hits" >&2
    return 1
  fi
}

@test "T900208: qwen38-220k ist in keiner Routing-Flaeche mehr aktiver Wert" {
  local f
  for f in scripts/factory/provider-register-local.sh scripts/factory/route-provider.sh scripts/factory/pipeline.mjs; do
    [ -f "$REPO_ROOT/$f" ]
    [ -z "$(_active_lines 'qwen38-220k' "$REPO_ROOT/$f")" ]
  done
}

@test "T900208: provider-register-local.sh registriert FreeToken ohne /v1" {
  run grep -E '^LOCAL_URL=' "$REPO_ROOT/scripts/factory/provider-register-local.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *'http://127.0.0.1:1919}"'* ]]
}

@test "T900208: pipeline flash-Tier zielt auf FreeToken mit Qwen3.8-Default" {
  local pm="$REPO_ROOT/scripts/factory/pipeline.mjs"
  run grep -E "flash:.*baseUrl: 'http://127\.0\.0\.1:1919'" "$pm"
  [ "$status" -eq 0 ]
  run grep -F "process.env.FACTORY_MODEL_ID || 'Qwen3.8-27B-gsq'" "$pm"
  [ "$status" -eq 0 ]
}

@test "T900208: factory-MCP-Server (Go und Node) fallen auf FreeToken zurueck" {
  local go="$REPO_ROOT/scripts/factory/mcp-go/main.go" node="$REPO_ROOT/scripts/factory-mcp-node/server.mjs"
  run grep -F '"http://127.0.0.1:1919/v1"' "$go"
  [ "$status" -eq 0 ]
  run grep -F "'http://127.0.0.1:1919/v1'" "$node"
  [ "$status" -eq 0 ]
  [ -z "$(_active_lines '18235|qwen38-220k' "$go")" ]
  [ -z "$(_active_lines '18235|qwen38-220k' "$node")" ]
}
