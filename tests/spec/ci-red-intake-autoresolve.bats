#!/usr/bin/env bats
# tests/spec/ci-red-intake-autoresolve.bats
# Ticket: T900759 (CI-Rot-Intake entprellen per Auto-Resolve)
#
# Stub-Vorbild: tests/spec/cbm-refresh-cron-A4.bats (PATH-Override mit
# fake-`gh` und fake-`ticket.sh`, Aufruf-Logs in $BATS_TEST_TMPDIR).
# Das SUT ist scripts/ci-red-intake.sh (Subcommands `intake` + `resolve`).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SUT="$REPO_ROOT/scripts/ci-red-intake.sh"
  export GH_LOG="$BATS_TEST_TMPDIR/gh.log"
  export TICKET_LOG="$BATS_TEST_TMPDIR/ticket.log"
  : > "$GH_LOG"
  : > "$TICKET_LOG"
}

# --- Stub-Helfer -----------------------------------------------------------

# fake-`gh`: beantwortet `api .../check-runs...` mit $GH_CHECK_RUNS_JSON
# (Default: ein failure-Run); jeder Aufruf landet in $GH_LOG.
# $GH_API_EXIT steuert den Exit-Code (Default 0, ungleich 0 = gh-Fehler).
stub_gh() {
  local bin="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$bin"
  cat > "$bin/gh" <<'STUBEOF'
#!/bin/sh
echo "gh $*" >> "$GH_LOG"
if [ "${GH_API_EXIT:-0}" != "0" ]; then
  echo "stub-gh: api failed" >&2
  exit "${GH_API_EXIT:-1}"
fi
if [ -n "${GH_CHECK_RUNS_JSON:-}" ]; then
  printf '%s\n' "$GH_CHECK_RUNS_JSON"
else
  printf '%s\n' '{"total_count":1,"check_runs":[{"name":"ci","conclusion":"failure","html_url":"https://example.invalid/run/1","head_sha":"abc1234567890"}]}'
fi
exit 0
STUBEOF
  chmod +x "$bin/gh"
  export PATH="$bin:$PATH"
}

# fake-`ticket.sh`: `list --status triage` antwortet mit $TICKET_LIST_JSON
# (Default `[]`); create/add-comment/update-status loggen nach $TICKET_LOG.
stub_ticket() {
  local bin="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$bin"
  cat > "$bin/ticket.sh" <<'STUBEOF'
#!/bin/sh
echo "ticket.sh $*" >> "$TICKET_LOG"
case "$1" in
  list)
    if [ -n "${TICKET_LIST_JSON:-}" ]; then
      printf '%s\n' "$TICKET_LIST_JSON"
    else
      printf '[]\n'
    fi
    exit 0
    ;;
  create)
    echo "T999001"
    exit 0
    ;;
  add-comment|comment)
    echo "Comment added"
    exit 0
    ;;
  update-status)
    echo "Status updated"
    exit 0
    ;;
  *)
    echo "stub-ticket.sh: unknown subcommand $1" >&2
    exit 2
    ;;
esac
STUBEOF
  chmod +x "$bin/ticket.sh"
  export PATH="$bin:$PATH"
  # TICKET_SH-Seam (Default im SUT ist <repo>/scripts/ticket.sh): per
  # PATH-Lookup greift der Fake — ohne diesen Export träfe der Test die
  # echte Ticket-DB (beobachtet: versehentliches T901210, 2026-10-08).
  export TICKET_SH="ticket.sh"
}

# Leerer Mishap-Buffer per Env-Seam (Datei fehlt = Buffer leer, kein Fehler).
empty_mishap_buffer() {
  export MISHAP_BUFFER="$BATS_TEST_TMPDIR/mishap-buffer.json"
  printf '[]\n' > "$MISHAP_BUFFER"
}

# --- intake ----------------------------------------------------------------

