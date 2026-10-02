#!/usr/bin/env bats
# tests/spec/guard-preconditions/guard-preconditions.bats
# Ticket: T900651
#
# Selbsttest fuer tests/lib/guard-preconditions.sh. Alle Faelle laufen
# offline und gruen: `skip` wird als Stub (exit 42) injiziert, `kubectl`
# und `curl` bei Bedarf als Shell-Funktion ueberschrieben. Kein Fall
# haengt von Cluster, Netz oder installierten Binaries ab.

load "../../lib/guard-preconditions.sh"

# _with_skip_stub <bash-code> — fuehrt Code mit gestubbtem `skip` aus.
# Der Stub meldet "SKIP: <grund>" auf stdout und beendet mit 42.
_with_skip_stub() {
  LIB="$BATS_TEST_DIRNAME/../../lib/guard-preconditions.sh" run bash -c "
    source \"\$LIB\"
    skip() { echo \"SKIP: \$1\"; exit 42; }
    $1
  "
}

@test "require_command laesst vorhandenes Binary durch" {
  require_command bash
  [ "$?" -eq 0 ]
}

@test "require_command skippt mit Binary-Namen bei fehlendem Binary" {
  _with_skip_stub 'require_command __gibt_es_nicht_4123__ "Test-Probe"'
  [ "$status" -eq 42 ]
  [[ "$output" == *"__gibt_es_nicht_4123__"* ]]
  [[ "$output" == *"Test-Probe"* ]]
}

@test "port_open meldet geschlossenen Loopback-Port als zu" {
  run port_open 127.0.0.1 9
  [ "$status" -ne 0 ]
}

@test "require_port skippt mit host:port bei geschlossenem Port" {
  _with_skip_stub 'require_port 127.0.0.1 9 "Test-Listener"'
  [ "$status" -eq 42 ]
  [[ "$output" == *"127.0.0.1:9"* ]]
}

@test "http_code liefert leer oder 000 bei unerreichbarem Ziel" {
  run http_code "http://127.0.0.1:9/nirgends"
  [ "$status" -eq 0 ]
  [[ "$output" == "" || "$output" == "000" ]]
}

@test "require_http skippt mit erwartetem Code bei unerreichbarem Ziel" {
  _with_skip_stub 'require_http "http://127.0.0.1:9/nirgends" 200 "Test-Route"'
  [ "$status" -eq 42 ]
  [[ "$output" == *"statt '200'"* ]]
}

@test "require_http_contains skippt bei unerreichbarem Ziel" {
  _with_skip_stub 'require_http_contains "http://127.0.0.1:9/katalog" "modell-x" "Test-Katalog"'
  [ "$status" -eq 42 ]
  [[ "$output" == *"Test-Katalog"* ]]
}

@test "require_http_contains skippt mit Nadel bei fehlendem Inhalt" {
  _with_skip_stub 'curl() { echo "{\"models\":[]}"; }; require_http_contains "http://127.0.0.1:9/katalog" "modell-x" "Test-Katalog"'
  [ "$status" -eq 42 ]
  [[ "$output" == *"modell-x"* ]]
}

@test "require_http_contains laesst vorhandenen Inhalt durch" {
  _with_skip_stub 'curl() { echo "{\"models\":[\"modell-x\"]}"; }; require_http_contains "http://127.0.0.1:9/katalog" "modell-x" "Test-Katalog"; echo PASS-THROUGH'
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS-THROUGH"* ]]
}

@test "require_k8s_context skippt bei unerreichbarem Cluster" {
  _with_skip_stub 'kubectl() { return 1; }; require_k8s_context __kontext_4123__'
  [ "$status" -eq 42 ]
  [[ "$output" == *"__kontext_4123__ not running"* ]]
}

@test "require_k8s_rollout laesst ausgerolltes Deployment durch" {
  _with_skip_stub 'kubectl() { echo "1"; return 0; }; require_k8s_rollout __ctx__ __ns__ deploy __name__ && echo PASS-THROUGH'
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS-THROUGH"* ]]
}

@test "node_modules_fresh erkennt frischen Install (Module neuer als Lockfile)" {
  local dir="$BATS_TMPDIR/nm-fresh"
  mkdir -p "$dir/node_modules"
  touch -d '2026-01-01' "$dir/pnpm-lock.yaml" "$dir/package.json"
  touch -d '2026-06-01' "$dir/node_modules/.modules.yaml"
  run node_modules_fresh "$dir"
  [ "$status" -eq 0 ]
}

@test "node_modules_fresh meldet veralteten Install (Lockfile neuer)" {
  local dir="$BATS_TMPDIR/nm-stale"
  mkdir -p "$dir/node_modules"
  touch -d '2026-06-01' "$dir/pnpm-lock.yaml" "$dir/package.json"
  touch -d '2026-01-01' "$dir/node_modules/.modules.yaml"
  run node_modules_fresh "$dir"
  [ "$status" -eq 1 ]
}

@test "node_modules_fresh meldet fehlende Module" {
  run node_modules_fresh "$BATS_TMPDIR/nm-missing-$$"
  [ "$status" -eq 1 ]
}

@test "require_fresh_node_modules skippt mit pnpm-install-Hinweis bei Skew" {
  local dir="$BATS_TMPDIR/nm-stale-skip"
  mkdir -p "$dir/node_modules"
  touch -d '2026-06-01' "$dir/pnpm-lock.yaml" "$dir/package.json"
  touch -d '2026-01-01' "$dir/node_modules/.modules.yaml"
  _with_skip_stub "require_fresh_node_modules '$dir'"
  [ "$status" -eq 42 ]
  [[ "$output" == *"pnpm install"* ]]
}

@test "require_fresh_node_modules laesst frischen Install durch" {
  local dir="$BATS_TMPDIR/nm-fresh-through"
  mkdir -p "$dir/node_modules"
  touch -d '2026-01-01' "$dir/pnpm-lock.yaml" "$dir/package.json"
  touch -d '2026-06-01' "$dir/node_modules/.modules.yaml"
  _with_skip_stub "require_fresh_node_modules '$dir' && echo PASS-THROUGH"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS-THROUGH"* ]]
}

@test "require_k8s_rollout skippt mit readyReplicas bei 0/1" {
  _with_skip_stub 'kubectl() { if [[ "$*" == *"readyReplicas"* ]]; then echo "0"; elif [[ "$*" == *"spec.replicas"* ]]; then echo "1"; fi; return 0; }; require_k8s_rollout __ctx__ __ns__ deploy __name__'
  [ "$status" -eq 42 ]
  [[ "$output" == *"deploy/__name__"* ]]
  [[ "$output" == *"readyReplicas=0/1"* ]]
}
