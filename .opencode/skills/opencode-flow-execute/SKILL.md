---
name: opencode-flow-execute
description: Use in opencode when on a feature/* or fix/* branch that has a staged plan in openspec/changes/ ready to implement. Invoke after opencode-flow-plan has committed and pushed the plan to the branch.
---

# opencode-flow-execute — Plan-Ausführung & PR (opencode)

Feature/Fix-Branch mit `plan_staged` Ticket → PR gemergt zu `main`, Ticket `done/shipped`, OpenSpec archiviert.

## Ticket-ID ermitteln

Falls unbekannt: `mcp__mcp-postgres__query({ sql: "SELECT external_id, title FROM tickets.tickets WHERE status='plan_staged' ORDER BY planning_rank ASC NULLS LAST, created_at DESC LIMIT 10;" })`. Bei mehreren User fragen.

## Schritt −1: Pre-Flight — Ticket-Lock & Status (vor allen Git-Operationen) [T002038]

Session MUSS das Ticket sichern BEVOR irgendeine Git-Operation läuft. Dieses
frühe Claimen verhindert die Race mit der Factory-Pipeline. [T002038-M1]

### Schritt −1.0: Ticket-Status aus der DB prüfen

```bash
TICKET_JSON=$(./scripts/vda.sh ticket get --id "$TICKET_ID")
TICKET_STATUS=$(echo "$TICKET_JSON" | jq -r '.status // empty')
case "$TICKET_STATUS" in
  done|archived|merged) exit 1 ;;
  plan_staged) echo "✅ plan_staged" ;;
  *) echo "⚠️ Status $TICKET_STATUS unerwartet" ;;
esac
```

### Schritt −1.1: Ticket claimen (atomic check-and-claim) [T002038-M2]

```bash
bash scripts/agent-lock.sh check-and-claim ticket "$TICKET_ID" \
  --branch "$(git branch --show-current)" \
  --label opencode-flow-execute
RET=$?
case $RET in
  0) ;;
  1) exit 1 ;;
  2) exit 1 ;;
esac
```

### Schritt −1.2: Ankündigung broadcasten [T002038-M3]

```bash
bash scripts/agent-msg.sh post "dev-flow-execute startet Arbeit an Ticket $TICKET_ID" --to all
```

## Schritt 0: Main sync + Reaper

```bash
bash scripts/agent-lock.sh reap
bash scripts/agent-msg.sh read --unread
MAIN_BRANCH=$(cd "$MAIN_REPO" && git rev-parse --abbrev-ref HEAD)
if [ "$MAIN_BRANCH" = "main" ]; then
  (cd "$MAIN_REPO" && git fetch origin main && git pull --rebase origin main)
else
  (cd "$MAIN_REPO" && git fetch origin main:main)
fi
```

## Schritt 0: Worktree-Konsistenz

Falls nicht in `.worktrees/*`:

```bash
SLUG=$(echo "$(git branch --show-current)" | sed 's#^[a-z]*/##')
bash scripts/worktree-create.sh "$(git branch --show-current)" ".worktrees/${SLUG}"
```

## Schritt 0.5: Rebase

```bash
git fetch origin main && git rebase origin/main && git submodule update --init --recursive
```

## Schritt 1: Plan-Pfad laden

```bash
TICKET_JSON=$(./scripts/vda.sh ticket get --id "$TICKET_ID")
PLAN_REF=$(echo "$TICKET_JSON" | jq -r '.plan_ref // empty')
BRANCH=$(echo "$PLAN_REF" | sed -n 's/.*branch=\([^ ]*\).*/\1/p')
PLAN_FILE=$(echo "$PLAN_REF" | sed -n 's/.*plan=\([^ ]*\).*/\1/p')
```

## Schritt 1.4: Claim-Verifikation

```bash
bash scripts/agent-lock.sh check ticket "$TICKET_ID" | head -1 | grep -q '^mine$' || exit 1
```

## Schritt 1.5: Ticket auf in_progress setzen

```
ticket-mcp: transition_status({ id: "$TICKET_ID", status: "in_progress" })
ticket-mcp: set_touched_files({ id: "$TICKET_ID", files: "<dateien aus plan>" })
```

## Schritt 1.6: Pipeline-Modus erkennen

Prüfe auf Partial-Dispatch vs Single-Shot:

```bash
TICKET_STRUCT=$(./scripts/vda.sh ticket get --id "$TICKET_ID" --json 2>/dev/null || echo '{}')
SLOT_COUNT=$(echo "$TICKET_STRUCT" | jq -r '.slot_count // 1')
TICKET_STATUS=$(echo "$TICKET_STRUCT" | jq -r '.status // empty')
```

- **slot_count > 1:** Pipeline-Modus — auf vollständige Partial-Dispatches warten (Schritt 2.1).
- **slot_count = 1:** Single-Shot — normale Ausführung.

## Schritt 2: Implementierung delegieren

### Schritt 2.1: Pipeline-Modus — auf Partials warten

Wenn `slot_count > 1` und `status == 'in_progress'`:

```bash
# Poll-Schleife: warte bis alle N Partials committed sind (vom Planner)
# oder der Planner fertig ist (letztes Partial ist Tests)
for wait_min in $(seq 1 30); do
  git fetch origin "$(git branch --show-current)"
  PLAN_COUNT=$(grep -c '^| p[0-9]' "$PLAN_FILE" 2>/dev/null || echo 0)
  [ "$PLAN_COUNT" -ge "$SLOT_COUNT" ] && break
  git pull --rebase origin "$(git branch --show-current)"
  sleep 30
done
```

Dann rebasen und alle Partials in Reihenfolge abarbeiten.

### Schritt 2.2: Implementierung

- Lies den Plan aus `$PLAN_FILE` und `openspec/changes/<slug>/intel.json`
- Tasks in Reihenfolge; nach jedem Meilenstein Commit + Push
- Vor PR: Freshness-Artefakte regenerieren

## Schritt 3: Lokale Verifikation

```bash
task workspace:validate
task test:changed && task freshness:regenerate && task freshness:check
```

## Schritt 4: Code Review

```bash
delegate(prompt: "Review this PR's changes for bugs, security issues, and style. PR: $(gh-axi pr view --json url -q '.url')", agent: "explore")
```

## Schritt 5: PR erstellen

Delegate to `opencode-git-workflow` Steps 2–6:

```bash
bash scripts/preflight-pr-scope.sh "<type>(<scope>): <subject> [$TICKET_ID]"
gh-axi pr create --title "<type>(<scope>): <subject> [$TICKET_ID]" --body "..."
```

## Schritt 5.5: CI-Fix-Schleife

```bash
bash scripts/devflow-ci-watch.sh "$TICKET_ID" "$(gh-axi pr view --json url -q '.url')"
```

## Schritt 6: Auto-Merge wenn CI grün

```bash
bash scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"
(cd "$MAIN_REPO" && gh-axi pr merge --auto --squash --delete-branch)
```

## Schritt 6.4: Auf Merge warten

`gh-axi pr merge --auto` kehrt sofort zurück — Merge passiert asynchron:

```bash
PR_NUM=$(gh-axi pr view --json number -q '.number')
MAX_MERGE_WAIT_MIN="${MAX_MERGE_WAIT_MIN:-15}"
WAIT_START=$(date +%s)
while true; do
  MERGE_STATE=$(gh-axi pr view "$PR_NUM" --json mergeStateStatus,state -q '.state + "|" + .mergeStateStatus' 2>/dev/null || echo "UNKNOWN|UNKNOWN")
  STATE="${MERGE_STATE%%|*}"
  case "$STATE" in
    MERGED) break ;;
    CLOSED) exit 2 ;;
  esac
  ELAPSED=$(( $(date +%s) - WAIT_START ))
  (( ELAPSED > MAX_MERGE_WAIT_MIN * 60 )) && exit 3
  sleep 15
done
```

## Schritt 6.5: Ticket abschließen

```
ticket-mcp: add_pr_link({ id: "$TICKET_ID", pr: "$PR_NUM" })
ticket-mcp: transition_status({ id: "$TICKET_ID", status: "done", resolution: "shipped" })
ticket-mcp: record_phase_event({ id: "$TICKET_ID", phase: "deploy", state: "done", driver: "devflow" })
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
agent-lock.sh release ticket $TICKET_ID && git worktree remove .worktrees/<slug> --force && git branch -D feature/<slug>
```

## Schritt 8: Post-Merge Deploy

Nur bei deploy-pflichtigen Bereichen:

```bash
bash scripts/devflow-post-merge-deploy.sh "$TICKET_ID"
```

Deploy-Mapping: `.claude/skills/references/deploy-routing.md`.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `opencode-flow-plan` | Vorgänger |
| `opencode-git-workflow` | SSOT Commit/PR/Merge |
| `background-agents.ts` | Subagent-Routing |
| `scripts/devflow-post-merge-deploy.sh` | Schritt 8 |