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
  # M1 (T002506): main ist im MAIN_REPO NICHT ausgecheckt — `git fetch origin
  # main:main` aktualisiert den lokalen main-Ref ohne ihn auszuchecken und ist hier
  # der richtige Weg. (Scheitern wuerde es nur, wenn main im MAIN_REPO ausgecheckt
  # waere — dann waere der if-Zweig oben aktiv. [T002506-M1]
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

> **Für `type=task`-Tickets dispatcht die Factory nicht.** Ein `task`-Ticket, das `auto-enqueue`
> aus `plan_staged` gezogen hat, belegt einen Slot und wird nie bearbeitet — hier immer manuell
> weiterfahren.

## Schritt 1.8: Ticket freigeben (release hold)

Wenn das Ticket per `stage-plan --hold` gestaged wurde, ist `readiness.execution_released=false`
gesetzt — das Ticket wird vom Factory-Dispatch zurückgehalten, bis dieser Schritt es freigibt:

```bash
bash scripts/ticket.sh release-hold --id "$TICKET_ID" || true
```

## Schritt 1.9: Kollisions-Check vor der Implementierung ⚡ [T002444]

Bevor du mit der Implementierung beginnst, prüfe ob andere Sessions parallel an denselben
Dateien arbeiten. Anders als der Pre-Commit-Hook (der `--staged` nutzt und nur staged Dateien
prüft) erfasst `--branch` ALLE Dateien, die dein Branch jemals verändert hat — egal ob
committed, staged oder Working-Tree-Änderungen:

```bash
bash scripts/agent-collision.sh check --branch || echo "⚠ Achtung: Kollision mit anderen Sessions — vor dem Commit koordinieren!"
```

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

- Lies den Plan aus `$PLAN_FILE` und — sofern vorhanden — das **Plan Intel Bundle** `openspec/changes/<slug>/intel.json` (Optional — der Implementer kann die Typen-Wahrheit selbst erheben, wenn die Datei fehlt)
- Tasks in Reihenfolge; nach jedem Meilenstein Commit + Push
- Vor PR: Freshness-Artefakte regenerieren
- Phase-Telemetrie (best-effort):
  ```
  ticket-mcp: record_phase_event({ id: "$TICKET_ID", phase: "implement", state: "entered", driver: "devflow" })
  ```

## Schritt 2.5: Self-Correcting Loop (optional)

```bash
bash scripts/devflow-build-loop.sh "$TICKET_ID"
```
Läuft **vor** der Verifikation und lokal **vor** dem Push, reduziert die Last auf die CI-Retry-Schleife
(Schritt 5.5), ersetzt sie aber nicht. Default `MAX_LOOP=3`.

> Bei `abort:escalate-gate|no-progress|max-iterations` wird eskaliert (Ticket-Kommentar) —
> **kein** blindes Weiter-Pushen.

## Schritt 3: Lokale Verifikation

> **[T003003] WICHTIG: Verifikation MUSS synchron im VORDERGRUND laufen.** Kein
> Hintergrund-`task`-Aufruf mit anschliessendem Polling — die Benachrichtigung
> ueberlebt einen Sessionwechsel nicht (DREI Agents blockierten darauf am
> 2026-08-09: Arbeit fertig, aber Push/PR/Merge unterblieben).

Phase-Telemetrie (PFLICHT — das Phase-Chain-Gate erzwingt sie):
```
ticket-mcp: record_phase_event({ id: "$TICKET_ID", phase: "implement", state: "done", driver: "devflow", detail: "Implementierung fertig" })
ticket-mcp: record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "entered", driver: "devflow", detail: "Verifikation (tests + freshness)" })
```

### Schritt 3.1: Zielgerichtete Tests (im Vordergrund)

Statt `task test:changed` (das bei breitem Plan-Minuten dauert und zum
Hintergrund-Muster verleitet) fokussierte Suiten direkt aufrufen:

```bash
# Variante A: Gerichtete BATS-Suite (schnell, empfohelen)
# Leite die Testdomaene aus den vom Branch beruehrten Pfaden ab:
#   scripts/ → tests/spec/scripts*, tests/spec/ticket-system*
#   skills/  → tests/spec/skills*
#   .opencode/ → tests/spec/opencode-*
PLAN_FILES=$(git diff --name-only origin/main...HEAD)
if echo "$PLAN_FILES" | grep -q '^scripts/'; then
  bats -r tests/spec/scripts* tests/spec/ticket-system* || exit 1
elif echo "$PLAN_FILES" | grep -q '^\.opencode/'; then
  bats -r tests/spec/opencode-* || exit 1
else
  task test:changed || exit 1
fi

# Variante B: task test:changed (vollstaendig, als Fallback)
# task test:changed || exit 1
```

