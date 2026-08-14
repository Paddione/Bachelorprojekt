# T005567 — commit-msg-Hook nicht worktree-fähig

## Problem

Der `commit-msg`-Hook liegt zentral im Haupt-Checkout (installiert via `core.hooksPath=.githooks`
— gilt für ALLE Worktrees), ruft seine Guard-Skripte aber relativ zum **Worktree**-`repo_root`
auf:

```bash
repo_root="$(git rev-parse --show-toplevel)"
bash "$repo_root/scripts/check-fix-ticket-guard.sh" "$1"
```

Fehlt ein Skript im Worktree-Branch-Stand (beobachtet: `scripts/check-fix-ticket-guard.sh`,
existiert erst seit PR #4444 / T005307; Worktrees von älteren Basen haben es nicht), gibt
`bash <fehlend>` Exit 127 — und `if ! bash …` invertiert das zu **Erfolg**: Der Guard läuft
still leer, genau am Ort des Commits. Befund T005567: "Im Worktree schlug der Hook fehl bzw.
lief leer; der Implementer musste das Guard-Skript lokal in den Worktree kopieren (und nach
den Commits wieder entfernen)."

Das betrifft alle drei Guard-Aufrufe in `.githooks/commit-msg`:
`check-commit-vs-diff.sh`, `check-fix-ticket-guard.sh`, `validate-commit-msg.sh` — und
prinzipiell auch `pre-commit`/`pre-push` (gleiches Muster).

## Lösung

Im Hook die Guard-Skripte über eine Auflösung laden, die zuerst den Worktree versucht und bei
fehlender Datei auf den **Haupt-Checkout** zurückfällt (erreichbar via
`git rev-parse --git-common-dir` → Parent-Verzeichnis). Das Muster:

```bash
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
resolve_guard() {  # <rel-path> → absoluter Pfad (Worktree zuerst, dann Haupt-Checkout)
  local rel="$1"
  [ -f "$repo_root/$rel" ] && { echo "$repo_root/$rel"; return 0; }
  local common_dir
  common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  if [ -n "$common_dir" ] && [ -d "$common_dir/.." ]; then
    local main_root; main_root="$(cd "$common_dir/.." && pwd)"
    [ -f "$main_root/$rel" ] && { echo "$main_root/$rel"; return 0; }
  fi
  echo "$repo_root/$rel"   # unveraendert: der Aufrufer meldet den Fehler
}
```

Damit funktionieren die Guards in jedem Worktree identisch — genau dort, wo die Arbeit
stattfindet (Erwartung aus T005567). Für `pre-commit`/`pre-push` gilt dasselbe Muster; der
Fokus dieses Fixes liegt auf `commit-msg` (dokumentierter Befund), die anderen Hooks werden
im selben Change konsistent gemacht, soweit sie `$repo_root/scripts/` referenzieren.

## Scope

- **In Scope:** `.githooks/commit-msg` (Resolver + alle drei Guard-Aufrufe), konsistente
  Anwendung in `.githooks/pre-commit` und `.githooks/pre-push` (gleiche Fehlerklasse),
  Rot-Test in `tests/spec/githooks-worktree-fallback.bats`.
- **Nicht in Scope:** Keine Änderung an den Guard-Skripten selbst; keine Änderung an
  `core.hooksPath`-Installation; keine Änderung an Skripten, die bewusst nur im Haupt-Checkout
  laufen sollen (z.B. `main-checkout-foreign-guard.sh`).

## Offene Fragen

Keine — Befund aus T005567 ist dokumentiert und durch den Rot-Test reproduziert.
