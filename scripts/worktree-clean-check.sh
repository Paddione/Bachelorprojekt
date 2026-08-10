#!/usr/bin/env bash
# scripts/worktree-clean-check.sh — Sauberkeits-Vorcheck vor `git worktree remove`. [T002932]
#
# Usage: scripts/worktree-clean-check.sh <path>
#
# Exit-Code-Kontrakt: 0 sauber, 1 Befund, 2 nicht prüfbar.
#
# Warum es dieses Skript gibt: Der frühere Inline-Vorcheck lief als Pipe
#   git -C <path> status --porcelain | cut -c4- | grep -Ev ...
# und verlor dabei den Exit-Code von git: fehlt das Verzeichnis physisch (Registrierung
# noch in .git/worktrees, Verzeichnis weg), schreibt git `fatal: cannot change to '<pfad>'`
# nach stderr und endet mit 128 — die Pipe verwirft den Exit-Code und liefert eine leere
# Ausgabe, die in dieser Form "sauber" bedeutet, also Freigabe zum Entfernen. Die Trennung
# von 1 (Befund) und 2 (nicht prüfbar) hält genau diese beiden Fälle auseinander.
set -euo pipefail

usage() {
  echo "Usage: $0 <path>" >&2
  exit 2
}

if [ "$#" -ne 1 ]; then
  usage
fi

path="$1"

if [ ! -d "$path" ]; then
  echo "Fehler: Verzeichnis '$path' existiert nicht. Vielleicht 'git worktree prune' ausführen?" >&2
  exit 2
fi

out="$(git -C "$path" status --porcelain 2>&1)" && rc=0 || rc=$?

if [ "$rc" -ne 0 ]; then
  echo "Fehler beim Ausführen von git status in '$path': $out" >&2
  exit 2
fi

# Allowlist: SSOT ist ALLOWLIST= in scripts/branch-reaper.sh (dieselbe Unterscheidung für
# Branches). Die Muster hier sind eine Arbeitskopie des dortigen Ausdrucks — wächst die
# Liste dort, muss der Ausdruck hier (und in der Runbook-Referenz §1) nachgezogen werden.
residue=$(printf "%s" "$out" | cut -c4- | grep -vE '^(openspec/changes/|docs/code-quality/|website/src/data/)' | grep -vE '^(\.release-please-manifest\.json|website/CHANGELOG\.md|website/package\.json)$' || true)

if [ -n "$residue" ]; then
  printf "%s\n" "$residue"
  exit 1
fi

exit 0
