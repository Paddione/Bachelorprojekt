#!/usr/bin/env bats
# tests/spec/software-factory/babysit-prs-ci-never-ran.bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T012264 — babysit-prs.sh endet still ("no eligible red PR"), wenn ein
# offener PR keinerlei Check-Runs auf seinem HEAD hat (CI lief nie). Es gibt
# keinen Kandidaten, keine Notifikation — der PR liegt unsichtbar.
#
# PRUEFMODUS: Output-Verifikation. `scripts/factory/babysit-prs.sh` wird mit
# FACTORY_DRY_RUN=true und gh/ticket-Stubs als echter Kommandoaufruf
# durchlaufen; geprueft wird die Notify-Zeile (QA_NOTIFY_PAYLOAD) im Output.
#
# Positiv-Anker zuerst (T002356-M1): ein PR mit laufenden Checks
# (IN_PROGRESS-Rollup) ist KEIN "lief nie"-Fall und darf keine Notify auslösen.
#
# RED-Erwartung: ein PR mit leerem Rollup und total_count=0 auf dem HEAD erzeugt
# vor dem Fix keinerlei Notify — der Negativtest schlaegt fehl, bis der
# CI-never-ran-Scan implementiert ist.

load '_sf_common'

setup()    { _sf_setup; _t012264_setup; }
teardown() { _sf_teardown; }

_t012264_setup() {
  BIN_DIR="${BATS_TEST_TMPDIR}/t012264-bin"
  rm -rf "$BIN_DIR"; mkdir -p "$BIN_DIR"
  export PATH="$BIN_DIR:$PATH"

  GUARDS_REPO_DIR="${BATS_TEST_TMPDIR}/t012264-guards-repo"
  rm -rf "$GUARDS_REPO_DIR"; mkdir -p "$GUARDS_REPO_DIR/scripts"
  cat > "$GUARDS_REPO_DIR/scripts/ticket.sh" <<'TSTUB'
#!/usr/bin/env bash
echo "off"
exit 0
TSTUB
  chmod +x "$GUARDS_REPO_DIR/scripts/ticket.sh"
  export GUARDS_REPO="$GUARDS_REPO_DIR"

  export AGENT_LOCK_DIR="${BATS_TEST_TMPDIR}/t012264-agent-locks"
  rm -rf "$AGENT_LOCK_DIR"; mkdir -p "$AGENT_LOCK_DIR"

  export TMPDIR="$BATS_TEST_TMPDIR"
  export FACTORY_DRY_RUN=true
  export CLAUDE_BIN="/bin/false"
}

# _stub_gh <rollup-json> <total-count> — liefert genau einen nicht-draft PR mit
# dem angegebenen statusCheckRollup und beantwortet die check-runs-API des
# PR-HEAD mit dem angegebenen total_count.
_stub_gh() {
  local rollup="$1" total="$2"
  cat > "$BIN_DIR/gh" <<GHSTUB
#!/usr/bin/env bash
case "\$*" in
  "pr list"*)
    echo '[{"number":456,"headRefName":"neverbranch-1","isDraft":false,"mergeStateStatus":"BLOCKED","statusCheckRollup":$rollup,"author":{"login":"tester"},"labels":[]}]'
    ;;
  *"--json headRefOid"*)
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

# ── Positiv-Anker: laufende Checks sind kein "lief nie"-Fall ─────────────────#

@test "T012264: PR mit IN_PROGRESS-Checks loest KEINE ci-never-ran-Notify aus (Positiv-Anker)" {
  _stub_gh '[{"name":"CI","status":"IN_PROGRESS","conclusion":null}]' "3"

  run bash "$REPO/scripts/factory/babysit-prs.sh"

  ! grep -q "QA_NOTIFY_PAYLOAD" <<<"$output" \
    || { echo "Positiv-Anker verletzt: laufende Checks wurden als 'CI lief nie' gemeldet"; echo "$output"; false; }
}

# ── Negativfall / Reproduktion (RED bis zum Fix) ─────────────────────────────#
# expected: FAIL (RED — leerer Rollup + total_count=0 endet still ohne Notify)

@test "T012264: PR ohne jegliche Check-Runs auf dem HEAD muss eine ci-never-ran-Notify ausloesen" {
  _stub_gh '[]' "0"

  run bash "$REPO/scripts/factory/babysit-prs.sh"

  # RED phase: "no eligible red PR" ohne Notify → grep schlaegt fehl
  # GREEN phase: ci-never-ran-Scan emittiert die Notify mit der PR-Nummer
  grep -q "QA_NOTIFY_PAYLOAD" <<<"$output" \
    || { echo "❌ Bug reproduziert: PR ohne Check-Runs blieb unsichtbar — keine Notify emittiert"; echo "$output"; false; }
  grep -q "456" <<<"$output" \
    || { echo "❌ Die Notify nennt die betroffene PR-Nummer nicht"; echo "$output"; false; }
}
