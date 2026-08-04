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

# ── Rollen-Matrix evaluate (p4, REQ-004) ─────────────────────────────────────

@test "evaluate: echte Null bei vorhandener Basis ist PASS" {
  run bash "$RUNNER" evaluate G-DB09 0 --present
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q "PASS G-DB09"
}

@test "evaluate: '-' bei fehlender Basis ist PASS (n/a statt 0 ist korrekt)" {
  run bash "$RUNNER" evaluate G-DB09 - --absent
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q "PASS G-DB09"
}

@test "evaluate: leerer Messwert bei fehlender Basis ist E1" {
  run bash "$RUNNER" evaluate G-CQ02 '' --absent
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -q "FAIL G-CQ02 E1"
}

@test "evaluate: Textwert ist E4, unabhängig vom Basis-Status" {
  run bash "$RUNNER" evaluate G-IF02 degraded --absent
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -q "FAIL G-IF02 E4"
}

@test "evaluate: reale Zahl trotz fehlender Basis ist PASS" {
  run bash "$RUNNER" evaluate G-DB09 5 --absent
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q "PASS G-DB09"
}

# ── check-Rollen (p4: Exit-Semantik, SKIP, .value) ───────────────────────────

@test "check: Goal ohne Marker → SKIP, exit 0 (kein Exit-Einfluss)" {
  local fx; fx="$(mktemp -d)"
  # Fixture ohne Marker für das Goal → SKIP-Zeile, kein FAIL
  mkdir -p "$fx/basis/DB"
  run bash "$RUNNER" check --family DB --fixture "$fx"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q "SKIP G-DB09"
  rm -rf "$fx"
}

@test "check: .present + .value (Messwert) → PASS via evaluate, exit 0" {
  local fx; fx="$(mktemp -d)"
  mkdir -p "$fx/basis/CQ"
  : > "$fx/basis/CQ/G-CQ02.present"
  printf '3\n' > "$fx/basis/CQ/G-CQ02.value"
  run bash "$RUNNER" check --family CQ --fixture "$fx"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q "PASS G-CQ02"
  rm -rf "$fx"
}

@test "check: gemischte Familie (.absent + .present) → FAIL E5 UND PASS, exit 1" {
  local fx; fx="$(mktemp -d)"
  mkdir -p "$fx/basis/CQ"
  : > "$fx/basis/CQ/G-CQ02.absent"
  : > "$fx/basis/CQ/G-CQ04.present"
  run bash "$RUNNER" check --family CQ --fixture "$fx"
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -q "FAIL G-CQ02 E5"
  printf '%s\n' "$output" | grep -q "PASS G-CQ04"
  rm -rf "$fx"
}

# ── Regressions-Anker je geschärftem Ziel (p4, REQ-004) ──────────────────────
# Anker-Paar je geschärftem Goal (T002584, p2): verschwundene Basis NIE grün
# (E5), vorhandene Basis mit realem Messwert PASS. RED-Nachweis: Anker-Test mit
# absichtlich falschem Fixture-Zustand schlägt fehl (STRUCT2).

@test "Anker G-RH02: Basis weg → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/RH"; : > "$fx/basis/RH/G-RH02.absent"
  run bash "$RUNNER" check --family RH --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-RH02 E5"; rm -rf "$fx"
}

@test "Anker G-RH02: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/RH"; : > "$fx/basis/RH/G-RH02.present"; printf '0\n' > "$fx/basis/RH/G-RH02.value"
  run bash "$RUNNER" check --family RH --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-RH02"; rm -rf "$fx"
}

@test "Anker G-TEST02: Basis weg → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/TEST"; : > "$fx/basis/TEST/G-TEST02.absent"
  run bash "$RUNNER" check --family TEST --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-TEST02 E5"; rm -rf "$fx"
}

@test "Anker G-TEST02: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/TEST"; : > "$fx/basis/TEST/G-TEST02.present"; printf '0\n' > "$fx/basis/TEST/G-TEST02.value"
  run bash "$RUNNER" check --family TEST --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-TEST02"; rm -rf "$fx"
}

@test "Anker G-SEC01: Basis weg → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/SEC"; : > "$fx/basis/SEC/G-SEC01.absent"
  run bash "$RUNNER" check --family SEC --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-SEC01 E5"; rm -rf "$fx"
}

@test "Anker G-SEC01: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/SEC"; : > "$fx/basis/SEC/G-SEC01.present"; printf '0\n' > "$fx/basis/SEC/G-SEC01.value"
  run bash "$RUNNER" check --family SEC --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-SEC01"; rm -rf "$fx"
}

@test "Anker G-GIT02: Basis weg (Ref fehlt) → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/GIT"; : > "$fx/basis/GIT/G-GIT02.absent"
  run bash "$RUNNER" check --family GIT --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-GIT02 E5"; rm -rf "$fx"
}

@test "Anker G-GIT02: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/GIT"; : > "$fx/basis/GIT/G-GIT02.present"; printf '0\n' > "$fx/basis/GIT/G-GIT02.value"
  run bash "$RUNNER" check --family GIT --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-GIT02"; rm -rf "$fx"
}

@test "Anker G-CQ02: Basis weg → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/CQ"; : > "$fx/basis/CQ/G-CQ02.absent"
  run bash "$RUNNER" check --family CQ --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-CQ02 E5"; rm -rf "$fx"
}

