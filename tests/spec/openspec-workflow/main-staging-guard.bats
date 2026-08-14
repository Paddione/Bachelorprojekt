#!/usr/bin/env bats
#
# SSOT: openspec/changes/main-staging-guard (T003980)
# Ticket: T003980 — 10 Orphan-Plan-Verzeichnisse im Hauptcheckout statt Worktree
#   (Fussangel "OpenSpec-Staging im Hauptcheckout statt Worktree", AGENTS.md)
#
# PRUEFMODUS: Semantischer Wert-Check (T002716) — der Guard ist ein neues
# Skript; geprueft werden Verdrahtung, Hauptcheckout-Erkennung und
# Slug-Erkennung im Quelltext. Ohne Implementierung ist der Test rot
# (kein vakuoser Negativtest).

@test "T003980: pre-commit ruft den Hauptcheckout-Staging-Guard auf" {
  run grep -Fq "openspec-main-staging-guard.sh" .githooks/pre-commit
  [ "$status" -eq 0 ] || { echo "MISSING: Guard-Aufruf in .githooks/pre-commit"; false; }
}

@test "T003980: Guard erkennt den Hauptcheckout (git-common-dir vs. show-toplevel)" {
  run grep -Fq "git-common-dir" scripts/openspec-main-staging-guard.sh
  [ "$status" -eq 0 ] || { echo "MISSING: git-common-dir-Erkennung"; false; }
  run grep -Fq "show-toplevel" scripts/openspec-main-staging-guard.sh
  [ "$status" -eq 0 ] || { echo "MISSING: show-toplevel-Vergleich"; false; }
}

@test "T003980: Guard blockt neue openspec/changes/-Slugs im Hauptcheckout (mit Bypass)" {
  run grep -Fq "openspec/changes/" scripts/openspec-main-staging-guard.sh
  [ "$status" -eq 0 ] || { echo "MISSING: openspec/changes/-Pfadpruefung"; false; }
  # Staged-Diff als Quelle (git diff --cached --name-only):
  run grep -Fq "diff --cached" scripts/openspec-main-staging-guard.sh
  [ "$status" -eq 0 ] || { echo "MISSING: staged-diff-Pruefung"; false; }
  # Notausgang fuer legitime Faelle (Konvention wie SKIP_BRANCH_CHECK):
  run grep -Fq "SKIP_MAIN_STAGING_GUARD" scripts/openspec-main-staging-guard.sh
  [ "$status" -eq 0 ] || { echo "MISSING: SKIP_MAIN_STAGING_GUARD-Bypass"; false; }
}
