#!/usr/bin/env bats
# tests/spec/software-factory/wakeup-auto-close-timeout.bats — T013914 Entry 5
# (umgezogen aus tests/spec/mishap-rollup/ — das Verzeichnis wurde mit T014104
#  geloescht; der Test prueft wakeup.sh, nicht den Rollup.)
#
# Pruefmodus: SOURCE-VERIFIKATION [T002448-M4]. wakeup.sh ist ein Shell-Skript
# ohne externe Abhaengigkeiten im auto-close-Merged-Aufruf. Der Source-Text wird
# geprueft, da der Timeout-Guard ausschliesslich im Quelltext manifest ist.
#
# Hintergrund: auto-close-merged.sh haengt sich bei einem langsam reagierenden
# GitHub-API-Call oder einer DB-Verbindung manchmal auf. Ohne Timeout blockiert
# der gesamte Factory-Tick (inkl. LLM-Schritten). Der Fix wrappt den Aufruf in
# `timeout 60`.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WAKEUP_SH="${REPO_ROOT}/scripts/factory/wakeup.sh"
}

@test "wakeup.sh existiert" {
  [ -f "$WAKEUP_SH" ]
}

@test "wakeup.sh wrappt auto-close-merged.sh in 'timeout 60' (T013914 E5)" {
  # Der timeout-Befehl muss in derselben Zeile stehen wie der auto-close-Aufruf.
  local timeout_line
  timeout_line=$(grep -n 'timeout.*60.*auto-close-merged\|timeout.*auto-close-merged' "$WAKEUP_SH" | head -1)
  [ -n "$timeout_line" ] || { echo "FAIL: no 'timeout' wrapping auto-close-merged.sh found"; return 1; }
}

@test "wakeup.sh wrappt auto-close-merged.sh in 'timeout 60' innerhalb des Brand-Loops (T013914 E5)" {
  # Der timeout muss innerhalb des for _acm_brand-Loops stehen (Zeile ~244-247).
  local acm_block_start line_no
  acm_block_start=$(grep -n 'for _acm_brand in mentolder korczewski' "$WAKEUP_SH" | head -1 | cut -d: -f1)
  [ -n "$acm_block_start" ] || { echo "FAIL: no 'for _acm_brand' block found"; return 1; }
  line_no=$(grep -n 'timeout.*auto-close-merged' "$WAKEUP_SH" | head -1 | cut -d: -f1)
  [ -n "$line_no" ] || { echo "FAIL: no timeout-wrapped auto-close-merged found"; return 1; }
  [ "$line_no" -ge "$acm_block_start" ] || { echo "FAIL: timeout line is not inside the _acm_brand loop"; return 1; }
}
