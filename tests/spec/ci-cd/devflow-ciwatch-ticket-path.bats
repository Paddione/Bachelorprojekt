#!/usr/bin/env bats
# tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats
# SSOT: openspec/specs/ci-cd.md, openspec/specs/mishap-t002242.md
#
# T006370 — scripts/devflow-ci-watch.sh ruft ./scripts/ticket.sh relativ auf.
# Nach Worktree-Remove (cwd zeigt ins Nichts oder enthält kein scripts/)
# schlägt der Phase-Chain-Check fehl und das Skript meldet fälschlich
# "Phase-Chain nicht vollständig" mit Exit 6 — obwohl die Chain nie geprüft
# wurde (ticket.sh war gar nicht erreichbar).
#
# Beobachteter Vorfall (2026-08-15, Archiv-PR #4533): Watch-Teil (gh) lief,
# der Worktree war bereits entfernt, der relative Aufruf brach mit
# "No such file or directory" ab und das Skript endete mit Exit 6.
#
# Fix: ticket.sh wird relativ zum SKRIPT-Speicherort aufgelöst
# (TICKET_SH, Env-Override für Tests) statt relativ zum cwd; ist das Tool
# nicht erreichbar, bricht das Skript mit Exit 7 und klarer Meldung ab
# (Exit 6 bleibt exklusiv für eine NACHGEWIESENE Chain-Verletzung, Spec M1).
#
# Prüfmodus: output-verifiziert (T002448-M4). Die Tests führen das Skript
# aus einem cwd OHNE scripts/ aus und prüfen Exit-Code, Marker-Output des
# Fake-ticket.sh und format-freie Substrings (T002716). Ausnahme: der letzte
# Test prüft statisch, dass kein relativer ./scripts/ticket.sh-Aufruf mehr
# im Skript steht — die cwd-Unabhängigkeit der toleranten phase-Aufrufe
# (|| true) ist nur im Quelltext beobachtbar.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO/scripts/devflow-ci-watch.sh"

  WORK="$(mktemp -d)"
  export MARKER_DIR="$WORK/markers"
  mkdir -p "$MARKER_DIR" "$WORK/bin"

  echo "MERGED" > "$MARKER_DIR/pr-state"
  echo "" > "$MARKER_DIR/mock-rollup-failures"
  echo "0" > "$MARKER_DIR/mock-rollup-pending"

  # Fake git repo for the OPEN (green) path: `git rev-parse HEAD`-nahe
  # Mocks brauchen einen HEAD im WORK-Repo.
  git -C "$WORK" init -q -b main
  git -C "$WORK" -c user.email=t@example.invalid -c user.name=t commit -q --allow-empty -m init

  # Fake ticket.sh — bewusst NICHT unter $WORK/scripts/: das cwd des Tests
  # enthält kein ./scripts/, genau die Situation nach Worktree-Remove.
  # FAKE_ASSERT_EXIT steuert das assert-phase-chain-Ergebnis (0 = grün, 1 = rot).
  cat > "$WORK/fake-ticket.sh" <<'TICKET_EOF'
#!/usr/bin/env bash
echo "ticket.sh $*" >> "$MARKER_DIR/ticket-calls"
if [[ "$2" == "assert-phase-chain" ]]; then
  exit "${FAKE_ASSERT_EXIT:-0}"
fi
exit 0
TICKET_EOF
  chmod +x "$WORK/fake-ticket.sh"

  # Fake gh — gesteuert über Marker-Dateien (Muster: devflow-ci-watch-merged-exit.bats).
  cat > "$WORK/bin/gh" <<'GH_EOF'
#!/usr/bin/env bash
args="$*"
case "$args" in
  "pr view --json number -q .number") echo 1 ;;
  *"--json mergeStateStatus"*) echo "CLEAN" ;;
  *"--json mergeable"*) echo "MERGEABLE" ;;
  *"--json state -q .state") cat "$MARKER_DIR/pr-state" 2>/dev/null || echo "OPEN" ;;
  *"--json headRefOid -q .headRefOid")
    if [[ -f "$MARKER_DIR/mock-head-ref-oid" ]]; then cat "$MARKER_DIR/mock-head-ref-oid"
    else git -C "$WORK" rev-parse HEAD; fi
    ;;
  *"pr checks"*"--watch"*)
    touch "$MARKER_DIR/watch-called"
    exit 0
    ;;
  *"--json statusCheckRollup"*)
    if [[ "$args" == *'"FAILURE"'* || "$args" == *'"TIMED_OUT"'* ]]; then
      cat "$MARKER_DIR/mock-rollup-failures" 2>/dev/null || true
    elif [[ "$args" == *'COMPLETED'* ]]; then
      cat "$MARKER_DIR/mock-rollup-pending" 2>/dev/null || echo "0"
    else
      echo ""
    fi
    ;;
  *"check-runs"*"total_count"*)
    cat "$MARKER_DIR/mock-total-checks" 2>/dev/null || echo "3"
    ;;
  *) echo "" ;;
esac
GH_EOF
  chmod +x "$WORK/bin/gh"

  rm -f "$MARKER_DIR/ticket-calls"
}

teardown() {
  rm -rf "$WORK"
}

# ── Kern: assert-phase-chain erreicht ticket.sh unabhängig vom cwd ─────────#
# expected: FAIL (RED — das Skript ruft ./scripts/ticket.sh relativ auf;
# im cwd existiert kein scripts/, der Aufruf bricht ab → Exit 6)

@test "T006370: Phase-Chain-Check erreicht ticket.sh aus cwd ohne scripts/ (MERGED-Pfad)" {
  run env -C "$WORK" TICKET_SH="$WORK/fake-ticket.sh" \
    FAKE_ASSERT_EXIT=0 \
    PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T006370 "https://github.com/Paddione/Bachelorprojekt/pull/4533"
  [ "$status" -eq 0 ] || { echo "unerwarteter Exit $status (erwartet 0): $output"; false; }
  grep -q "assert-phase-chain" "$MARKER_DIR/ticket-calls" \
    || { echo "assert-phase-chain wurde nie aufgerufen — Testaufbau kaputt, nicht der Fix"; false; }
  [[ "$output" != *"Phase-Chain nicht vollständig"* ]] \
    || { echo "Skript behauptet 'Phase-Chain nicht vollständig', obwohl die Chain gar nicht geprüft werden konnte"; false; }
}

# ── Gate bleibt: nachgewiesene Chain-Verletzung → weiterhin Exit 6 (Spec M1) #
# expected: PASS — das Gate existiert bereits; der Test sichert es gegen den Fix ab

@test "T006370: nachgewiesene Chain-Verletzung beendet weiterhin mit Exit 6" {
  run env -C "$WORK" TICKET_SH="$WORK/fake-ticket.sh" \
    FAKE_ASSERT_EXIT=1 \
    PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T006370 "https://github.com/Paddione/Bachelorprojekt/pull/4533"
  [ "$status" -eq 6 ] || { echo "unerwarteter Exit $status (erwartet 6): $output"; false; }
  [[ "$output" == *"Phase-Chain nicht vollständig"* ]] \
    || { echo "Exit 6 ohne die zugehörige Meldung — Gate-Ausgabe unvollständig"; false; }
}

# ── Guard: nicht erreichbares Ticket-Tool → Exit 7 statt falschem Exit 6 ────#
# Simuliert Worktree-Remove: der aufgelöste TICKET_SH-Pfad existiert nicht mehr.
# expected: FAIL (RED — aktuell endet dieser Fall mit Exit 6 + falscher Behauptung)

@test "T006370: nicht erreichbares ticket.sh endet mit Exit 7 und klarer Meldung (Worktree-Remove-Szenario)" {
  run env -C "$WORK" TICKET_SH="$WORK/does-not-exist/ticket.sh" \
    PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T006370 "https://github.com/Paddione/Bachelorprojekt/pull/4533"
  [ "$status" -eq 7 ] || { echo "unerwarteter Exit $status (erwartet 7): $output"; false; }
  [[ "$output" == *"nicht erreichbar"* ]] \
    || { echo "Exit 7 ohne klare 'nicht erreichbar'-Meldung"; false; }
}

# ── Grüner Pfad (alle Checks grün) erreicht assert-phase-chain cwd-unabhängig #
# expected: FAIL (RED — der grüne Pfad ruft ./scripts/ticket.sh ebenfalls relativ)

@test "T006370: grüner Pfad (alle Checks grün) erreicht assert-phase-chain aus cwd ohne scripts/" {
  echo "OPEN" > "$MARKER_DIR/pr-state"
  echo "0" > "$MARKER_DIR/mock-rollup-pending"
  echo "3" > "$MARKER_DIR/mock-total-checks"
  git -C "$WORK" rev-parse HEAD > "$MARKER_DIR/mock-head-ref-oid"

  run env -C "$WORK" TICKET_SH="$WORK/fake-ticket.sh" \
    FAKE_ASSERT_EXIT=0 \
    PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T006370 "https://github.com/Paddione/Bachelorprojekt/pull/4533"
  [ "$status" -eq 0 ] || { echo "unerwarteter Exit $status (erwartet 0): $output"; false; }
  grep -q "assert-phase-chain" "$MARKER_DIR/ticket-calls" \
    || { echo "grüner Pfad erreicht assert-phase-chain nicht — Testaufbau kaputt, nicht der Fix"; false; }
}

# ── Statischer Guard: keine relativen ./scripts/ticket.sh-Aufrufe mehr ─────#
# Ausnahme (im Header dokumentiert): die toleranten phase-Aufrufe (|| true)
# sind nur im Quelltext beobachtbar; hier ist die Datei-Prüfung das Mittel.

@test "T006370: Skript enthält keinen relativen ./scripts/ticket.sh-Aufruf mehr" {
  ! grep -qF './scripts/ticket.sh' "$SCRIPT" \
    || { echo "relativer ./scripts/ticket.sh-Aufruf noch vorhanden — cwd-Abhängigkeit besteht fort"; false; }
}
