#!/usr/bin/env bats

# PRUEFMODUS: Output-Verifikation (T002448-M4) — der echte scripts/ticket.sh
# wird ausgefuehrt, $status/$output plus der kubectl-Stub-Log ($KUBECTL_LOG)
# werden geprueft. Fix: T004269 (p3) — git-show-Fallback fuer branch-only Plaene.
# Positiv-Anker (T002356-M1): status==0 + Erfolgsmeldung beweisen die Harness,
# der Marker im KUBECTL_LOG beweist den gelieferten Plan-Inhalt.

setup() {
  REPO_ROOT="$(pwd)"
  BATS_TMPDIR=$(mktemp -d)
  STUB_BIN="$BATS_TMPDIR/bin"
  mkdir -p "$STUB_BIN"

  FIXTURE="$BATS_TMPDIR/fixture"
  mkdir -p "$FIXTURE"

  # kubectl-Stub: antwortet kontextunabhaengig und haengt jedes exec-stdin
  # (die SQL-Statements aus cmd_archive_plan) an $KUBECTL_LOG an, damit der
  # Test den Plan-Inhalt (git-show-Fallback) im Log nachweisen kann.
  cat <<'KUBECTL' > "$STUB_BIN/kubectl"
#!/bin/bash
if [[ "$1" == "get" ]]; then
  echo "pod/shared-db-0"
elif [[ "$1" == "exec" ]]; then
  # ticket.sh: `printf "%s" "$plan_content" | kubectl exec ...` — stdin lesen
  TMP_IN=$(mktemp)
  cat > "$TMP_IN"

  SQL_CONTENT=$(cat "$TMP_IN")
  if [[ "$SQL_CONTENT" == *"SELECT id FROM tickets.tickets"* ]]; then
    echo "11111111-2222-3333-4444-555555555555"
  elif [[ "$SQL_CONTENT" == *"SELECT count"* ]]; then
    echo "1"
  else
    echo "INSERT 0 1"
  fi
  mkdir -p "$(dirname "$KUBECTL_LOG")"
  cat "$TMP_IN" >> "$KUBECTL_LOG"
  rm "$TMP_IN"
fi
KUBECTL
  chmod +x "$STUB_BIN/kubectl"

  # Fixture: die Plandatei existiert NUR im Branch (T004269-Adapter-cwd-Fall),
  # nicht auf Disk.
  cd "$FIXTURE"
  git init -b main
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -m "chore: init"

  git checkout -b feature/plan-only-T004269
  mkdir -p plans
  echo "NUR-IM-BRANCH-ARCHIV-TEST" > plans/demo.md
  git add plans/demo.md
  git commit -m "feat: add plan"
  git checkout main
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "Test: archive-plan with git show fallback -> status == 0 + marker in log" {
  export KUBECTL_LOG="$BATS_TMPDIR/kubectl.log"
  rm -f "$KUBECTL_LOG"

  cd "$FIXTURE"
  # Lauf mit kubectl-Stub vor PATH — kein Cluster, keine DB, TICKET_OFFLINE unset.
  run env PATH="$STUB_BIN:$PATH" bash "$REPO_ROOT/scripts/ticket.sh" archive-plan \
    --id T004269 \
    --slug demo \
    --branch feature/plan-only-T004269 \
    --plan-file plans/demo.md

  [ "$status" == 0 ]
  [[ "$output" =~ "Plan successfully archived for ticket T004269" ]]
  # git-show-Fallback muss den Plan-Inhalt real in den INSERT-Stdin liefern.
  [[ $(cat "$KUBECTL_LOG") =~ "NUR-IM-BRANCH-ARCHIV-TEST" ]]
}

@test "Fehlerpfad: weder Datei noch Blob -> exit != 0 + alte Meldung (P3.3)" {
  cd "$FIXTURE"
  # plans/ghost.md existiert weder auf Disk noch als Blob im Branch.
  run env PATH="$STUB_BIN:$PATH" bash "$REPO_ROOT/scripts/ticket.sh" archive-plan \
    --id T004269 \
    --slug demo \
    --branch feature/plan-only-T004269 \
    --plan-file plans/ghost.md

  [ "$status" != 0 ]
  [[ "$output" =~ "plan file does not exist or is empty" ]]
}
