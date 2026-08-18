#!/usr/bin/env bats
# tests/spec/software-factory/babysit-prs-red-detection.bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T012239 — babysit-prs.sh selektiert rote PR-Kandidaten nur bei
# conclusion == "FAILURE". Checks mit TIMED_OUT/ERROR (legitime Fehlkonklusionen
# derselben API) erzeugen keinen Kandidaten, keine Notifikation — rote PRs bleiben
# fuer den Repo-Scanner unsichtbar.
#
# PRUEFMODUS: Output-Verifikation. `scripts/factory/babysit-prs.sh` wird mit
# FACTORY_DRY_RUN=true und gh/ticket-Stubs als echter Kommandoaufruf durchlaufen;
# geprueft wird der Scan-Output ("selected PR #…"), kein Source-Grep.
#
# Positiv-Anker zuerst (T002356-M1): ein FAILURE-Rollup wird schon vor dem Fix
# selektiert — beweist, dass der Scan-Pfad ueberhaupt erreicht wird.
#
# RED-Erwartung: ein TIMED_OUT-Rollup erzeugt vor dem Fix "no eligible red PR"
# (exit 0 ohne Selektion) — der Negativtest schlaegt fehl, bis der Filter
# TIMED_OUT/ERROR einschliesst.

load '_sf_common'

setup()    { _sf_setup; _t012239_setup; }
teardown() { _sf_teardown; }

_t012239_setup() {
  BIN_DIR="${BATS_TEST_TMPDIR}/t012239-bin"
  rm -rf "$BIN_DIR"; mkdir -p "$BIN_DIR"
  export PATH="$BIN_DIR:$PATH"

  # ticket.sh-Stub fuer guard_killswitch_on (echo "off" = killswitch nicht aktiv) —
  # entkoppelt den Scan von der echten Ticket-DB (Muster T003137).
  GUARDS_REPO_DIR="${BATS_TEST_TMPDIR}/t012239-guards-repo"
  rm -rf "$GUARDS_REPO_DIR"; mkdir -p "$GUARDS_REPO_DIR/scripts"
  cat > "$GUARDS_REPO_DIR/scripts/ticket.sh" <<'TSTUB'
#!/usr/bin/env bash
echo "off"
exit 0
TSTUB
  chmod +x "$GUARDS_REPO_DIR/scripts/ticket.sh"
  export GUARDS_REPO="$GUARDS_REPO_DIR"

  # agent-lock-Scope isolieren (Muster T003137): keine fremden Locks im Test.
  export AGENT_LOCK_DIR="${BATS_TEST_TMPDIR}/t012239-agent-locks"
  rm -rf "$AGENT_LOCK_DIR"; mkdir -p "$AGENT_LOCK_DIR"

  export TMPDIR="$BATS_TEST_TMPDIR"
  export FACTORY_DRY_RUN=true
  export CLAUDE_BIN="/bin/false"   # DRY-RUN erreicht den Agent-Pfad nie; Sicherheitsnetz
}

# _stub_gh <rollup-conclusion> — liefert genau einen nicht-draft PR ohne Labels,
# dessen statusCheckRollup genau einen COMPLETED-Check mit der gegebenen
# conclusion traegt.
_stub_gh() {
  local conclusion="$1"
  cat > "$BIN_DIR/gh" <<GHSTUB
#!/usr/bin/env bash
case "\$*" in
  "pr list"*)
    echo '[{"number":123,"headRefName":"testbranch-1","isDraft":false,"mergeStateStatus":"BLOCKED","statusCheckRollup":[{"name":"CI Job X","conclusion":"$conclusion"}],"author":{"login":"tester"},"labels":[]}]'
    ;;
  *"pr view"*"--json comments"*) echo '{"comments":[]}' ;;
  *"run view"*) printf '%s\n' "generated artifact(s) are stale" "run 'task freshness:regenerate'" ;;
  *) exit 0 ;;
esac
GHSTUB
  chmod +x "$BIN_DIR/gh"
}

# ── Positiv-Anker: FAILURE wird schon vor dem Fix selektiert ─────────────────#

@test "T012239: FAILURE-Rollup wird als roter Kandidat selektiert (Positiv-Anker)" {
  _stub_gh "FAILURE"

  run bash "$REPO/scripts/factory/babysit-prs.sh"

  grep -q "selected PR #123" <<<"$output" \
    || { echo "Positiv-Anker verletzt: FAILURE-Rollup wurde nicht selektiert — Testaufbau kaputt, nicht der Fix"; echo "$output"; false; }
}

# ── Negativfall / Reproduktion (RED bis zum Fix) ─────────────────────────────#
# expected: FAIL (RED — der Filter matcht nur FAILURE, TIMED_OUT bleibt unsichtbar)

@test "T012239: TIMED_OUT-Rollup muss als roter Kandidat selektiert werden" {
  _stub_gh "TIMED_OUT"

  run bash "$REPO/scripts/factory/babysit-prs.sh"

  # RED phase: Filter matcht nur FAILURE → "no eligible red PR", exit 0 → FAILS
  # GREEN phase: TIMED_OUT zaehlt als rot → "selected PR #123" → PASSES
  grep -q "selected PR #123" <<<"$output" \
    || { echo "❌ Bug reproduziert: TIMED_OUT-Rollup blieb unsichtbar — der Scanner selektierte keinen Kandidaten"; echo "$output"; false; }
}

@test "T012239: ERROR-Rollup muss als roter Kandidat selektiert werden" {
  _stub_gh "ERROR"

  run bash "$REPO/scripts/factory/babysit-prs.sh"

  grep -q "selected PR #123" <<<"$output" \
    || { echo "❌ Bug reproduziert: ERROR-Rollup blieb unsichtbar — der Scanner selektierte keinen Kandidaten"; echo "$output"; false; }
}
