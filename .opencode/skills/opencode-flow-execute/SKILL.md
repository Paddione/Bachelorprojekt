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

## Schritt −1: Pre-Flight — Ticket-Lock & Status (vor allen Git-Operationen) [T002038]

Bevor irgendeine Git-Operation oder Worktree-Erzeugung läuft, MUSS die Session
das Ticket als erstes sichern. Dieses frühe Claimen verhindert die Race
zwischen dev-flow-execute und der Factory-Pipeline: die Factory PREP prüft
agent-lock auf "held" und überspringt das Ticket, wenn eine interaktive Session
es bereits claimed hat — ABER nur wenn der Claim VOR dem ersten Factory-Check
platziert ist. [T002038-M1]

### Schritt −1.0: Ticket-Status aus der DB prüfen

```bash
TICKET_JSON=$(./scripts/vda.sh ticket get --id "$TICKET_ID")
TICKET_STATUS=$(echo "$TICKET_JSON" | jq -r '.status // empty')
case "$TICKET_STATUS" in
  done|archived|merged)
    echo "❌ Ticket $TICKET_ID ist bereits $TICKET_STATUS — kein dev-flow-execute nötig." >&2
    exit 1
    ;;
  in_progress)
    echo "⚠️  Ticket $TICKET_ID ist bereits in_progress. Ein anderes Cluster arbeitet evtl. parallel."
    echo "   Fortsetzung auf eigenes Risiko. Abbruch: exit 1"
    # Nicht blockierend — eine laufende Session kann legitimerweise fortgesetzt werden.
    # Der Claim-Schutz (Schritt −1.1) verhindert Doppelarbeit.
    ;;
  plan_staged)
    echo "✅ Ticket $TICKET_ID ist plan_staged — fortfahren."
    ;;
  *)
    echo "⚠️  Ticket $TICKET_ID hat Status '$TICKET_STATUS' — unerwartet, aber nicht blockierend."
    ;;
esac
```

### Schritt −1.1: Ticket claimen (atomic check-and-claim) [T002038-M2]

```bash
bash scripts/agent-lock.sh check-and-claim ticket "$TICKET_ID" \
  --branch "$(git branch --show-current)" \
  --label opencode-flow-execute
RET=$?
case $RET in
  0) echo "✅ Ticket $TICKET_ID erfolgreich geclaimed." ;;
  1) echo "❌ Ticket $TICKET_ID wird bereits von einer anderen Session bearbeitet." >&2
     echo "   → Session-Koordination: agent-msg.sh read --mine --unread" >&2
     exit 1 ;;
  2) echo "❌ Ticket $TICKET_ID ist bereits done/merged — Status-Check verweigert Claim." >&2
     exit 1 ;;
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

## Schritt 1.4: Doppelarbeit-Guard (bereits in Schritt −1 erfolgt)

Der Ticket-Claim wurde bereits in Schritt −1.1 platziert. Dieser Schritt ist
nur noch eine Verifikation, dass der Claim noch gültig ist:

```bash
bash scripts/agent-lock.sh check ticket "$TICKET_ID" | head -1 | grep -q '^mine$' \
  || { echo "❌ Ticket $TICKET_ID nicht mehr von dieser Session geclaimed — abbruch." >&2; exit 1; }
```

## Schritt 1.5: Ticket auf in_progress setzen

```
ticket-mcp: transition_status({ id: "$TICKET_ID", status: "in_progress" })
ticket-mcp: set_touched_files({ id: "$TICKET_ID", files: "<dateien aus plan>" })
```

## Schritt 1.6: Pipeline-Modus erkennen

Prüfe, ob das Ticket im Pipeline-Modus (Partial-Dispatch) oder Single-Shot gestaged wurde:

```bash
TICKET_STRUCT=$(./scripts/vda.sh ticket get --id "$TICKET_ID" --json 2>/dev/null || echo '{}')
SLOT_COUNT=$(echo "$TICKET_STRUCT" | jq -r '.slot_count // 1')
TICKET_STATUS=$(echo "$TICKET_STRUCT" | jq -r '.status // empty')
echo "ℹ️  Ticket $TICKET_ID: status=$TICKET_STATUS, slot_count=$SLOT_COUNT"
```

- **slot_count > 1:** Pipeline-Modus — die Factory hat bereits mit der Arbeit begonnen (vom Planner enqueued). Warte auf vollständige Partial-Dispatches (siehe Schritt 2.1).
- **slot_count = 1:** Single-Shot — normale sequentielle Ausführung.

## Schritt 2: Implementierung delegieren

### Schritt 2.1: Pipeline-Modus — Auf Partial-Vollständigkeit warten

Wenn `slot_count > 1` und Factory bereits läuft (`status == 'in_progress'`):

```bash
# Poll-Schleife: warte bis alle N Partials committed sind (vom Planner)
# oder der Planner fertig ist (letztes Partial ist Tests)
for wait_min in $(seq 1 30); do
  # Prüfe ob Branch neue Partials hat
  git fetch origin "$(git branch --show-current)"
  PLAN_COUNT=$(grep -c '^| p[0-9]' "$PLAN_FILE" 2>/dev/null || echo 0)
  if [ "$PLAN_COUNT" -ge "$SLOT_COUNT" ]; then
    echo "✅ Alle $SLOT_COUNT Partials sind im Branch sichtbar."
    break
  fi
  echo "⏳ Warte auf Partial $PLAN_COUNT/$SLOT_COUNT ..."
  git pull --rebase origin "$(git branch --show-current)"
  sleep 30
