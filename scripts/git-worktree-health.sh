#!/usr/bin/env bash
# git-worktree-health.sh — Integritäts-Vorcheck für den gemeinsamen Git-Objektspeicher
# und Orphan-Worktree-Erkennung (T002994, T002998).
#
# Exit-Code-Kontrakt (wie worktree-clean-check.sh):
#   0 = sauber (kein Befund)
#   1 = Befund gefunden
#   2 = nicht prüfbar (Fail-Closed — kein Urteil)
#
# Usage:
#   git-worktree-health.sh objects   — prüft auf 0-Byte-Objekte + kaputten Objektspeicher
#   git-worktree-health.sh orphans   — prüft auf .worktrees/*-Verzeichnisse ohne git-Registrierung

set -u

CMD="${1:-}"
case "$CMD" in
  objects) ;;
  orphans) ;;
  *) echo "usage: git-worktree-health.sh {objects|orphans}" >&2; exit 2 ;;
esac

# Repo-Anker: ohne Git-Repo kein Urteil (Fail-Closed)
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || { echo "❌ kein Git-Repository — Abbruch (kein Urteil)" >&2; exit 2; }
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "❌ git rev-parse --show-toplevel fehlgeschlagen" >&2; exit 2; }

if [ "$CMD" = "objects" ]; then
  # ── objects: 0-Byte-Objekte + fsck ──────────────────────────────────────

  found=0

  # Vorcheck: 0-Byte-Dateien unter .git/objects/
  zero_bytes=$(find "$GIT_DIR/objects" -type f -size 0 2>/dev/null)
  if [ -n "$zero_bytes" ]; then
    echo "BEFUND: 0-Byte-Objektdateien im Objektspeicher:"
    echo "$zero_bytes"
    found=1
  fi

  # Vertiefung: git fsck
  fsck_out=$(git fsck --no-reflogs --no-progress 2>&1) && fsck_rc=0 || fsck_rc=$?
  if [ "$fsck_rc" -ne 0 ]; then
    echo "BEFUND: git fsck meldet Fehler:"
    echo "$fsck_out"
    found=1
  elif [ -n "$fsck_out" ]; then
    echo "HINWEIS: git fsck hat Ausgaben (keine harten Fehler):"
    echo "$fsck_out"
  fi

  if [ "$found" -eq 1 ]; then
    echo ""
    echo "RETTUNGSSEQUENZ (T002994):"
    echo "  a) Letzten gültigen Commit aus .git/worktrees/<name>/logs/HEAD"
    echo "     in .git/worktrees/<name>/HEAD schreiben."
    echo "  b) git rebase --abort im betroffenen Worktree."
    echo "  c) find .git/objects -type f -size 0 -delete"
    echo "     (löscht nichts Werthaltiges — die Dateien sind bereits unlesbar)."
    echo "  d) git reflog expire --stale-fix --all"
    echo "  e) Gegenprobe: git fsck --no-reflogs sauber + git fetch wieder funktionsfähig."
    echo "  f) Verbleibende 'invalid reflog entry'-Meldungen sind kosmetisch."
    exit 1
  fi

  echo "✓ Objektspeicher intakt (T002994-Prüfung bestanden)"
  exit 0
fi

# ── orphans: .worktrees/* ohne git-Registrierung ──────────────────────────

if [ "$CMD" = "orphans" ]; then
  if [ ! -d "$REPO_ROOT/.worktrees" ]; then
    echo "✓ kein .worktrees/-Verzeichnis — keine Kandidaten"
    exit 0
  fi

  # Registrierte Worktree-Pfade aus git worktree list --porcelain
  registered="$(mktemp)"
  trap "rm -f '$registered'" EXIT
  git worktree list --porcelain 2>/dev/null | grep '^worktree ' | sed 's/^worktree //' > "$registered"

  found_orphan=0
  for wt_dir in "$REPO_ROOT"/.worktrees/*/; do
    [ -d "$wt_dir" ] || continue
    # Normalisiere Pfad (ohne trailing slash)
    wt_path="${wt_dir%/}"
    abs_path="$(cd "$wt_path" 2>/dev/null && pwd)" || continue

    if ! grep -qFx "$abs_path" "$registered" 2>/dev/null; then
      echo "ORPHAN-WORKTREE: $wt_path (kein Eintrag in 'git worktree list')"
      found_orphan=1
    fi
  done

  if [ "$found_orphan" -eq 1 ]; then
    exit 1
  fi

  echo "✓ keine Orphan-Worktrees gefunden (T002998-Prüfung bestanden)"
  exit 0
fi
