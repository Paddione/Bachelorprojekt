---
name: opencode-git-workflow
description: Use whenever committing, pushing, creating a PR, or finishing work on any branch in opencode. Covers the complete repo-specific git lifecycle: pull-first, commit conventions, freshness guard, commit verification, PR creation with scope preflight, CI fix loop, auto-merge, and worktree cleanup.
---

# opencode-git-workflow — vollständiger Git-Lifecycle für dieses Repo (opencode)

Dieser Skill ist die **SSOT für Commit → Push → PR → Merge → Cleanup** in opencode. Die `opencode-flow-*`-Skills verweisen auf die Schritte hier statt sie zu duplizieren. Für GitHub-Read/View-Flows `gh-axi` bevorzugen (Repos: `Paddione/Bachelorprojekt`).

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
fi
```

---

## Schritt 1 — Verifikation & Freshness Guard (vor dem Commit)

Vollständiger Verify-Block (die vier Befehle, S1-Ratchet, Freshness-Artefakt-Liste zum Stagen):
**SSOT** in `.claude/skills/references/verification-block.md`.

Kurzform: `task freshness:regenerate` + `task freshness:check` (CI-Äquivalent, S1-Ratchet).

---

## Schritt 2 — Commit

### Conventional Commits — Pflichtformat

```
<type>(<scope>): <subject> [<TICKET_EXT_ID>]
```

- **Header ≤ 100 Zeichen**
- `type`: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`
- `scope`: betroffenes Modul / Verzeichnis
- `TICKET_EXT_ID`: z. B. `T001026` — **immer anhängen**
- Body-Zeilen ebenfalls < 100 Zeichen

**Scope vorab prüfen:** `bash scripts/validate-commit-msg.sh scopes`

### Commit ausführen

> **git-crypt-Staging-Guard:** Niemals `git add -A`. `environments/.secrets/**` ist git-crypt-geschützt. Immer explizite Pathspecs stagen.

```bash
BASE_SHA="$(git rev-parse HEAD)"

git add <spezifische Dateien>

if git diff --cached --name-only | grep -q '^environments/.secrets/'; then
  echo "FATAL: environments/.secrets/** darf nicht gestaged sein (git-crypt)" >&2
  exit 1
fi

git commit -m "<type>(<scope>): <subject> [<TICKET_EXT_ID>]"

HEAD_SHA="$(git rev-parse HEAD)"
if [ "$HEAD_SHA" = "$BASE_SHA" ]; then
  echo "FATAL: Commit ist nicht gelandet (git-crypt clean filter?)." >&2
  exit 1
fi
```

---

## Schritt 3 — Push

```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
# Bei rejected (non-fast-forward): git push --force-with-lease — NUR für eigene Branches
```

> **Push auf `main`:** `bash scripts/git-safe-push.sh` verwenden. Opt-out: `SKIP_PUSH_SYNC=1`.

---

## Schritt 4 — PR-Erstellung

### Scope-Preflight (Pflicht vor `gh pr create`)

```bash
bash scripts/preflight-pr-scope.sh "<type>(<scope>): <subject> [<TICKET_EXT_ID>]"
```

> **Titel nachträglich editieren (REST-Fallback):**
> ```bash
> gh-axi api -X PATCH "repos/{owner}/{repo}/pulls/<n>" -f title="<neuer Titel>"
> ```

### PR anlegen

```bash
gh-axi pr create \
  --title "<type>(<scope>): <subject> [<TICKET_EXT_ID>]" \
  --body "$(cat <<'EOF'
## Summary
- <was wurde geändert>
- <warum>

## Test Plan
- [ ] CI grün

[TICKET_EXT_ID]
EOF
)"
```

---

## Schritt 5 — CI Fix Loop

Nachdem der PR gepusht ist: CI überwachen und Fehler beheben **bevor** gemergt wird. SSOT: `.claude/skills/references/ci-fix-loop.md`.