done
```

Dann normal rebasen und alle Partials in der richtigen Reihenfolge abarbeiten.

### Schritt 2.2: Implementierung (Single-Shot oder nach Warte-Schleife)

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

## Schritt 4: Code Review Gate

Vor dem PR-Merge: delegate an einen Review-Subagenten via `delegate()` oder nutze `gh-axi pr review` für eine automatische Code-Review-Prüfung. Behebe alle gefundenen Probleme.

```bash
# Autoren-Code-Review: delegate an explore-Subagenten
delegate(prompt: "Review this PR's changes for bugs, security issues, and style. PR: $(gh-axi pr view --json url -q '.url')", agent: "explore")
```

Der User muss die Review-Ergebnisse bestätigen, bevor der PR gemergt wird.

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

Phase-Chain-Gate (fail-closed):
```bash
bash scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"
```

Auto-Merge aktivieren (Voraussetzung: mindestens ein Implementierungs-Commit liegt auf dem Branch, nicht nur der Plan-Stage-Commit — T001899):
```bash
(cd "$MAIN_REPO" && gh-axi pr merge --auto --squash --delete-branch)
```

## Schritt 6.4: Auf Merge warten (Poll-Schleife)

`gh-axi pr merge --auto` kehrt sofort zurück — der eigentliche Merge passiert asynchron.
Warte, bis der Merge tatsächlich durch ist, bevor das Ticket geschlossen wird:

```bash
PR_NUM=$(gh-axi pr view --json number -q '.number')
MAX_MERGE_WAIT_MIN="${MAX_MERGE_WAIT_MIN:-15}"
WAIT_START=$(date +%s)

echo "⏳ Warte auf Merge von PR #$PR_NUM (max ${MAX_MERGE_WAIT_MIN}min) ..."
while true; do
  MERGE_STATE=$(gh-axi pr view "$PR_NUM" --json mergeStateStatus,state -q '.state + "|" + .mergeStateStatus' 2>/dev/null || echo "UNKNOWN|UNKNOWN")
  STATE="${MERGE_STATE%%|*}"
  case "$STATE" in
    MERGED) echo "✅ PR #$PR_NUM ist gemergt."; break ;;
    CLOSED) echo "❌ PR #$PR_NUM wurde geschlossen ohne Merge." >&2; exit 2 ;;
  esac
  ELAPSED=$(( $(date +%s) - WAIT_START ))
  if (( ELAPSED > MAX_MERGE_WAIT_MIN * 60 )); then
    echo "❌ PR #$PR_NUM nach ${MAX_MERGE_WAIT_MIN}min nicht gemergt (state=$STATE)." >&2
    exit 3
  fi
  sleep 15
done
```

## Schritt 6.5: Ticket abschließen

Merge = Abschluss (T001092). Ticket schließen:
```
ticket-mcp: add_pr_link({ id: "$TICKET_ID", pr: "$PR_NUM" })
ticket-mcp: transition_status({ id: "$TICKET_ID", status: "done", resolution: "shipped" })
ticket-mcp: record_phase_event({ id: "$TICKET_ID", phase: "deploy", state: "done", driver: "devflow", detail: "PR #$PR_NUM merged · done/shipped" })
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

## Schritt 8: Post-Merge Deploy & Verify

Führe den Deployment-Schritt nur aus, wenn die geänderten Dateien deploy-pflichtige Bereiche betreffen:

```bash
bash scripts/devflow-post-merge-deploy.sh "$TICKET_ID"
```

**Deploy-Mapping (SSOT):** Pfad→Task-Tabelle und Pod-Verify-Schleife in `.claude/skills/references/deploy-routing.md`.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `opencode-flow-plan` | **Vorgänger** — liefert Branch + Plan |
| `opencode-git-workflow` | **SSOT für Commit/PR/Merge/Cleanup** |
| `background-agents.ts` | Subagent-Routing (read-only vs write-capable) |
| `scripts/worktree-create.sh` | Git-crypt-safe worktree creator |
| `scripts/devflow-post-merge-deploy.sh` | Schritt 8 — Post-Merge Deploy |
| `references/deploy-routing` | Deploy-Mapping (SSOT) |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Not available directly. Equivalent: native Claude Code `dev-flow-plan` / `dev-flow-execute` / `dev-flow-chore` skills |
| **opencode** | Full — native skill for opencode |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |