#!/usr/bin/env bash
# scripts/lib/finalize-frontmatter.sh — Frontmatter-Helfer fuer
# devflow-post-merge-finalize.sh [T015916].
#
# Herausgelöst aus dem Hauptskript, damit dieses sein S1-Zeilenbudget hält
# (wirksame Schwelle .sh = 800, docs/code-quality/gates.yaml). Wird vom
# Hauptskript gesourct; die Status-Alternation `_PLAN_STATUS_ACTIVE_ALT`
# definiert das Hauptskript (genau ein Vorkommen dort, siehe
# tests/spec/agent-skills/finalize-archive-frontmatter.bats).
#
# Hintergrund T015916: Der alte Schritt-7-Sed lief im Haupt-Checkout-Arbeitsbaum,
# waehrend Schritt 8 nach `git checkout -B <archiv-branch> origin/main` den
# unveränderten Baum archivierte — 9 von 12 archivierten Plänen trugen weiter
# `status: active`, und der Haupt-Checkout behielt eine uncommittete Änderung.

# 0 = Datei existiert und ist nicht leer; der Sed setzt best-effort auf
# `status: completed`. Fehlt die Datei (T004269-Fall: Plan nur im Branch-Commit),
# ist das kein Fehler.
_apply_plan_frontmatter_completed_path() {  # <tasks-md-pfad>
  local f="$1"
  [[ -s "$f" ]] || return 0
  sed -E -i "s/^status: ${_PLAN_STATUS_ACTIVE_ALT}\$/status: completed/" "$f" 2>/dev/null || true
  return 0
}

# Wrapper mit der Signatur aus dem Plan: base_dir + $PLAN_REL (relativer
# Plan-Pfad, gesetzt vom Hauptskript in Schritt 2).
_apply_plan_frontmatter_completed() {  # <base_dir>
  _apply_plan_frontmatter_completed_path "$1/${PLAN_REL:-}"
}

# DB-freie Zustandsabfrage fuer `--frontmatter-state`: stdout `completed` oder
# `stale` (Exit 0); fehlende/leere Datei → Exit 1 OHNE Ausgabe (der Aufrufer
# behauptet dann keinen Zustand).
_plan_frontmatter_state() {  # <slug> <repo_dir>
  local slug="$1" repo="$2" f
  f="$repo/openspec/changes/$slug/tasks.md"
  [[ -s "$f" ]] || return 1
  if grep -qE "^status: ${_PLAN_STATUS_ACTIVE_ALT}([[:space:]]|\$)" "$f"; then
    echo "stale"
  else
    echo "completed"
  fi
  return 0
}
