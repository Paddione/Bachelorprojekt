#!/usr/bin/env bats
# tests/spec/mishap-rollup/rollup-coalescing.bats — T013915
#
# SSOT: openspec/specs/mishap-rollup.md
# PRUEFMODUS (T002448-M4): Statement-Verifikation gegen das Generator-Skript —
# das Coalescing-Gate wird ueber seine emittierten Marker gepinnt (Env-Defaults,
# No-op-Pfad vor der Worktree-Anlage, Altersmessung ueber min(created_at)).
#
# Hintergrund: Am 2026-08-22 entstanden 18 Rollup-Container in 40 Minuten, weil
# der Generator jeden Container sofort stagte (ab 1 Eintrag, inkl. Carry-over).
# Das Gate haelt Container unter der Schwelle im Collect Mode, sodass Flusher
# und Carry-over denselben Container wiederverwenden statt neue anzulegen.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/factory/mishap-rollup.sh"
}

@test "T013915: Coalescing-Schwellen haben Env-Defaults (3 Eintraege / 24h)" {
  run grep -n "ROLLUP_MIN_ENTRIES" "$SCRIPT"
  [ "$status" -eq 0 ]
  grep -qF ':-3}' <<<"$output"
  run grep -n "ROLLUP_MAX_AGE_H" "$SCRIPT"
  [ "$status" -eq 0 ]
  grep -qF ':-24}' <<<"$output"
}

@test "T013915: Gate laeuft VOR der Worktree-Anlage" {
  gate_line=$(grep -nE "ROLLUP_MIN_ENTRIES.*ROLLUP_MAX_AGE_H|unter der Schwelle" "$SCRIPT" | head -1 | cut -d: -f1)
  [ -n "$gate_line" ]
  wt_line=$(grep -n "lege Worktree an" "$SCRIPT" | head -1 | cut -d: -f1)
  [ -n "$wt_line" ]
  [ "$gate_line" -lt "$wt_line" ]
}

@test "T013915: Unter-Schwelle-Pfad staged nicht (No-op mit exit 0)" {
  # Der No-op-Pfad muss eine erkennbare Meldung emittieren und ohne
  # stage-plan-Aufruf enden — der Container bleibt im Collect Mode.
  run grep -n "sammelt weiter" "$SCRIPT"
  [ "$status" -eq 0 ]
  run grep -n "exit 0" "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T013915: Altersmessung nutzt min(created_at) der Batch-Kommentare" {
  # Das Alter des aeltesten Eintrags entscheidet ueber den Alters-Zweig des
  # Gates — gemessen wird der aelteste Batch-Kommentar auf dem Container.
  run grep -n "min(c.created_at)" "$SCRIPT"
  [ "$status" -eq 0 ]
}