Kurzfassung:
1. `gh-axi pr checks <n> --watch`
2. Bei Fehler: lokal fixen, committen, pushen
3. Bei `CONFLICTING`: `git fetch origin main && git rebase origin/main && task freshness:regenerate && git add <regenerierte> && git rebase --continue && git push --force-with-lease`

---

## Schritt 6 — Merge

```bash
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && gh-axi pr merge --auto --squash --delete-branch)
```

- **Immer `--squash`**
- **Immer `--delete-branch`**
- **`--auto`** — mergt automatisch wenn alle Required Checks grün sind

---

## Schritt 7 — Post-Merge Cleanup (Worktrees)

```bash
WORKTREE_PATH="$(git rev-parse --show-toplevel)"
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')

cd "$MAIN_REPO"
git worktree remove "$WORKTREE_PATH"
git worktree prune
```

Agent-Lock freigeben VOR dem Worktree-Remove.

---

## Worktree creation (opencode-native)

In opencode sind zwei Wege verfügbar:

1. **`scripts/worktree-create.sh` (empfohlen, git-crypt-safe):** Erstellt den Worktree mit git-crypt-Key-Kopie und neutralisiert smudge/clean/required-Filter. Immer verwenden, wenn der Branch `environments/.secrets/**` berührt.

2. **`worktree.ts` Plugin (`worktree_create`):** Erstellt einen Worktree mit `git worktree add` mit Checkout, aber **ohne git-crypt-Filter-Neutralisierung**. Auf diesem git-crypt-verwalteten Repo schlägt die Checkout-Phase auf verschlüsselten Pfaden fehl (exit 128) oder hinterlässt `environments/.secrets/**` mit einem veralteten smudge-Filter unbrauchbar. **Bekannte Einschränkung:** `worktree_create` ist nur für Branches sicher, die keine git-crypt-Pfade berühren.

```bash
# Empfohlen (git-crypt-safe):
bash scripts/worktree-create.sh <branch> .worktrees/<slug>
```

---

## Quick-Reference

| Schritt | Was | Wann |
|---------|-----|------|
| 0 | `git pull --rebase` | Immer als erstes |
| 1 | `task freshness:regenerate` | Wenn Code-Dateien geändert wurden |
| 2 | Conventional Commit + Ticket-ID | Jeder Commit |
| 2 | Commit-Verifikation (HEAD_SHA != BASE_SHA) | Nach jedem Commit in Worktrees |
| 3 | `git push -u origin <branch>` | Einmalig, danach plain `git push` |
| 4 | `preflight-pr-scope.sh` + `gh-axi pr create` | Einmal pro PR |
| 5 | CI Fix Loop | Bis alle Required Checks grün |
| 6 | `gh-axi pr merge --auto --squash --delete-branch` | Wenn CI grün |
| 7 | `git worktree remove` + Lock-Release | Nur bei Worktree-Arbeit |

---

## Häufige Fehler

| Fehler | Diagnose | Fix |
|--------|----------|-----|
| Commit landet nicht (git-crypt) | `git rev-parse HEAD == BASE_SHA` | `git status`, dann erneut committen |
| CI startet nie | `gh-axi pr view <n> --json mergeStateStatus` → `CONFLICTING` | `git rebase origin/main` |
| Stale artifact in CI | `task freshness:check` lokal rot | `task freshness:regenerate && git add && git commit` |
| PR-Scope invalid | `preflight-pr-scope.sh` Exit 1 | Scope korrigieren, neu prüfen |
| Falscher Cluster gedeployt | `ENV=` vergessen gesetzt | Immer `ENV=mentolder` / `ENV=korczewski` explizit |

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `opencode-flow-chore` | Chore-Ablauf (nutzt diesen Skill intern) |
| `opencode-flow-execute` | Feature/Fix-Ablauf (nutzt diesen Skill intern) |
| `scripts/worktree-create.sh` | Git-crypt-safe worktree creator |
| `worktree.ts` Plugin | Opencode-native primitive (git-crypt-limited) |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Not available directly. Equivalent: native Claude Code `dev-flow-plan` / `dev-flow-execute` / `dev-flow-chore` skills |
| **opencode** | Full — native skill for opencode |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |