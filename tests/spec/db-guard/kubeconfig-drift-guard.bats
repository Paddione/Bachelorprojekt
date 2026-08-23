#!/usr/bin/env bats
# Guard gegen Kubeconfig-Context-Drift im Ticket-Write-Pfad [T015008].
#
# Prüfmodus: Output-Verifikation. Der Guard wird mit Fixture-Kubeconfigs
# ausgeführt und Exit-Code/Ausgabe geprüft (T002448-M4). Die Wiring-Zusicherung
# (ticket.sh ruft den Guard vor Writes) manifestiert sich ausschließlich im
# Quelltext und ist als struktureller Check dokumentiert.
#
# Hintergrund T015008: Der Context-Name `k3d-mentolder-dev` löste nach einem
# Docker-Restart auf 127.0.0.1:6446 statt 10.0.33.1:6446 auf → Ticket-Writes
# landeten 35 min in der falschen DB (Dual-Write-Split-Brain, Folge T015005).
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/db-guard/

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  GUARD="${REPO_ROOT}/scripts/vda/ticket/_ctx-guard.sh"
  FIXTURE_DIR="$(mktemp -d)"
  LOOPBACK_CFG="${FIXTURE_DIR}/loopback.yaml"
  LAN_CFG="${FIXTURE_DIR}/lan.yaml"
  cat > "$LOOPBACK_CFG" <<'YAML'
apiVersion: v1
kind: Config
contexts:
  - name: k3d-mentolder-dev
    context:
      cluster: k3d-mentolder-dev
      user: k3d-mentolder-dev
clusters:
  - name: k3d-mentolder-dev
    cluster:
      server: https://127.0.0.1:6446
users:
  - name: k3d-mentolder-dev
    user: {}
YAML
  sed 's|https://127.0.0.1:6446|https://10.0.33.1:6446|' "$LOOPBACK_CFG" > "$LAN_CFG"
}

teardown() {
  rm -rf "$FIXTURE_DIR"
}

@test "T015008: guard rejects loopback context server with loud drift error" {
  run env KUBECONFIG="$LOOPBACK_CFG" bash "$GUARD" k3d-mentolder-dev
  [ "$status" -ne 0 ] || { echo "Guard hat Loopback durchgelassen" >&2; return 1; }
  [[ "$output" == *"loopback"* ]] || { echo "Fehlermeldung nennt loopback nicht: $output" >&2; return 1; }
}

@test "T015008: guard accepts LAN-resolved context (Positiv-Anker)" {
  run env KUBECONFIG="$LAN_CFG" bash "$GUARD" k3d-mentolder-dev
  [ "$status" -eq 0 ] || { echo "Guard lehnt gültigen LAN-Kontext ab: $output" >&2; return 1; }
}

@test "T015008: escape hatch TICKET_ALLOW_LOCAL_CTX warns instead of aborting" {
  run env KUBECONFIG="$LOOPBACK_CFG" TICKET_ALLOW_LOCAL_CTX=1 bash "$GUARD" k3d-mentolder-dev
  [ "$status" -eq 0 ] || { echo "Escape-Hatch hat trotzdem abgebrochen" >&2; return 1; }
  [[ "$output" == *"WARN"* ]] || { echo "Escape-Hatch ohne Warnung" >&2; return 1; }
}

@test "T015008: ticket.sh wires the guard into its write path (structural)" {
  grep -q '_ctx-guard' "${REPO_ROOT}/scripts/ticket.sh" \
    || { echo "ticket.sh bindet _ctx-guard nicht ein" >&2; return 1; }
}

@test "T015008: guard script is syntactically valid bash" {
  run bash -n "$GUARD"
  [ "$status" -eq 0 ] || { echo "bash -n failed: $output" >&2; return 1; }
}
