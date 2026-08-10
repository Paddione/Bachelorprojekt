# p2 — Worktree-Schleife: Waisenverzeichnisse nicht als Hauptrepo messen (T002998)

## Ziel

Die Worktree-Schleife über `.worktrees/*/` misst bei Waisenverzeichnissen
(kein git-worktree, aber Ordner existiert) stillschweigend das Hauptrepo —
falsche Status-Resultate.

## Steps

1. **RED.** Test in `tests/spec/batch-git-worktree-integrity-fixes.bats`: Waisenverzeichnis
   wird als solches erkannt, nicht als Hauptrepo gemessen. `expected: FAIL`.

2. **GREEN.** In `scripts/worktree-clean-check.sh`: vor der Messung prüfen, ob das
   Verzeichnis ein echtes git-worktree ist (`git -C <pfad> rev-parse --git-common-dir`
   != Hauptrepo-common-dir); Waisen überspringen oder explizit melden.

3. **Verifikation.** Fall aus T002998: Waise verfälscht die Schleife nicht mehr.

## Acceptance

- Waisenverzeichnisse werden nicht als Hauptrepo gemessen.
- Explizite Meldung statt stiller Fehlmessung.
