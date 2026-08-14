# Proposal: batch-worktree-guard-tooling-fixes

## Why

Fünf Mishap-Fixes aus dem Bereich Worktree-/Guard-Tooling (Parent T004295, Kinder
T004261, T003991, T004269, T003988, T003982) beheben Reibungen im Standard-Arbeitspfad:

1. **T004261** — Der Pre-commit-Hook lehnt die Factory-Standard-Batch-Branches
   (`feat/batch-*`) ab; jeder Commit braucht den manuellen Bypass `SKIP_BRANCH_CHECK=1`.
2. **T003991** — Ein Lock-Pfad mit `-T<id>`-Suffix-Drift lässt den Worktree-Write-Guard
   die eigene Session komplett blockieren (T002412-Fallback auf Fremd-Claims).
3. **T004269** — `archive_plan` via MCP scheitert, wenn die Plandatei nur im Git-Branch
   liegt: der Existenz-Check prüft den Blob, das Lesen läuft aber per `cat` gegen das
   Adapter-Dateisystem.
4. **T003988** — Der openspec-embed-post-commit-Hook hängt bei belegtem DB-Port
   (k3d-Forward 15432), weil der pg.Pool ohne Connect-Timeout verbindet.
5. **T003982** — `devflow-post-merge-deploy` routet Änderungen am rein lokalen
   SDLC-Stack (`k3d/sdlc-stack/`) über `task feature:deploy` auf fleet — dort existiert
   der Stack nicht.

Alle fünf berühren disjunkte Dateien in `scripts/`, `.githooks/` und Referenzen; keine
harten Abhängigkeiten untereinander.

## What

| Kind | Fix |
|------|-----|
| T004261 | `.githooks/pre-commit`: Typ-Regex um `^feat/batch-` erweitern; Fehlermeldung anpassen; CLAUDE.md Rule 7 ergänzen |
| T003991 | `scripts/hooks/worktree-write-guard.sh`: Lock-Pfade ohne `-T\d+`-Suffix gegen reale Worktree-Verzeichnisse normalisieren |
| T004269 | `scripts/ticket.sh` `cmd_archive_plan`: bei fehlender Datei `git show "${branch}:${plan_file}"` statt `cat` |
| T003988 | `scripts/openspec-embed.mjs`: `connectionTimeoutMillis` auf dem pg.Pool; Kollisions-Diagnose bei Connect-Fehler |
| T003982 | `scripts/devflow-post-merge-deploy.sh`: `k3d/sdlc-stack/`-Pfade vor dem `DEPLOY_K8S`-Match herausfiltern; `deploy-routing.md` ergänzen |

Jeder Fix wird von einem BATS-Guard mit Output-Verifikation begleitet (Rot-Grün).

## Non-Goals

- Keine Änderung an der Factory-Pipeline (nur Allowlist-Erweiterung).
- Kein Auto-Deploy des lokalen SDLC-Stacks.
- Keine Umbenennung bestehender Branches.
