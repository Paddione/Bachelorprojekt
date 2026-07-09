---
name: opencode-flow-execute
description: Use in opencode when on a feature/* or fix/* branch that has a staged plan in openspec/changes/ ready to implement. Invoke after opencode-flow-plan has committed and pushed the plan to the branch.
---

# opencode-flow-execute — Plan-Ausführung & PR (opencode)

## Wann diese Skill greift

Du bist auf einem `feature/*` oder `fix/*` Branch. `opencode-flow-plan` hat Spec und Plan committed und gepusht.

**EINSTIEG:** Feature/Fix-Branch mit `plan_staged` Ticket
**AUSSTIEG:** PR gemergt zu `main`, Worktree bereinigt, Ticket `done/shipped`, OpenSpec archiviert

## Ticket-ID ermitteln

Falls `TICKET_ID` nicht bekannt: staged plans per MCP abfragen:
```
mcp__mcp-postgres__query({ sql: "SELECT external_id, title FROM tickets.tickets WHERE status='plan_staged' ORDER BY planning_rank ASC NULLS LAST, created_at DESC LIMIT 10;" })
```
Bei mehreren: den User in Plain-Text fragen, welche Ticket-ID.

## Schritt −1: Main sync + Reaper

```bash
bash scripts/agent-lock.sh reap
bash scripts/agent-msg.sh read --unread
git fetch origin main && git pull --rebase origin main
```

## Schritt 0: Worktree-Konsistenz

Prüfe, ob du in einem `.worktrees/*` Worktree bist. Falls nicht:

```bash
SLUG=$(echo "$(git branch --show-current)" | sed 's#^[a-z]*/##')
bash scripts/worktree-create.sh "$(git branch --show-current)" ".worktrees/${SLUG}"
```

(`scripts/worktree-create.sh` ist git-crypt-safe. `worktree.ts`'s `worktree_create` hat diese Neutralisierung nicht — bekanntes Limitation.)

## Schritt 0.5: Sync mit main & Rebase

```bash
git fetch origin main
git rebase origin/main
git submodule update --init --recursive
```

## Schritt 1: Plan-Pfad aus der DB laden

```bash
TICKET_JSON=$(./scripts/vda.sh ticket get --id "$TICKET_ID")
PLAN_REF=$(echo "$TICKET_JSON" | jq -r '.plan_ref // empty')
BRANCH=$(echo "$PLAN_REF" | sed -n 's/.*branch=\([^ ]*\).*/\1/p')
PLAN_FILE=$(echo "$PLAN_REF" | sed -n 's/.*plan=\([^ ]*\).*/\1/p')
```

## Schritt 1.4: Doppelarbeit-Guard

```
agent-lock.sh claim ticket T000XXX --branch feature/<slug> --worktree .worktrees/<slug> --label opencode-flow-execute
```

## Schritt 1.5: Ticket auf in_progress setzen

```
ticket-mcp: transition_status({ id: "$TICKET_ID", status: "in_progress" })
ticket-mcp: set_touched_files({ id: "$TICKET_ID", files: "<dateien aus plan>" })
```

## Schritt 2: Implementierung delegieren

Implementiere in-context (oder delegiere an write-capable Subagent — siehe `background-agents.ts` Routing: write-capable agents nutzen opencodes native write-capable Delegation, nicht `delegate()`).

- Lies den Plan aus `$PLAN_FILE`
- Lies `openspec/changes/<slug>/intel.json` für Typen-Wahrheit
- Implementiere alle Tasks in Reihenfolge
- Nach jedem Meilenstein: Commit und Push
- Vor PR-Erstellung: Freshness-Artefakte regenerieren und committen

## Schritt 3: Lokale Verifikation

```bash
task workspace:validate   # wenn k8s-Manifeste berührt
task test:changed
task freshness:regenerate
task freshness:check
```

## Schritt 5: PR erstellen

Delegate to **`opencode-git-workflow` Steps 2–6** (SSOT):

```bash
bash scripts/preflight-pr-scope.sh "<type>(<scope>): <subject> [$TICKET_ID]"
gh-axi pr create --title "<type>(<scope>): <subject> [$TICKET_ID]" --body "..."
```

## Schritt 5.5: CI/CD-Fix-Schleife

```bash
PR_URL=$(gh-axi pr view --json url -q '.url')
bash scripts/devflow-ci-watch.sh "$TICKET_ID" "$PR_URL"
```

## Schritt 6: Auto-Merge wenn CI grün

```bash
bash scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"
(cd "$MAIN_REPO" && gh-axi pr merge --auto --squash --delete-branch)
```

## Schritt 6.4/6.5: Auf Merge warten + Ticket schließen

Warte auf Merge (poll `gh-axi pr view`), dann:
```
ticket-mcp: add_pr_link({ id: "$TICKET_ID", pr: "$PR_NUM" })
ticket-mcp: transition_status({ id: "$TICKET_ID", status: "done", resolution: "shipped" })
```

## Schritt 7: Plan archivieren

```bash
sed -E -i 's/^status: (active|plan_staged|in_progress)$/status: completed/' "$PLAN_FILE"
bash scripts/openspec.sh archive "$SLUG"
git add openspec/changes/
git commit -m "chore(plans): archive $SLUG [$TICKET_ID]"
```

## Schritt 7.5: Worktree bereinigen

```
agent-lock.sh release ticket $TICKET_ID
git worktree remove .worktrees/<slug> --force
git branch -D feature/<slug>
```

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `opencode-flow-plan` | **Vorgänger** — liefert Branch + Plan |
| `opencode-git-workflow` | **SSOT für Commit/PR/Merge/Cleanup** |
| `background-agents.ts` | Subagent-Routing (read-only vs write-capable) |
| `scripts/worktree-create.sh` | Git-crypt-safe worktree creator |
