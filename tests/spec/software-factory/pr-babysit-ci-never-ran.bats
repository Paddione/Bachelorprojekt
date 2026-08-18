#!/usr/bin/env bats
# tests/spec/software-factory/pr-babysit-ci-never-ran.bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T012265 — pr-babysit-ticket.sh bewertet über `gh pr checks
# --json name,state` ohne SHA-Bezug. Liefert die aggregierte Liste die
# Vorgänger-SUCCESS, während auf dem aktuellen PR-HEAD keine Check-Runs
# existieren (CI lief nie), meldet der Babysitter implizit "ok" und schleift
# endlos im grünen Poll — der T003225-Fall, den T012239 für devflow-ci-watch.sh
# über die check-runs-API des headRefOid löste.
#
# PRUEFMODUS: Output-Verifikation. Das Skript wird mit gh-Stub (PATH) als
# echter Kommandoaufruf durchlaufen; geprueft wird das ci-never-ran-Signal im
# Output bzw. der fruehe Exit statt des Endlos-Polls.
#
# Positiv-Anker zuerst (T002356-M1): PR-HEAD hat Check-Runs und der PR ist
# gemergt — _on_merged-Pfad endet exit 0 ohne ci-never-ran-Signal.
#
# RED-Erwartung: bei total_count=0 auf dem HEAD haengt das Skript vor dem Fix
# im gruenen Poll (timeout, kein Signal) — der Negativtest schlaegt fehl, bis
# der SHA-Bezug implementiert ist.

load '_sf_common'

setup()    { _sf_setup; _t012265_setup; }
teardown() { _sf_teardown; }

_t012265_setup() {
  BIN_DIR="${BATS_TEST_TMPDIR}/t012265-bin"
  rm -rf "$BIN_DIR"; mkdir -p "$BIN_DIR"
  export PATH="$BIN_DIR:$PATH"

  export AGENT_LOCK_DIR="${BATS_TEST_TMPDIR}/t012265-agent-locks"
  rm -rf "$AGENT_LOCK_DIR"; mkdir -p "$AGENT_LOCK_DIR"

  export TMPDIR="$BATS_TEST_TMPDIR"
}

# _stub_gh <total-count> <pr-state> — `gh pr checks` liefert immer die
# Vorgänger-SUCCESS-Liste (aggregiert, SHA-los); headRefOid + check-runs
# werden je nach Fix-Stand abgefragt.
_stub_gh() {
  local total="$1" state="$2"
  cat > "$BIN_DIR/gh" <<GHSTUB
#!/usr/bin/env bash
case "\$*" in
  "pr checks"*)
    echo '[{"name":"CI","state":"SUCCESS"}]'
    ;;
  *"--json state -q .state")
    echo "$state"
    ;;
  *"--json headRefOid -q .headRefOid")
    echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ;;
  *"check-runs"*"total_count"*)
    echo "$total"
    ;;
  *) exit 0 ;;
esac
GHSTUB
  chmod +x "$BIN_DIR/gh"
}

# ── Positiv-Anker: HEAD hat Runs, PR gemergt — kein ci-never-ran-Signal ──────#

@test "T012265: gemergter PR mit Check-Runs auf dem HEAD loest KEIN ci-never-ran-Signal aus (Positiv-Anker)" {
  _stub_gh "3" "MERGED"

  run env REPO="$REPO" PATH="$BIN_DIR:$PATH" POLL_INTERVAL=1 MAX_CI_ATTEMPTS=1 \
    timeout 15 bash "$REPO/scripts/factory/pr-babysit-ticket.sh" T999999 456

  [ "$status" -eq 0 ] \
    || { echo "unerwarteter Exit $status: $output"; false; }
  ! grep -qi "never.ran\|nie gelaufen\|nie lief" <<<"$output" \
    || { echo "Positiv-Anker verletzt: vorhandene Check-Runs wurden als 'CI lief nie' gemeldet"; echo "$output"; false; }
}

# ── Negativfall / Reproduktion (RED bis zum Fix) ─────────────────────────────#
# expected: FAIL (RED — die Vorgänger-SUCCESS-Liste maskiert den leeren HEAD;
# das Skript pollt endlos im grünen Zweig statt ein ci-never-ran-Signal zu geben)

@test "T012265: HEAD ohne Check-Runs trotz Vorgänger-SUCCESS muss ein ci-never-ran-Signal geben" {
  _stub_gh "0" "OPEN"

  run env REPO="$REPO" PATH="$BIN_DIR:$PATH" POLL_INTERVAL=1 MAX_CI_ATTEMPTS=1 \
    timeout 15 bash "$REPO/scripts/factory/pr-babysit-ticket.sh" T999999 456

  # RED phase: timeout (124) ohne Signal → grep schlaegt fehl
  # GREEN phase: frueher Exit != 0 mit ci-never-ran-Signal statt Endlos-Poll
  [ "$status" -ne 124 ] \
    || { echo "❌ Bug reproduziert: Skript hing im grünen Poll (timeout), obwohl der PR-HEAD keine Check-Runs hat — Vorgänger-SUCCESS maskiert 'CI lief nie'"; echo "$output"; false; }
  grep -qi "never.ran\|nie gelaufen\|nie lief" <<<"$output" \
    || { echo "❌ Kein ci-never-ran-Signal im Output"; echo "$output"; false; }
}
