#!/usr/bin/env bash
# spec-tracked-file-guard.sh — Snapshot/Verify des getrackten Arbeitsbaums
#
# Entscheidung (T002779, openspec/specs/ci-cd.md):
# Verglichen werden mtime und Groesse, nicht der Inhalt und nicht `git status`.
# Die mutierenden Spec-Tests restaurieren den Originalinhalt selbst — danach ist
# der Arbeitsbaum sauber und der Hash identisch. Ein Endzustands-Check meldete
# Erfolg fuer genau den Fehlermodus, gegen den dieser Guard existiert.
# Die mtime ueberlebt die Wiederherstellung, weil `cp` ohne `-p` neu stempelt
# (empirisch bestaetigt 2026-08-09: Hash vor/nach Mutation identisch, mtime gewandert).
#
# Subcommands:
#   snapshot <datei>   Schreibt Pfad mtime Groesse aller git-getrackten Dateien
#   verify <datei>     Vergleicht aktuellen Zustand mit Snapshot
#   --help | -h | help Zeigt diese Hilfe

set -euo pipefail

# Erzeugt Snapshot aller git-getrackten Dateien im cwd: <pfad> <mtime> <groesse>
# Stabil sortiert. Pfade, die stat nicht lesen kann, werden stillschweigend
# ausgelassen — sie erscheinen nicht im diff und werden dadurch als Abweichung
# sichtbar (der Snapshot fuehrt sie, der aktuelle Lauf nicht).
_snap() {
  git ls-files -z | xargs -0 -n 128 stat -c '%n %Y %s' -- 2>/dev/null | sort
}

case "${1:-}" in
  snapshot)
    [ $# -eq 2 ] || { echo "Usage: $0 snapshot <datei>" >&2; exit 1; }
    _snap > "$2"
    ;;
  verify)
    [ $# -eq 2 ] || { echo "Usage: $0 verify <datei>" >&2; exit 1; }
    [ -f "$2" ] || { echo "spec-tracked-file-guard: verify: Snapshot-Datei '$2' nicht gefunden" >&2; exit 1; }

    current="$(mktemp)"
    _snap > "$current"

    # Positiv-Anker [T002495-M10]: leere Kandidatenliste = Fehler
    if [ "$(wc -l < "$current")" -eq 0 ]; then
      echo "spec-tracked-file-guard: verify: keine git-getrackten Dateien gefunden — laeuft das Skript im Repo-root?" >&2
      rm -f "$current"
      exit 1
    fi

    d="$(diff "$2" "$current" 2>&1)" || true
    rm -f "$current"

    if [ -z "$d" ]; then
      exit 0
    fi

    # Betroffene Pfade extrahieren (erste Spalte der diff-Zeilen)
    echo "$d" | grep '^[<>]' | awk '{print $2}' | sort -u
    exit 1
    ;;
  --help|-h|help)
    cat <<'EOF'
Usage: scripts/spec-tracked-file-guard.sh <subcommand> [args]

Subcommands:
  snapshot <datei>   Erzeugt einen Snapshot aller git-getrackten Dateien
                     (Pfad mtime Groesse) und schreibt ihn in <datei>.
  verify <datei>     Vergleicht den aktuellen Arbeitsbaum mit dem Snapshot
                     in <datei>. Exit 0 bei Gleichheit, sonst != 0.
  --help | -h | help Zeigt diese Hilfe.
EOF
    ;;
  *)
    echo "Usage: $0 {snapshot|verify|--help}" >&2
    exit 1
    ;;
esac
