#!/usr/bin/env bats
# tests/spec/software-factory/opencode-exec-ci-signal.bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T012266 — opencode-exec.sh prüft nach dem PR-Schritt nur, dass der
# PR existiert — nie, ob CI für dessen HEAD überhaupt lief. Ein PR, dessen
# HEAD keine Check-Runs hat (CI lief nie), durchläuft die Kette mit
# state=done/pr-ready, als wäre verifiziert. Sekundärbefund 3 aus T012239.
#
# Prüfmodus: Output-Verifikation (T002448-M4). opencode-exec.sh wird mit
# gh/opencode-Stubs (Muster: opencode-exec-prerun-shortcircuit.bats) über den
# T011581-Kurzschlusspfad (Implementierung liegt auf dem Branch) ausgeführt;
# geprüft wird die ci-never-ran-Meldung im Output.
#
# Positiv-Anker zuerst (T002356-M1): HEAD mit Check-Runs → keine
# ci-never-ran-Meldung, exit 0.
#
# RED-Erwartung: bei total_count=0 auf dem PR-HEAD erscheint vor dem Fix keine
# ci-never-ran-Meldung — der Negativtest schlägt fehl, bis das CI-Signal nach
# dem PR-Schritt implementiert ist.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  EXEC="$REPO_ROOT/scripts/factory/opencode-exec.sh"

  ORIGIN="$BATS_TEST_TMPDIR/origin.git"
  git init -q --bare "$ORIGIN"
  LAUNCH="$BATS_TEST_TMPDIR/launch"
  git init -q -b main "$LAUNCH"
  git -C "$LAUNCH" config user.email t@example.invalid
  git -C "$LAUNCH" config user.name Test
  echo base > "$LAUNCH/file.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "base"
  git -C "$LAUNCH" remote add origin "$ORIGIN"
  git -C "$LAUNCH" push -q origin main

  BRANCH="fix/stub-T012266"
  git -C "$LAUNCH" checkout -qb "$BRANCH"
  mkdir -p "$LAUNCH/openspec/changes/stub"
  echo "- [ ] Task" > "$LAUNCH/openspec/changes/stub/tasks.md"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "chore(plans): stub plan [T012266]"
  git -C "$LAUNCH" push -q -u origin "$BRANCH"

  STUB_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_BIN"
  export PATH="$STUB_BIN:$PATH"

  # Marker-Datei für die check-runs total_count des PR-HEAD.
  CHECK_RUNS_TOTAL="$BATS_TEST_TMPDIR/check-runs-total"
  export CHECK_RUNS_TOTAL
  echo "3" > "$CHECK_RUNS_TOTAL"

  _stub_gh
  _stub_opencode

  export TICKET_OFFLINE=1
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/agent-locks"
}

_stub_gh() {
  cat > "$STUB_BIN/gh" <<'EOF'
#!/usr/bin/env bash
case "$1 $2" in
  "pr list") echo "0" ;;
  "pr create") echo "https://github.invalid/pr/1" ;;
esac
case "$*" in
  *"--json headRefOid"*) echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ;;
  *"check-runs"*"total_count"*) cat "$CHECK_RUNS_TOTAL" ;;
esac
exit 0
EOF
  chmod +x "$STUB_BIN/gh"
}

_stub_opencode() {
  cat > "$STUB_BIN/opencode" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "$STUB_BIN/opencode"
}

# ── Positiv-Anker: HEAD hat Check-Runs — kein ci-never-ran-Signal ────────────#

@test "T012266: PR-HEAD mit Check-Runs loest KEINE ci-never-ran-Meldung aus (Positiv-Anker)" {
  echo implemented >> "$LAUNCH/file.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "fix(scripts): implementiert [T012266]"
  git -C "$LAUNCH" push -q origin "$BRANCH"

  echo "3" > "$CHECK_RUNS_TOTAL"

  run env OPENCODE_BIN="$STUB_BIN/opencode" bash "$EXEC" T012266 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ] \
    || { echo "unerwarteter Exit $status: $output"; false; }
  ! grep -qi "never.ran\|nie lief\|nie gelaufen" <<<"$output" \
    || { echo "Positiv-Anker verletzt: vorhandene Check-Runs wurden als 'CI lief nie' gemeldet"; echo "$output"; false; }
}

# ── Negativfall / Reproduktion (RED bis zum Fix) ─────────────────────────────#
# expected: FAIL (RED — total_count=0 auf dem PR-HEAD bleibt stumm, state=done)

@test "T012266: PR-HEAD ohne Check-Runs muss nach dem PR-Schritt eine ci-never-ran-Meldung ausgeben" {
  echo implemented >> "$LAUNCH/file.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "fix(scripts): implementiert [T012266]"
  git -C "$LAUNCH" push -q origin "$BRANCH"

  echo "0" > "$CHECK_RUNS_TOTAL"

  run env OPENCODE_BIN="$STUB_BIN/opencode" bash "$EXEC" T012266 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ] \
    || { echo "unerwarteter Exit $status: $output"; false; }

  # RED phase: keine ci-never-ran-Meldung → grep schlägt fehl
  # GREEN phase: das CI-Signal nach dem PR-Schritt meldet den leeren HEAD
  grep -qi "never.ran\|nie lief\|nie gelaufen" <<<"$output" \
    || { echo "❌ Bug reproduziert: PR-HEAD ohne Check-Runs blieb stumm — die Kette meldete pr-ready, obwohl CI nie lief"; echo "$output"; false; }
}
