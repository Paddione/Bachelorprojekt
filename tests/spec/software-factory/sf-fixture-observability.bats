#!/usr/bin/env bats
# tests/spec/software-factory/sf-fixture-observability.bats
# Failing Test für T005591 (Review PR #4447, Befund 1): Schlägt der
# kubectl-exec/psql im SELECT von purge_real_feature fehl, ist title leer und
# die Funktion returnt 0 — identisch zum idempotenten „row missing"-Fall.
# Ein transienter kubectl-Fehler hinterlässt damit einen Ghost-Seed ohne Spur.
# Erwartung: exec-Fehler → return != 0 + stderr-Beleg.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FAKE_BIN="$(mktemp -d)"
  cat > "${FAKE_BIN}/kubectl" <<'EOF'
#!/bin/bash
if [[ "$1" == "exec" ]]; then
  echo "transient exec failure" >&2
  exit 1
fi
# get pod: einen Pod nennen, damit die Funktion bis zum exec kommt
echo "pod/shared-db-0"
exit 0
EOF
  chmod +x "${FAKE_BIN}/kubectl"
  export PATH="${FAKE_BIN}:${PATH}"
}

teardown() {
  rm -rf "${FAKE_BIN}"
}

@test "purge_real_feature meldet exec-Fehler statt still 0 zu liefern (T005591)" {
  # Positiv-Anker (T002356-M1): die Funktion existiert und ist sourcbar.
  [ -f "${REPO_ROOT}/tests/lib/factory-test-fixtures.sh" ]

  source "${REPO_ROOT}/tests/lib/factory-test-fixtures.sh"

  run purge_real_feature "mentolder" "T999999"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qiE 'exec|fehler|failed'
}
