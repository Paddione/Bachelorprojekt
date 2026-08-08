#!/usr/bin/env bats
# tests/spec/sdlc-isolation/fleet-sequence-split.bats
# SSOT: openspec/changes/fleet-sequence-split/specs/sdlc-isolation.md (T002731)
#
# PRUEFMODUS (T002448-M4): Output-Verifikation. Die Tests rufen
# `scripts/sdlc/migrate-tickets.sh` AUF und pruefen $status und $output. Der
# Sequenzstand wird zusaetzlich direkt in der DB gemessen, also am Resultat und
# nicht am Quelltext.
#
# Die DB-gebundenen Tests laufen nur gegen einen erreichbaren fleet-Cluster und
# aendern dort NICHTS ausser der Sequenz — Zeilen legen sie keine an.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/fleet-sequence-split.bats

setup() {
  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)}"
  MIGRATE="${REPO_ROOT}/scripts/sdlc/migrate-tickets.sh"
  FLEET_CTX="fleet"
  FLEET_NS="workspace"
  BOUNDARY=900000
}

fleet_reachable() {
  kubectl --context "$FLEET_CTX" get nodes >/dev/null 2>&1
}

fleet_pod() {
  kubectl get pod -n "$FLEET_NS" --context "$FLEET_CTX" \
    -l 'app in (shared-db, shared-db-dev)' \
    --field-selector status.phase=Running -o name 2>/dev/null | head -1
}

fleet_seq() {
  local pod
  pod="$(fleet_pod)"
  [ -n "$pod" ] || return 1
  kubectl exec -i "$pod" -n "$FLEET_NS" --context "$FLEET_CTX" -c postgres -- \
    psql -U website -d website -qtA -c "SELECT last_value FROM tickets.external_id_seq;"
}

# ── Kommando-Oberflaeche ────────────────────────────────────────────────────

@test "T002731: migrate-tickets.sh offers a split-sequence command" {
  [ -f "$MIGRATE" ]

  run bash "$MIGRATE" --help
  [ "$status" -eq 0 ]

  # POSITIV-ANKER (T002356-M1): erst belegen, dass die Kommandoliste ueberhaupt
  # gelesen wurde — sonst ist die Aussage unten wertlos.
  [ "$(printf '%s\n' "$output" | grep -cE '^[[:space:]]*(status|freeze)\b')" -ge 1 ]

  # Auf den Zeilenanfang verankert: der Worktree-Pfad enthaelt
  # "fleet-sequence-split" und wuerde eine ungefilterte Suche erfuellen,
  # ohne dass das Kommando existiert.
  [ "$(printf '%s\n' "$output" | grep -cE '^[[:space:]]*split-sequence\b')" -ge 1 ]
}

@test "T002731: an unknown subcommand is still rejected" {
  # Gegenprobe: das Skript akzeptiert nicht einfach alles.
  run bash "$MIGRATE" definitely-not-a-command
  [ "$status" -ne 0 ]
}

# ── Verhalten gegen fleet ───────────────────────────────────────────────────

@test "T002731: split-sequence establishes the separated number range" {
  if ! fleet_reachable; then skip "fleet cluster not reachable"; fi

  run bash "$MIGRATE" split-sequence
  [ "$status" -eq 0 ]

  local seq
  seq="$(fleet_seq)"
  [ -n "$seq" ]
  [ "$seq" -ge "$BOUNDARY" ]
}

@test "T002731: split-sequence is idempotent and says so" {
  if ! fleet_reachable; then skip "fleet cluster not reachable"; fi

  local before after
  before="$(fleet_seq)"
  [ -n "$before" ]
  [ "$before" -ge "$BOUNDARY" ] || skip "split not established yet — covered by the previous test"

  run bash "$MIGRATE" split-sequence
  [ "$status" -eq 0 ]

  after="$(fleet_seq)"
  [ "$after" -eq "$before" ]
  [ "$(printf '%s\n' "$output" | grep -ciE 'unveraendert|bereits|no change')" -ge 1 ]
}

@test "T002731: status names the state of the split" {
  if ! fleet_reachable; then skip "fleet cluster not reachable"; fi

  run bash "$MIGRATE" status
  [ "$status" -eq 0 ]

  # POSITIV-ANKER: status gibt ueberhaupt die bekannten Abschnitte aus.
  [ "$(printf '%s\n' "$output" | grep -c 'fleet')" -ge 1 ]

  # Und benennt die Trennung — Zahl UND Zustandsaussage.
  [ "$(printf '%s\n' "$output" | grep -ciE 'external_id_seq|sequenz')" -ge 1 ]
  [ "$(printf '%s\n' "$output" | grep -ciE 'getrennt|split')" -ge 1 ]
}