@test "T900759: intake legt bei Rot genau ein Ticket mit Titelmuster an" {
  stub_gh
  stub_ticket
  empty_mishap_buffer
  export GH_CHECK_RUNS_JSON='{"total_count":2,"check_runs":[{"name":"ci","conclusion":"failure","html_url":"https://example.invalid/run/7","head_sha":"abc1234567890"},{"name":"lint","conclusion":"success","html_url":"https://example.invalid/run/8","head_sha":"abc1234567890"}]}'
  run bash "$SUT" intake --sha abc1234567890 --workflow ci
  [ "$status" -eq 0 ]
  grep -q "create" "$TICKET_LOG"
  grep -q "type=bug\|--type bug" "$TICKET_LOG"
  grep -q "CI-Rot auf main: ci @ abc1234" "$TICKET_LOG"
}

@test "T900759: zweite Intake gleicher SHA kommentiert statt Duplikat (T001147)" {
  stub_gh
  stub_ticket
  empty_mishap_buffer
  export GH_CHECK_RUNS_JSON='{"total_count":1,"check_runs":[{"name":"ci","conclusion":"failure","html_url":"https://example.invalid/run/7","head_sha":"abc1234567890"}]}'
  export TICKET_LIST_JSON='[{"external_id":"T123456","title":"CI-Rot auf main: ci @ abc1234 (ci)","status":"triage"}]'
  run bash "$SUT" intake --sha abc1234567890 --workflow ci
  [ "$status" -eq 0 ]
  ! grep -q "^ticket.sh create" "$TICKET_LOG"
  grep -q "add-comment" "$TICKET_LOG"
  grep -q "T123456" "$TICKET_LOG"
}

@test "T900759: Mishap-Buffer-Eintrag gleichen Titels blockt Neuanlage (T002844)" {
  stub_gh
  stub_ticket
  export MISHAP_BUFFER="$BATS_TEST_TMPDIR/mishap-buffer.json"
  printf '[{"title":"CI-Rot auf main: ci @ abc1234 (ci)"}]\n' > "$MISHAP_BUFFER"
  export GH_CHECK_RUNS_JSON='{"total_count":1,"check_runs":[{"name":"ci","conclusion":"failure","html_url":"https://example.invalid/run/7","head_sha":"abc1234567890"}]}'
  export TICKET_LIST_JSON='[]'
  run bash "$SUT" intake --sha abc1234567890 --workflow ci
  [ "$status" -eq 0 ]
  ! grep -q "^ticket.sh create" "$TICKET_LOG"
}

# --- resolve ---------------------------------------------------------------

@test "T900759: resolve schliesst bei gruenem Beleg-Run als done mit Beleg-Kommentar" {
  stub_gh
  stub_ticket
  empty_mishap_buffer
  export GH_CHECK_RUNS_JSON='{"total_count":2,"check_runs":[{"name":"ci","conclusion":"success","html_url":"https://example.invalid/run/9","head_sha":"def9876543210"},{"name":"lint","conclusion":"success","html_url":"https://example.invalid/run/10","head_sha":"def9876543210"}]}'
  export TICKET_LIST_JSON='[{"external_id":"T123456","title":"CI-Rot auf main: ci @ abc1234 (ci)","status":"triage"}]'
  run bash "$SUT" resolve --sha def9876543210
  [ "$status" -eq 0 ]
  grep -q "add-comment" "$TICKET_LOG"
  grep -q "https://example.invalid/run/9" "$TICKET_LOG"
  grep -q "update-status" "$TICKET_LOG"
  grep -q "done" "$TICKET_LOG"
}

@test "T900759: resolve bei unbestimmbarem CI-Status schliesst nichts (fail-closed)" {
  stub_gh
  stub_ticket
  empty_mishap_buffer
  export GH_API_EXIT="1"
  export TICKET_LIST_JSON='[{"external_id":"T123456","title":"CI-Rot auf main: ci @ abc1234 (ci)","status":"triage"}]'
  run bash "$SUT" resolve --sha def9876543210
  [ "$status" -ne 0 ]
  ! grep -q "update-status" "$TICKET_LOG"
}

# --- Konvention --------------------------------------------------------------

@test "T900759: AGENTS.md enthaelt den Auto-Resolve-Abschnitt" {
  grep -q "Auto-Resolve" "$REPO_ROOT/AGENTS.md"
}
