# p1 — Guard-Skript + Hook-Verdrahtung (T003980)

## Ziel

Neues Skript `scripts/openspec-main-staging-guard.sh`, das Commits im
HAUPT-Checkout blockiert, wenn neue (in HEAD nicht getrackte)
`openspec/changes/<slug>/`-Pfade gestaged werden. Worktrees sind ausgenommen.

## Steps

1. **RED.** `tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/main-staging-guard.bats`
   — alle drei Tests schlagen fehl (Skript fehlt, Hook-Aufruf fehlt).
   `expected: FAIL`.

2. **GREEN.** `scripts/openspec-main-staging-guard.sh` anlegen:
   - Hauptcheckout-Erkennung: `toplevel == dirname(git-common-dir)` (beide via
     `git rev-parse --path-format=absolute`); bei Worktree → Exit 0.
   - `SKIP_MAIN_STAGING_GUARD=1` → Exit 0 (Notausgang, dokumentiert).
   - Staged-Pfade: `git diff --cached --name-only`; für jeden Pfad
     `^openspec/changes/([^/]+)/` prüfen, ob das Slug-Verzeichnis in HEAD
     existiert (`git cat-file -e "HEAD:openspec/changes/$slug"`); nur NEUE
     Slugs zählen.
   - Bei Treffer: Fehlermeldung mit Slug + Hinweis auf
     `scripts/worktree-create.sh`/Move (opencode-flow-plan B.2), Exit 1.
   - Keine Treffer → Exit 0. `set -euo pipefail` beachten (kein stilles
     rc=1 ohne Ausgabe — T003491-Lehre).
   - In `.githooks/pre-commit` neben dem half-archive-Guard (Zeile ~48)
     verdrahten; Fehlermeldung des Hooks: „ERROR: refusing commit —
     OpenSpec-Staging im Hauptcheckout (siehe oben)."

3. **Verifikation.**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/main-staging-guard.bats
   tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-guard.bats
   ```
   Beides grün; Smoke: im Hauptcheckout mit Dummy-Slug + `git add` → Hook
   blockt (danach Dummy entfernen); im Worktree → kein Block.

## Acceptance

- Neue Slugs im Hauptcheckout → Hook-Exit 1 mit Slug-Nennung.
- Worktree-Commits und getrackte Pfade → ungehindert.
- Bypass `SKIP_MAIN_STAGING_GUARD=1` funktioniert.
