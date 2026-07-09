---
name: opencode-flow-chore
description: Use in opencode for maintenance work with no behavior change — docs, dependency bumps, config/rename, CI tweaks, cleanup. Executes and merges inline; no separate plan or opencode-flow-execute handoff.
---

# opencode-flow-chore — Wartung direkt ausführen & mergen (opencode)

## Wann diese Skill greift

Eine **Chore**: Wartung ohne Verhaltensänderung. Chores brauchen **keinen** Plan und **keinen** `opencode-flow-execute`-Handoff. Für Features/Fixes stattdessen `opencode-flow-plan` nutzen.

**EINSTIEG:** `main` — synchronisiert, sauberer Stand
**AUSSTIEG:** PR gemergt zu `main`, Worktree bereinigt, Kreislauf geschlossen

## Schritt 0: Reaper & Pull-First

```bash
bash scripts/agent-lock.sh reap
git fetch origin main
if git diff --quiet HEAD; then git pull --rebase origin main; else git stash && git pull --rebase origin main && git stash pop; fi
```

## Schritt 0.5: Wiederkehrend oder einmalig?

Frage den User, ob die Chore regelmäßig laufen soll. Falls ja, richte einen Cron-Job ein. STOPP.

## Schritt 1: Worktree anlegen & claimen

`worktree.ts`'s `worktree_create` fehlt git-crypt-Filter-Neutralisierung (bekannte Limitation) — daher das Wrapper-Skript verwenden:

```bash
bash scripts/worktree-create.sh chore/<slug> .worktrees/<slug>
bash scripts/agent-lock.sh claim branch "chore/<slug>" --worktree "$PWD" --label opencode-flow-chore
```

Optional: Minimales Audit-Ticket anlegen via ticket-mcp.

## Schritt 2: Änderungen vornehmen

Setze die Wartung direkt um.

## Schritt 3: Verifizieren

```bash
task workspace:validate   # wenn k8s-Manifeste berührt
task test:changed
task freshness:regenerate
task freshness:check
```

## Schritt 4: Commit, Push & PR

Delegate to **`opencode-git-workflow` Steps 2–6** (SSOT):
- Explizite Pathspecs, NIE `git add -A` (git-crypt-Guard)
- Commit-Verifikation: `HEAD_SHA != BASE_SHA`
- Scope-Preflight: `bash scripts/preflight-pr-scope.sh`
- PR-Titel: `chore(<scope>): <subject> [$TICKET_EXT_ID]`

## Schritt 5: Merge wenn CI grün

```bash
(cd "$MAIN_REPO" && gh-axi pr merge --auto --squash --delete-branch)
```

## Schritt 6: Worktree & Branch bereinigen

Lock-Release, dann:
```bash
git worktree remove .worktrees/<slug> --force && git branch -D chore/<slug>
```

## Schritt 7: Deploy (falls nötig)

Nur wenn die Chore deploybare Pfade berührt — Mapping in deploy-routing.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `opencode-flow-plan` | Geschwister — Features/Fixes |
| `opencode-git-workflow` | **SSOT für Commit/PR/Merge/Cleanup** |
| `scripts/worktree-create.sh` | Git-crypt-safe worktree creator |
| `worktree.ts` Plugin | Opencode-native primitive (git-crypt-limited) |