@test "Anker G-CQ02: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/CQ"; : > "$fx/basis/CQ/G-CQ02.present"; printf '0\n' > "$fx/basis/CQ/G-CQ02.value"
  run bash "$RUNNER" check --family CQ --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-CQ02"; rm -rf "$fx"
}

@test "Anker G-CQ06: Basis weg → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/CQ"; : > "$fx/basis/CQ/G-CQ06.absent"
  run bash "$RUNNER" check --family CQ --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-CQ06 E5"; rm -rf "$fx"
}

@test "Anker G-CQ06: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/CQ"; : > "$fx/basis/CQ/G-CQ06.present"; printf '0\n' > "$fx/basis/CQ/G-CQ06.value"
  run bash "$RUNNER" check --family CQ --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-CQ06"; rm -rf "$fx"
}

@test "Anker G-FE03: Basis weg → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/FE"; : > "$fx/basis/FE/G-FE03.absent"
  run bash "$RUNNER" check --family FE --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-FE03 E5"; rm -rf "$fx"
}

@test "Anker G-FE03: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/FE"; : > "$fx/basis/FE/G-FE03.present"; printf '0\n' > "$fx/basis/FE/G-FE03.value"
  run bash "$RUNNER" check --family FE --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-FE03"; rm -rf "$fx"
}

@test "Anker G-FE04: Basis weg → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/FE"; : > "$fx/basis/FE/G-FE04.absent"
  run bash "$RUNNER" check --family FE --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-FE04 E5"; rm -rf "$fx"
}

@test "Anker G-FE04: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/FE"; : > "$fx/basis/FE/G-FE04.present"; printf '0\n' > "$fx/basis/FE/G-FE04.value"
  run bash "$RUNNER" check --family FE --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-FE04"; rm -rf "$fx"
}

@test "Anker G-TEST03: Basis weg → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/TEST"; : > "$fx/basis/TEST/G-TEST03.absent"
  run bash "$RUNNER" check --family TEST --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-TEST03 E5"; rm -rf "$fx"
}

@test "Anker G-TEST03: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/TEST"; : > "$fx/basis/TEST/G-TEST03.present"; printf '0\n' > "$fx/basis/TEST/G-TEST03.value"
  run bash "$RUNNER" check --family TEST --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-TEST03"; rm -rf "$fx"
}

@test "Anker G-IF02: Basis weg (Dateien fehlen) → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/IF"; : > "$fx/basis/IF/G-IF02.absent"
  run bash "$RUNNER" check --family IF --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-IF02 E5"; rm -rf "$fx"
}

@test "Anker G-IF02: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/IF"; : > "$fx/basis/IF/G-IF02.present"; printf '0\n' > "$fx/basis/IF/G-IF02.value"
  run bash "$RUNNER" check --family IF --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-IF02"; rm -rf "$fx"
}

@test "Anker G-DEP03: Basis weg (Dockerfile fehlt) → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/DEP"; : > "$fx/basis/DEP/G-DEP03.absent"
  run bash "$RUNNER" check --family DEP --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-DEP03 E5"; rm -rf "$fx"
}

@test "Anker G-DEP03: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/DEP"; : > "$fx/basis/DEP/G-DEP03.present"; printf '0\n' > "$fx/basis/DEP/G-DEP03.value"
  run bash "$RUNNER" check --family DEP --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-DEP03"; rm -rf "$fx"
}

@test "Anker G-DOC02: Basis weg (CLAUDE.md fehlt) → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/DOC"; : > "$fx/basis/DOC/G-DOC02.absent"
  run bash "$RUNNER" check --family DOC --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-DOC02 E5"; rm -rf "$fx"
}

@test "Anker G-DOC02: Basis da (Messwert 239) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/DOC"; : > "$fx/basis/DOC/G-DOC02.present"; printf '239\n' > "$fx/basis/DOC/G-DOC02.value"
  run bash "$RUNNER" check --family DOC --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-DOC02"; rm -rf "$fx"
}

@test "Anker G-SEC05: Basis weg (main-Ref fehlt) → FAIL E5" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/SEC"; : > "$fx/basis/SEC/G-SEC05.absent"
  run bash "$RUNNER" check --family SEC --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-SEC05 E5"; rm -rf "$fx"
}

@test "Anker G-SEC05: Basis da (Messwert 0) → PASS" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/SEC"; : > "$fx/basis/SEC/G-SEC05.present"; printf '0\n' > "$fx/basis/SEC/G-SEC05.value"
  run bash "$RUNNER" check --family SEC --fixture "$fx"
  [ "$status" -eq 0 ]; printf '%s\n' "$output" | grep -q "PASS G-SEC05"; rm -rf "$fx"
}

# ── E2-Regressions-Anker (SKIP-forever trotz vorhandener Basis) ──────────────

@test "Anker E2: .present + .value='-' → FAIL E2 (SKIP-forever)" {
  local fx; fx="$(mktemp -d)"; mkdir -p "$fx/basis/DB"; : > "$fx/basis/DB/G-DB09.present";   printf -- '-\n' > "$fx/basis/DB/G-DB09.value"
  run bash "$RUNNER" check --family DB --fixture "$fx"
  [ "$status" -eq 1 ]; printf '%s\n' "$output" | grep -q "FAIL G-DB09 E2"; rm -rf "$fx"
}
