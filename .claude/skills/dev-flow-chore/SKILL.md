---
name: dev-flow-chore
description: Use for maintenance work with no behavior change — docs, dependency bumps, config/rename, CI tweaks, cleanup. Executes and merges inline; no separate plan or dev-flow-execute handoff.
---

# dev-flow-chore — Wartung direkt ausführen & mergen

## Wann diese Skill greift

Eine **Chore**: Wartung ohne Verhaltensänderung — Doku, Dependency-Bumps, Config/Rename, CI-Tweaks,
Aufräumen. Chores brauchen **keinen** Plan und **keinen** `dev-flow-execute`-Handoff: sie werden in
einem Rutsch erledigt und gemergt. Für Features/Fixes stattdessen `dev-flow-plan` nutzen.

**Sage zu Beginn:** "Ich nutze dev-flow-chore und führe die Wartung direkt aus."

---

## Schritt 0: Reaper & Pull-First

```bash
bash scripts/agent-lock.sh reap   # Session-Koordination [T000510]: Zombies/stale Worktrees/tote Locks räumen
git fetch origin main
if git diff --quiet HEAD; then git pull --rebase origin main; else git stash && git pull --rebase origin main && git stash pop; fi
```

## Schritt 0.5: Wiederkehrend oder einmalig?

Frage den User, ob die Chore regelmäßig laufen soll. Falls ja, rufe `/schedule` auf und richte
einen Cron-Job ein. **STOPP hier.**

## Schritt 1: Worktree anlegen & claimen

```bash
# git-crypt-safe: creates the worktree, handles git-crypt, inits submodules
bash scripts/worktree-create.sh chore/<slug> /tmp/wt-<slug>
cd /tmp/wt-<slug>
bash scripts/agent-lock.sh claim branch "chore/<slug>" --worktree "$PWD" --label dev-flow-chore
```

Falls ausnahmsweise inline im main-Checkout gearbeitet wird: zusätzlich `claim main-checkout` —
der `.githooks/pre-commit` sperrt sonst konkurrierende Commits anderer Sessions.

Lege ein minimales Audit-Ticket an (type=task, status=done — Chores haben keinen Plan,
nur eine Audit-Spur):
```bash
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type task \
  --brand mentolder \
  --title "chore: <slug>" \
  --status done \
  --description "Branch: chore/<slug>"$'\n'"Kein Plan — direktes Chore.")
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
```

## Schritt 2: Änderungen vornehmen

Setze die Wartung um. Bei mechanischer Arbeit über mehrere Dateien kannst du an einen passend
provisionierten Subagenten delegieren (siehe [subagent-provisioning.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md) — Chores sind i.d.R. `haiku`/`sonnet`, Effort low).

## Schritt 3: Verifizieren

```bash
task workspace:validate
task test:all
task freshness:regenerate   # generierte Artefakte aktuell halten, sonst CI rot
```

Siehe [dev-flow-gotchas.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für TypeScript/pnpm-Gotchas in Worktrees.

> **⚠ Freshness-Guard (vor jedem Commit):** Neue Test-Specs, Routen oder Assets ändern generierte Indexdateien (`repo-index.json`, `test-inventory.json`, …). Ohne Regenerierung schlägt CI fehl. Der Pre-commit-Hook erledigt das automatisch nach `task secrets:install-hooks` — ohne Hook: `task freshness:regenerate` manuell ausführen und staged Änderungen mitcommittten.

## Schritt 4: Commit, Push & PR

```bash
git add -A
git commit -m "chore(<scope>): <subject> [$TICKET_EXT_ID]"   # commitlint: Body-Zeilen <100 Zeichen
```
Die `[T000XXX]`-Referenz wird von `.github/workflows/post-merge.yml` gelesen — das Ticket ist
bereits `done`, der Status-Update ist ein idempotenter No-op.

Rufe `commit-commands:commit-push-pr` auf (oder `gh pr create` manuell).

## Schritt 5: Merge wenn CI grün

```bash
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && gh pr merge --auto --squash --delete-branch)
```

## Schritt 6: Worktree & Branch bereinigen

```bash
bash scripts/agent-lock.sh release branch "chore/<slug>" 2>/dev/null || true
cd /home/patrick/Bachelorprojekt
git worktree remove "/tmp/wt-<slug>" --force
git branch -D "chore/<slug>"
```

## Schritt 7: Deploy (falls nötig)

Nur wenn die Chore deploybare Pfade berührt — Mapping in
[deploy-routing.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/deploy-routing.md) (Single Source of Truth).

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | Geschwister — Features/Fixes (mit Plan + Handoff) statt Chores |
| `using-git-worktrees` | Hintergrund — wird hier durch `scripts/worktree-create.sh` (git-crypt-safe) ersetzt |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende über `mishap-tracker`
(`bash scripts/hooks/mishap-tracker.sh`).
