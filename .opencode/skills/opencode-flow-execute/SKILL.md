---
name: opencode-flow-execute
description: Use in opencode when on a feature/* or fix/* branch that has a staged plan in openspec/changes/ ready to implement. Invoke after opencode-flow-plan has committed and pushed the plan to the branch.
---

# opencode-flow-execute — Plan-Ausführung & PR (opencode)

Feature/Fix-Branch mit `plan_staged` Ticket → PR gemergt zu `main`, Ticket `done/shipped`, OpenSpec archiviert.

> **cwd-Regel (PFLICHT, T006367):** Bash-Aufrufe in dev-flow-Phasen IMMER mit
> `git -C <worktree>` bzw. explizitem cd+guard — **nie auf implizites cwd vertrauen**.
> Die T002357-Falle schlägt auch im Bash-Git-Pfad zu: `cd` wirkt nur auf den
> aktuellen Bash-Call, Datei-Tools nehmen absolute Pfade — ein bare `git commit`
> landet sonst auf dem falschen Branch (Main-Checkout statt Worktree).

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

### Schritt −1.1: Branch claimen [T003102]

> **Branch-scoped statt ticket-scoped (T003102):** ein ticket-scoped Lock der
> auftraggebenden Session (oder dieser Session) blockt den späteren Abschluss
> durch Subagent, ticket-mcp und post-merge — drei Prozesse desselben Vorgangs
> mit je eigener SID. Der branch-scoped Claim schützt den Worktree, den diese
> Session betritt und ändert, und blockt den Status-Schreibpfad nicht.
> Die Factory sieht den branch-Lock über die Ticket-ID im Branch-Namen
> (`factory-prep.sh` prüft beide Scopes) und dispatcht nicht doppelt.

```bash
bash scripts/agent-lock.sh claim branch "$(git branch --show-current)" \
  --worktree "$(pwd)" \
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
bash scripts/agent-lock.sh check branch "$(git branch --show-current)" | head -1 | grep -q '^mine$' || exit 1
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
- **SID-Propagation (PFLICHT, T006365):** Wird die Implementierung an einen
  Subagenten delegiert, ermittle deine Session-SID mit `bash scripts/agent-lock.sh
  mine` und weise den Implementer an, in jedem Bash-Call zuerst
  `export AGENT_LOCK_SID=<deine-sid>` auszuführen — ohne diese Propagation
  blockiert der Worktree-Write-Guard seine Edit/Write-Tools im geclaimten
  Worktree (eigene Session-ID des Subagenten ≠ owner_sid).
- **PR OHNE Auto-Merge-Anforderung (T005565):** Erstelle den PR, aber fordere
  KEIN Auto-Merge an — das geschieht erst nach bestandenem Code-Review-Gate
  (Schritt 4) durch den Orchestrator.
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

## Schritt 4: Code-Review-Gate (PFLICHT vor Auto-Merge)

**Unabhängige Prüfung, nicht Implementer-Selbst-Attestation** — die unabhängige Prüfung
braucht einen anderen Kontext als den Implementer (Self-Attestation ist kein Review,
T005307). Ohne bestandenes Gate gibt es keinen Auto-Merge: fail-closed im Prozess.

1. Prüfe den Auto-Merge-Zustand des PRs (Regression T006282: extern aktiviertes Auto-Merge
   ist für das Gate sonst unsichtbar):
   ```bash
   bash scripts/check-pr-automerge.sh
   ```
   Semantik:
   - `rc=1`: Gate bricht fail-closed ab — die Meldung nennt die PR-Nummer; es wird KEIN
     Review-Ergebnis erteilt und KEIN Auto-Merge deaktiviert (Design D2: der explizite
     User-Akt wird sichtbar, der Operator entscheidet).
   - `rc=2`: Abbruch als Umgebungsfehler.
2. Reviewe die Änderungen unabhängig — delegiere an einen Review-Subagenten via
   `delegate(prompt, agent="explore")`:
   ```bash
   delegate(prompt: "Review this PR's changes for bugs, security issues, and style. PR: $(gh pr view --json url -q '.url')", agent: "explore")
   ```
3. Findings gehen an den **bereits gespawnten** Implementer zurück (kein neuer Spawn,
   Doppel-Push-Risiko aus T001408); nach dessen Push erneut reviewen.
4. Erst wenn der Reviewer "Approved" gegeben hat, fordere den Auto-Merge an:
   ```bash
   PR_NUM=$(gh pr view --json number -q '.number')
   # Auto-Merge sofort anfordern — GitHub merged selbstständig, sobald Required Checks grün sind.
   # KEIN --delete-branch (T004612): Schritt 7 (Plan-/OpenSpec-Archiv) braucht den Branch noch —
   # gelöscht wird er erst im Cleanup NACH der Archivierung. delete_branch_on_merge ist
   # repo-seitig deaktiviert; verwaiste Branches räumt branch-reaper.sh ab.
   (cd "$MAIN_REPO" && gh pr merge --auto --squash)
   ```

## Schritt 5: PR erstellen

Delegate to `opencode-git-workflow` Steps 2–6:

```bash
cd "$WT" && [ "$(git rev-parse --show-toplevel)" = "$PWD" ] || { echo "FATAL: cwd != worktree (T006367)"; exit 1; }
bash scripts/preflight-pr-scope.sh "<type>(<scope>): <subject> [$TICKET_ID]"
gh pr create --title "<type>(<scope>): <subject> [$TICKET_ID]" --body "..."
```

> **⚠️ M1-Lesson (T001899):** Auto-Merge **nicht** vor dem ersten Implementierungs-Push aktivieren.
> Proposal-Commits auf Feature-Branches triggern den Auto-Merge-Flow und können das Ticket
> vorzeitig schließen (Merge = Abschluss, T001092). Der Auto-Merge wird erst im
> Code-Review-Gate angefordert (Schritt 4) — zu dem Zeitpunkt liegt der
> Implementierungs-Commit bereits auf dem Branch, die Voraussetzung ist also erfüllt.

## Schritt 5.5: CI/CD-Fix-Schleife

Nachdem der PR gepusht ist, überwache CI und behebe Fehler — Auto-Merge ist bereits angefordert
(Schritt 4, nach bestandenem Review-Gate) und greift, sobald die Required Checks grün sind.

```bash
bash scripts/devflow-ci-watch.sh "$TICKET_ID" "$(gh pr view --json url -q '.url')"
```

`devflow-ci-watch.sh` prüft `mergeStateStatus` bereits **vor** dem CI-Poll-Loop und rebased bei
`DIRTY` gegen `origin/main` (T001408, Finding 2). Bricht der Rebase mit einem Konflikt ab,
beendet sich das Skript mit Exit-Code 3. In diesem Fall löst der implementierende Subagent
selbst den Konflikt und ruft das Skript erneut auf.

Seit T001415 (Finding 2) beendet sich `devflow-ci-watch.sh` mit Exit-Code 4, wenn `gh pr view`
`CONFLICTING` meldet — echte Merge-Konflikte. Auch hier löst der implementierende Subagent
den Konflikt manuell (`git fetch origin main && git rebase origin/main`, lösen, push).

## Schritt 6: Phase-Chain-Gate & Merge-Wait

> **Merge = Abschluss (T001092):** Das Ticket schließt beim grünen Merge nach `main`. Der
> Prod-Deploy (Schritt 8) ist entkoppelt und ändert den Ticket-Status **nicht**.

> **Schritt 6 läuft hier; die Finalisierung (Schritte 6.4–7.5) ist an den frischen
> Finalizer delegiert (Schritt 6.2)** — der Implementer hat bereits zurückgemeldet.

**Fail-closed Phase-Chain-Gate (T001444) — PFLICHT vor dem Merge, KEIN `|| true`:**
Prüft, dass `plan:done`, `implement:entered` und `verify:done` vorliegen. Bei FAIL
zuerst backfillen (insb. `verify done` nach grünem `task test:changed`), dann mergen.
(Auto-Merge wurde bereits in Schritt 4 angefordert — hier läuft nur noch das Gate.)
```bash
bash scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"
```

## Schritt 6.2: Finalisierung delegieren (T006284)

> **Härtung T006284:** Nach dem Auto-Merge-Request (Schritt 4) endet die Finalisierung im
> eigenen, kontextbelasteten Kontext: Die Schritte 6.4–7.5 (Merge-Wait, Ticket-Abschluss,
> Plan-/OpenSpec-Archiv, Worktree-/Branch-Cleanup, Lock-Release) laufen NICHT mehr in-context.
> Beim Incident T006284/PR #4460 starb der Executor nach dem Merge an Kontext-Erschöpfung —
> Closure, Archiv und Cleanup blieben liegen und mussten manuell nachgeholt werden. Die
> Härtung entfernt die Gelegenheit, statt die Direktive zu verschärfen (Muster T002365/T001571).

Spawne einen **frischen Finalizer-Subagenten** (write-capable Delegation via `task` — er braucht
Bash/Git-Zugriff für das Skript; `delegate` ist read-only) mit kompaktem Lagebild — er hat
KEINEN Kontext, gib ihm alles explizit: Ticket-ID `$TICKET_ID`,
PR-Nummer `$PR_NUM`, Branch `$BRANCH`, Worktree-Pfad `$MAIN_REPO/.worktrees/<slug>`,
Plan-Pfad `$PLAN_FILE`, Resolution (`shipped`/`fixed`).

Auftrag an den Finalizer (wörtlich Teil des Prompts):
- **Merge-Wait-Loop zuerst (T001149-M1):** `gh pr view "$PR_NUM" --json state,mergeStateStatus`
  pollen, bis `state=MERGED` (Timeout: KEIN Ticket schließen — Drift Ticket=done bei PR=OPEN;
  stattdessen strukturiert berichten).
- **Abschluss über die idempotente Einheit,** keine freie Rekonstruktion der Einzelschritte:
  ```bash
  bash scripts/devflow-post-merge-finalize.sh "$TICKET_ID" --pr "$PR_NUM"
  ```
- **T001571-Standing-Direktive:** Bei Anzeichen von Kontext-Überlauf stoppen und einen
  strukturierten Handoff-Report liefern (erledigte Schritte, Git-Zustand, offene Schritte in
  Reihenfolge) — die offenen Schritte sind über das idempotente Skript von jeder Session
  nachholbar.
- **Rückmeldung an den Auftraggeber (Pflicht):** Endzustand strukturiert berichten — was
  erledigt ist, was offen ist.

**Die eigene Finalisierung endet hier:** die Schritte 6.4–7.5 NICHT im eigenen Kontext
ausführen. Der eigene Kontext bleibt nur für die CI-Fix-Schleife (5.5) zuständig, solange
sie läuft.

## Schritte 6.4–7.5 — Merge-Wait, Ticket-Abschluss, Cleanup

> **Zuständigkeit: ein frischer Finalizer-Subagent (Schritt 6.2), NICHT in-context.** Der
> Abschluss läuft als **eine idempotente Skript-Einheit** — keine freie Rekonstruktion der
> Einzelschritte:

```bash
bash scripts/devflow-post-merge-finalize.sh "$TICKET_ID" --pr "$PR_NUM"
```

Das Skript führt deterministisch und idempotent aus: PR verlinken, Ticket auf `done`
(`shipped`/`fixed`), `verify:done`-Phase-Event, Plan nach `tickets.ticket_plans` archivieren,
OpenSpec-Change ins Archiv (inkl. Archiv-PR), Claims freigeben, Worktree und Branch entfernen —
jeder Schritt überspringt bereits erledigte Arbeit. Jede Session (Recovery, Eskalation,
Factory-Poller) kann die offenen Schritte mit einem Aufruf nachholen.

Die Closure im Skript — `resolution` ist `shipped` (Feature) oder `fixed` (Fix):

```bash
./scripts/vda.sh ticket update-status --id "$TICKET_ID" --status done --resolution "$RESOLUTION"
```

> **Merge = Abschluss (T001092):** Das Ticket schließt beim grünen Merge nach `main`. `qa_review`
> und `awaiting_deploy` sind aus dem Happy-Path entfernt — nicht als Zwischenstatus setzen.

> **Reihenfolge (T004612):** Archivierung läuft VOR der Branch-Löschung — der Fix-PR-Merge
> löscht den Branch bewusst nicht mehr (`--delete-branch` entfernt,
> `delete_branch_on_merge=false`), damit die Archivierung ihn noch vorfindet.

> **Claims vor dem Worktree-Remove freigeben (T006290)** — sonst bleibt ein Lock auf einen
> Pfad zurück, den es nicht mehr gibt. Der Release läuft aus dem Haupt-Repo (cwd außerhalb
> des Lock-Worktrees), ohne stderr-Unterdrückung.

## Schritt 8: Post-Merge Deploy

Nur bei deploy-pflichtigen Bereichen:

```bash
bash scripts/devflow-post-merge-deploy.sh "$TICKET_ID"
```

Deploy-Mapping: `.agents/skills/references/deploy-routing.md`.

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen über `mishap-tracker`.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `opencode-flow-plan` | **Vorgänger** — liefert Branch + Plan |
| `opencode-git-workflow` | SSOT Commit/PR/Merge |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
| `background-agents.ts` | Subagent-Routing |
| `scripts/devflow-post-merge-finalize.sh` | Schritte 6.4–7.5 (Finalizer, idempotent) |
| `scripts/devflow-post-merge-deploy.sh` | Schritt 8 |
| `scripts/check-pr-automerge.sh` | Schritt 4 (Auto-Merge-Preflight, T006366) |