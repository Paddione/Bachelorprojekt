# Design: main-staging-guard (T003980)

## Symptom & Beleg

- Hauptcheckout trug 10 untracked `openspec/changes/*`-Verzeichnisse (Orphans),
  byte-identisch mit ihren Branches (Ticket T003980, Beobachtung 2026-08-13).
- Entstehungsweg: `openspec.sh propose` legt `openspec/changes/<slug>/` im
  Hauptcheckout an (opencode-flow-plan A.5). Der Move ins Worktree (B.2) kann
  vergessen werden; ein Commit im Hauptcheckout zementiert dann die Orphans.

## Lösung (Operator-Entscheid: Pre-commit-Fail im Hauptcheckout)

### Neues Skript `scripts/openspec-main-staging-guard.sh`

1. **Hauptcheckout-Erkennung** (Worktrees ausgenommen):
   ```bash
   toplevel=$(git rev-parse --path-format=absolute --show-toplevel)
   main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   # Hauptcheckout ⇔ toplevel == main_root (linked Worktrees haben
   # git-common-dir = <main>/.git/worktrees/<name> → main_root = main-Toplevel)
   [ "$toplevel" = "$main_root" ] || exit 0
   ```
2. **Bypass:** `[ "${SKIP_MAIN_STAGING_GUARD:-0}" = "1" ] && exit 0`.
3. **Neue-Slug-Erkennung** (nur gestagte, in HEAD nicht getrackte Pfade):
   ```bash
   staged=$(git diff --cached --name-only)
   # Pfade unter openspec/changes/<slug>/ , deren <slug>-Verzeichnis nicht
   # in HEAD existiert (git cat-file -e "HEAD:openspec/changes/$slug" scheitert)
   ```
   Für jeden Treffer: Fehlermeldung mit Slug + Hinweis auf
   `worktree-create.sh`/Move (opencode-flow-plan B.2) und Exit 1.
4. Bestehende getrackte `openspec/changes/*`-Pfade und `openspec/changes/archive/`
   bleiben erlaubt (Scope-Begrenzung: nur NEUE Slugs im Hauptcheckout).

### Verdrahtung in `.githooks/pre-commit`

Neuer Block neben dem bestehenden half-archive-Guard (T002824, Zeile ~48):

```bash
# --- openspec main-staging guard: kein neuer Change-Slug im Hauptcheckout [T003980] ---
if ! bash "$repo_root/scripts/openspec-main-staging-guard.sh"; then
  echo "ERROR: refusing commit — OpenSpec-Staging im Hauptcheckout (siehe oben)." >&2
  exit 1
fi
```

> Kollisionshinweis: `.githooks/pre-commit` wird parallel auch von T004261
> (Batch T004295, feat/-Allowlist) angefasst — dort Zeilen ~150-160, hier ~48.
> Getrennte Regionen, Merge-Risiko gering.

## Risiken & Grenzen

- **Falsch-Positive:** Nur der Hauptcheckout + nur NEUE Slugs (untracked in
  HEAD) + nur beim Commit (staged). Archiv-/Doku-Commits auf main bleiben
  unberührt; Worktrees sind komplett ausgenommen.
- **Umgehung:** Der Bypass ist bewusst vorhanden (Notausgang); der Guard ist
  ein Netz für den Normalfall, kein Security-Enforcement.
- **CI:** Der Hook läuft nicht bei Squash-Merges via gh — die Orphans
  entstanden aber lokal, genau dort greift der Hook.
