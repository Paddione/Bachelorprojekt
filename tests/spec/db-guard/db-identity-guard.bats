#!/usr/bin/env bats
# Identity-Guard gegen Ghost-shared-db-Instanzen [T015168].
#
# Prüfmodus: Output-Verifikation (T002448-M4). `_pgpod` wird direkt über
# `bash -c 'source …/_ticket-core.sh; …'` mit Stub-kubectl auf PATH gefahren
# (Muster tests/spec/feature-product-linking.bats) und Exit-Code/Ausgabe geprüft.
#
# Hintergrund T015168: Ein fleet-Exec traf eine shared-db-Instanz mit LEERER
# Ticket-Tabelle, während dieselbe Pod-Auswahl auf dem anderen Pfad die echte
# SSOT bediente. _pgpod wählt bei Mehrfachtreffern blind head -1; ohne
# Identitätsprobe sind Writes Vertrauenswürdigkeits-lose Writes.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/db-guard/db-identity-guard.bats

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CORE="${REPO_ROOT}/scripts/vda/ticket/_ticket-core.sh"
  MIGRATION="${REPO_ROOT}/migrations/20260824-db-identity-marker.sql"
  EXPECTED_UUID="9f1d3c6e-4b2a-4f8a-9c1d-7e5b3a2f1d00"
  STUBDIR="$(mktemp -d)"
  cat > "$STUBDIR/kubectl" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"get pod"* ]]; then printf '%s\n' "\${POD_LINES:-pod/shared-db-0}"; exit 0; fi
if [[ "\$*" == *"exec"* ]]; then
  input="\$(cat)"
  if [[ "\$input" == *"db_identity"* ]]; then printf '%s' "\${IDENTITY_ANSWER-}"; fi
  exit 0
fi
exit 0
EOF
  chmod +x "$STUBDIR/kubectl"
}

teardown() { rm -rf "$STUBDIR"; }

_run_pgpod() {
  run env PATH="$STUBDIR:$PATH" POD_LINES="$1" IDENTITY_ANSWER="$2" TICKET_TEST_DB_OK="$3" \
    bash -c "source '$CORE'; NS='workspace'; CTX='k3d-mentolder-dev'; _pgpod"
}

@test "T015168: _pgpod bricht bei zwei Running-Pods laut ab und nennt beide Kandidaten" {
  _run_pgpod $'pod/shared-db-0\npod/shared-db-ghost' "" "1"
  [ "$status" -ne 0 ] || { echo "_pgpod hat Mehrfachtreffer still durchgelassen" >&2; return 1; }
  [[ "$output" == *"shared-db-0"* && "$output" == *"shared-db-ghost"* ]] \
    || { echo "Kandidatenliste unvollständig: $output" >&2; return 1; }
}

@test "T015168: fehlender Marker bricht ab und nennt db:migrate-Remediation" {
  _run_pgpod "pod/shared-db-0" "" "1"
  [ "$status" -ne 0 ] || { echo "leerer Marker wurde durchgelassen" >&2; return 1; }
  [[ "$output" == *"db:migrate"* ]] || { echo "Remediation fehlt: $output" >&2; return 1; }
}

@test "T015168: Marker-Mismatch bricht ab und nennt beide Werte" {
  _run_pgpod "pod/shared-db-0" "00000000-0000-0000-0000-000000000000" "1"
  [ "$status" -ne 0 ] || { echo "fremder Marker wurde akzeptiert" >&2; return 1; }
  [[ "$output" == *"$EXPECTED_UUID"* && "$output" == *"00000000"* ]] \
    || { echo "Mismatch-Meldung unvollständig: $output" >&2; return 1; }
}

@test "T015168: Escape-Hatch TICKET_ALLOW_UNVERIFIED_DB warnt statt abzubrechen" {
  run env PATH="$STUBDIR:$PATH" POD_LINES="pod/shared-db-0" IDENTITY_ANSWER="" \
    TICKET_TEST_DB_OK="1" TICKET_ALLOW_UNVERIFIED_DB="1" \
    bash -c "source '$CORE'; NS='workspace'; CTX='k3d-mentolder-dev'; _pgpod"
  [ "$status" -eq 0 ] || { echo "Hatch hat trotzdem abgebrochen: $output" >&2; return 1; }
  [[ "$output" == *"WARN"* ]] || { echo "Hatch ohne Warnung" >&2; return 1; }
}

@test "T015168: BATS-Sentinel-Regime überspringt die Marker-Probe" {
  # Kein TICKET_TEST_DB_OK → Sentinel-Regime (T002224) → Probe skip, Aufruf gelingt.
  _run_pgpod "pod/shared-db-0" "" ""
  [ "$status" -eq 0 ] || { echo "Probe lief im Sentinel-Regime: $output" >&2; return 1; }
}

@test "T015168: UUID-Konstante ist in Migration und Guard identisch (Parität)" {
  [ -f "$MIGRATION" ] || { echo "Migrationsdatei fehlt: $MIGRATION" >&2; return 1; }
  mig_uuid="$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$MIGRATION" | head -1)"
  core_uuid="$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$CORE" | head -1)"
  [ -n "$mig_uuid" ] || { echo "keine UUID in Migration" >&2; return 1; }
  [ -n "$core_uuid" ] || { echo "keine UUID in _ticket-core.sh" >&2; return 1; }
  [ "$mig_uuid" = "$core_uuid" ] \
    || { echo "Parität verletzt: migration=$mig_uuid core=$core_uuid" >&2; return 1; }
}
