---
name: git-workflow
description: Use whenever committing, pushing, creating a PR, or finishing work on any branch. Covers the complete repo-specific git lifecycle: pull-first, commit conventions, freshness guard, commit verification, PR creation with scope preflight, CI fix loop, auto-merge, and worktree cleanup.
---

# Git Workflow — vollständiger Lifecycle für dieses Repo

**Sage zu Beginn:** "Ich nutze git-workflow für den Commit/PR-Ablauf."

---

## Schritt 0 — Pull-First

Vor jedem Commit / jeder Branch-Aktion sicherstellen, dass `origin/main` aktuell ist:

```bash
git fetch origin main
if git diff --quiet HEAD; then
  git pull --rebase origin main
else
  git stash
  git pull --rebase origin main
  git stash pop
  # Konflikte? Dem User anzeigen und klären.
fi
```

---

## Schritt 1 — Freshness Guard (vor dem Commit)

CI schlägt mit "stale artifact" fehl, wenn generierte Indexdateien veraltet sind.

```bash
# Regeneriert: docs/code-quality/repo-index.json, website/src/data/test-inventory.json, etc.
task freshness:regenerate

# Frisch erzeugte Änderungen sofort stagen
git add -p   # oder: git add docs/code-quality/ website/src/data/
```

> Der Pre-commit-Hook erledigt das automatisch, wenn `task secrets:install-hooks` gelaufen ist.
> Ohne Hook: immer manuell ausführen, wenn `.ts/.svelte/.astro/.sh/.mjs`-Dateien geändert wurden.

**S1-Ratchet-Check** (wenn Code-Dateien berührt wurden):

```bash
task freshness:check    # Schlägt fehl, wenn eine Datei das Zeilenbudget überschreitet
```

Falls rot: Datei wirklich verkleinern (nicht kosmetisch Zeilen zusammenziehen).

---

## Schritt 2 — Commit

### Conventional Commits — Pflichtformat

```
<type>(<scope>): <subject> [<TICKET_EXT_ID>]
```

- **Header ≤ 100 Zeichen** (commitlint-Regel)
- `type`: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`
- `scope`: betroffenes Modul / Verzeichnis (z. B. `website`, `k3d`, `scripts`, `keycloak`)
- `TICKET_EXT_ID`: z. B. `T001026` — **immer anhängen** wenn ein Ticket existiert
- Body-Zeilen ebenfalls < 100 Zeichen

Beispiele:

```
feat(website): add React mentolder rebuild [T001026]
fix(keycloak): rotate stale oauth2-proxy secret [T000950]
chore(k3d): bump TEI embed port 9081 [T000978]
```

### Commit ausführen

```bash
BASE_SHA="$(git rev-parse HEAD)"

git add <spezifische Dateien>   # NIEMALS git add -A blindlings (schützt vor .env-Leaks)

git commit -m "<type>(<scope>): <subject> [<TICKET_EXT_ID>]"

# Commit-Verifikation — git-crypt clean filter kann in Worktrees still scheitern [T000925]
HEAD_SHA="$(git rev-parse HEAD)"
if [ "$HEAD_SHA" = "$BASE_SHA" ]; then
  echo "FATAL: Commit ist nicht gelandet (git-crypt clean filter?). Push abgebrochen." >&2
  exit 1
fi
```

---

## Schritt 3 — Push

```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
# Bei rejected (non-fast-forward im selben Feature-Branch):
# git push --force-with-lease   — NUR für eigene Feature-Branches, NIEMALS für main
```

---

## Schritt 4 — PR-Erstellung

### Scope-Preflight (Pflicht vor `gh pr create`) [T000925]

```bash
bash scripts/preflight-pr-scope.sh "<type>(<scope>): <subject> [<TICKET_EXT_ID>]"
# Schlägt fehl bei ungültigem Scope → korrigieren, dann erneut prüfen
```

> **Titel nachträglich editieren (REST-Fallback):** `gh pr edit --title` scheitert
> gelegentlich an einer Projects-Classic-GraphQL-Deprecation. Stattdessen:
> ```bash
> gh api -X PATCH "repos/{owner}/{repo}/pulls/<n>" -f title="<neuer Titel>"
> ```

### PR anlegen

```bash
gh pr create \
  --title "<type>(<scope>): <subject> [<TICKET_EXT_ID>]" \
  --body "$(cat <<'EOF'