### Schritt 3.2: Freshness (im Vordergrund)

```bash
task freshness:regenerate && task freshness:check || exit 1
```

### Schritt 3.3: Workspace-Validierung

```bash
task workspace:validate || exit 1
```

> **Kein || true, kein &, kein Hintergrund.** Jeder Befehl blockiert synchron.
> Der Agent meldet sich ERST nach vollstaendigem Durchlauf zurueck — kein
> "waiting for background task to complete"-Pattern. [T003003]

Nach grünen Tests:
```
ticket-mcp: record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "done", driver: "devflow", detail: "Tests grün · freshness OK" })
```

## Schritt 3.5: Admin-Menu Placement Gate

Falls neue Admin-Seiten hinzugefügt wurden:
```bash
bash scripts/admin-menu-gate.sh
```

## Schritt 4: Code Review Gate (Mandatory)

Vor dem PR-Merge muss eine unabhängige Überprüfung stattfinden:

```bash
delegate(prompt: "Review this PR's changes for bugs, security issues, and style. PR: $(gh-axi pr view --json url -q '.url')", agent: "explore")
```

Behebe alle gefundenen Probleme und stelle sicher, dass der Reviewer "Approved" gibt, bevor du fortfährst.

## Schritt 5: PR erstellen

Delegate to `opencode-git-workflow` Steps 2–6:

```bash
bash scripts/preflight-pr-scope.sh "<type>(<scope>): <subject> [$TICKET_ID]"
gh-axi pr create --title "<type>(<scope>): <subject> [$TICKET_ID]" --body "..."
```

> **⚠️ M1-Lesson (T001899):** Auto-Merge **nicht** vor dem ersten Implementierungs-Push aktivieren.
> Proposal-Commits auf Feature-Branches triggern den Auto-Merge-Flow und können das Ticket
> vorzeitig schließen (Merge = Abschluss, T001092). Auto-Merge erst enable, wenn mindestens ein
> Implementierungs-Commit auf dem Branch liegt.

## Schritt 5.5: CI/CD-Fix-Schleife

Nachdem der PR gepusht ist, überwache CI und behebe Fehler — Auto-Merge ist bereits angefordert
(Schritt 5) und greift, sobald die Required Checks grün sind.

```bash
bash scripts/devflow-ci-watch.sh "$TICKET_ID" "$(gh-axi pr view --json url -q '.url')"
```

`devflow-ci-watch.sh` prüft `mergeStateStatus` bereits **vor** dem CI-Poll-Loop und rebased bei
`DIRTY` gegen `origin/main` (T001408, Finding 2). Bricht der Rebase mit einem Konflikt ab,
beendet sich das Skript mit Exit-Code 3. In diesem Fall löst der implementierende Subagent
selbst den Konflikt und ruft das Skript erneut auf.

Seit T001415 (Finding 2) beendet sich `devflow-ci-watch.sh` mit Exit-Code 4, wenn `gh pr view`
`CONFLICTING` meldet — echte Merge-Konflikte. Auch hier löst der implementierende Subagent
den Konflikt manuell (`git fetch origin main && git rebase origin/main`, lösen, push).

## Schritt 6: Phase-Chain-Gate & Auto-Merge

> **Merge = Abschluss (T001092):** Das Ticket schließt beim grünen Merge nach `main`. Der
> Prod-Deploy (Schritt 8) ist entkoppelt und ändert den Ticket-Status **nicht**.

**Fail-closed Phase-Chain-Gate (T001444) — PFLICHT vor dem Merge:**
Prüft, dass `plan:done`, `implement:entered` und `verify:done` vorliegen:
```bash
bash scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"
```

Dann Auto-Merge anfordern:
```bash
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

Der Abschluss selbst — `resolution` ist `shipped` (Feature) oder `fixed` (Fix):

```bash
./scripts/vda.sh ticket update-status --id "$TICKET_ID" --status done --resolution "$RESOLUTION"
```

```
ticket-mcp: add_pr_link({ id: "$TICKET_ID", pr: "$PR_NUM" })
ticket-mcp: record_phase_event({ id: "$TICKET_ID", phase: "deploy", state: "done", driver: "devflow" })
```

> **Claims vor dem Worktree-Remove freigeben** — sonst bleibt ein Lock auf einen Pfad zurück,
> den es nicht mehr gibt.

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

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen über `mishap-tracker`.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `opencode-flow-plan` | **Vorgänger** — liefert Branch + Plan |
| `opencode-git-workflow` | SSOT Commit/PR/Merge |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
| `background-agents.ts` | Subagent-Routing |
| `scripts/devflow-post-merge-deploy.sh` | Schritt 8 |