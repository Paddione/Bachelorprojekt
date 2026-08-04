#!/usr/bin/env bats
# zielfamilien-audit.bats — Verhaltensvertrag für den systematischen Zielfamilien-Audit (T002584)
#
# Prüfmodus: command output verification (T002448-M4). Jeder Test ruft
# scripts/lib/zielfamilien-audit.sh <subcommand> auf und prüft $output und $status;
# kein grep auf den Quelltext des Runners oder von health-goals-check.sh.
#
# RED-Status: scripts/lib/zielfamilien-audit.sh existiert auf diesem Branch noch
# nicht — alle Tests schlagen fehl (command not found). Siehe tasks.md, Task 1.
#
# Vertrag:
#   list-families                        → 18 In-Scope-Familien (ohne G-LLM*, G-WT*)
#   evaluate <id> <actual> [--absent]    → Regel-Engine pur: E1/E2/E4 auf einen Messwert
#   check --family <P> [--fixture <d>]   → Messung ausführen + Regeln anwenden, PASS/FAIL

setup() {
  bats_require_minimum_version 1.5.0
  RUNNER="${BATS_TEST_DIRNAME}/../../..//scripts/lib/zielfamilien-audit.sh"
}

# ── Familie-Liste ────────────────────────────────────────────────────────────

@test "list-families: 18 In-Scope-Familien, ohne G-LLM*/G-WT*" {
  run bash "$RUNNER" list-families
  [ "$status" -eq 0 ]
  # In-Scope-Familien aus health-goals-check.sh (row-IDs) ∪ goals.md-Sektionen
  for fam in AGENTIC BRAIN CFG CI CQ DB DEP DOC E2E FE GIT IF IMG OPS RH SEC SIZE TEST; do
    printf '%s\n' "$output" | grep -qx "$fam" || { echo "Familie $fam fehlt in list-families"; return 1; }
  done
  # Ausgeschlossene Familien (T002442 / T002443)
  if printf '%s\n' "$output" | grep -qx "LLM" || printf '%s\n' "$output" | grep -qx "WT"; then
    echo "G-LLM* und G-WT* dürfen nicht im Audit-Scope stehen"; return 1
  fi
}

# ── Regel-Engine (evaluate) ──────────────────────────────────────────────────

@test "evaluate: '0' bei fehlender Mess-Basis ist E1 (vakuos gruen, T002356-M1)" {
  run bash "$RUNNER" evaluate G-CQ02 0 --absent
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -q "FAIL G-CQ02 E1"
}

@test "evaluate: '-' bei vorhandener Basis ist E2 (SKIP-forever)" {
  run bash "$RUNNER" evaluate G-DB09 - --present
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -q "FAIL G-DB09 E2"
}

@test "evaluate: Nicht-Zahl im arithmetischen Vergleich ist E4" {
  run bash "$RUNNER" evaluate G-IF02 degraded
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -q "FAIL G-IF02 E4"
}

@test "evaluate: Zahl bei vorhandener Basis ist PASS" {
  run bash "$RUNNER" evaluate G-DB09 3 --present
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q "PASS G-DB09"
}

# ── End-to-End (check) ───────────────────────────────────────────────────────

@test "check --family CQ: fehlende website/src-Basis → FAIL G-CQ02, exit 1" {
  local fx; fx="$(mktemp -d)"
  # Fixture: keine website/src-Basis (Marker-Datei gesetzt → Basis fehlt)
  mkdir -p "$fx/basis/CQ"
  : > "$fx/basis/CQ/G-CQ02.absent"
  run bash "$RUNNER" check --family CQ --fixture "$fx"
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -q "FAIL G-CQ02"
  rm -rf "$fx"
}

@test "check --family CQ: Basis vorhanden → PASS, exit 0" {
  local fx; fx="$(mktemp -d)"
  # Fixture: website/src-Basis vorhanden (Marker-Datei gesetzt → Basis existiert)
  mkdir -p "$fx/basis/CQ"
  : > "$fx/basis/CQ/G-CQ02.present"
  run bash "$RUNNER" check --family CQ --fixture "$fx"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q "PASS G-CQ02"
  rm -rf "$fx"
}