## Summary
- <was wurde geändert>
- <warum>

## Test Plan
- [ ] <manuell überprüft / CI grün>

🤖 [T<TICKET_EXT_ID>]
EOF
)"
```

---

## Schritt 5 — CI Fix Loop

Nachdem der PR gepusht ist: CI überwachen und Fehler beheben **bevor** gemergt wird.

Detaillierte Checkliste: [references/ci-fix-loop.md](../dev-flow-execute/references/ci-fix-loop.md)

Kurzfassung:
1. `gh pr checks <n> --watch` — warten bis alle Required Checks grün sind
2. Bei Fehler: Log lesen, lokal fixen, committen, pushen — Loop wiederholen
3. Bei `CONFLICTING` PR-Status: `git fetch origin main && git rebase origin/main` → push

> **Hinweis:** `CONFLICTING`-Status unterdrückt CI-Runs komplett — kein "CI läuft noch",
> sondern "CI startet nie". Diagnose: `gh pr view <n> --json mergeStateStatus`.

---

## Schritt 6 — Merge

```bash
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && gh pr merge --auto --squash --delete-branch)
```

- **Immer `--squash`** — hält `main`-History sauber (Entwicklungsregel)
- **Immer `--delete-branch`** — Branch-Leichen vermeiden
- **`--auto`** — mergt automatisch wenn alle Required Checks grün sind

---

## Schritt 7 — Post-Merge Cleanup (Worktrees)

Nur wenn in einem `/tmp/wt-*`-Worktree gearbeitet wurde:

```bash
WORKTREE_PATH="$(git rev-parse --show-toplevel)"
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')

cd "$MAIN_REPO"
git worktree remove "$WORKTREE_PATH"
git worktree prune
```

Agent-Lock freigeben:

```bash
bash scripts/agent-lock.sh release ticket "<TICKET_EXT_ID>"
bash scripts/agent-lock.sh release branch "<branch-name>"
```

---

## Quick-Reference

| Schritt | Was | Wann |
|---------|-----|------|
| 0 | `git pull --rebase` | Immer als erstes |
| 1 | `task freshness:regenerate` | Wenn Code-Dateien geändert wurden |
| 2 | Conventional Commit ≤100 Zeichen + Ticket-ID | Jeder Commit |
| 2 | Commit-Verifikation (HEAD_SHA != BASE_SHA) | Nach jedem Commit in Worktrees |
| 3 | `git push -u origin <branch>` | Einmalig, danach plain `git push` |
| 4 | `bash scripts/preflight-pr-scope.sh` + `gh pr create` | Einmal pro PR |
| 5 | CI Fix Loop | Bis alle Required Checks grün |
| 6 | `gh pr merge --auto --squash --delete-branch` | Wenn CI grün |
| 7 | `git worktree remove` + `agent-lock release` | Nur bei Worktree-Arbeit |

---

## Häufige Fehler

| Fehler | Diagnose | Fix |
|--------|----------|-----|
| Commit landet nicht (git-crypt) | `git rev-parse HEAD == BASE_SHA` | `git status`, dann erneut committen |
| CI startet nie | `gh pr view <n> --json mergeStateStatus` → `CONFLICTING` | `git rebase origin/main` |
| Stale artifact in CI | `task freshness:check` lokal rot | `task freshness:regenerate && git add && git commit` |
| S1 Ratchet über Budget | `task freshness:check` schlägt fehl | Datei wirklich verkleinern |
| PR-Scope invalid | `preflight-pr-scope.sh` Exit 1 | Scope korrigieren, neu prüfen |
| Falscher Cluster gedeployt | `ENV=` vergessen gesetzt | Immer `ENV=mentolder` / `ENV=korczewski` explizit |

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `superpowers:using-git-worktrees` | Worktree korrekt anlegen (git-crypt-safe) |
| `superpowers:finishing-a-development-branch` | Optionen nach Implementierung |
| `dev-flow-chore` | Chore-Ablauf (nutzt diesen Skill intern) |
| `dev-flow-execute` | Feature/Fix-Ablauf (nutzt diesen Skill intern) |
