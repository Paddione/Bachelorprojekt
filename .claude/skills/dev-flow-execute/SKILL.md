---
name: dev-flow-execute
description: 'Use when on a feature/* or fix/* branch that has a staged plan in openspec/changes/ ready to implement. Invoke after dev-flow-plan has committed and pushed the plan to the branch.'
---

# dev-flow-execute — Plan-Ausführung & PR

## Wann diese Skill greift

Feature/Fix-Branch mit `plan_staged` Ticket → PR gemergt zu `main`, Ticket `done/shipped`, OpenSpec archiviert.

## Pre-Flight (Schritte −1 bis 1.7)

Bevor irgendetwas implementiert wird, laufen sechs mechanische Schritte. Ihre Befehlsfolgen
stehen in [dev-flow-execute-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-execute-phases.md); hier nur, was sie leisten und woran sie scheitern:

| Schritt | Leistet | Bricht ab, wenn |
|---|---|---|
| **−1 Pre-Flight-Lock** | Ticket atomisch claimen (`agent-lock check-and-claim`), Broadcast an andere Sessions | eine lebende Session das Ticket schon hält |
| **0 Main-Sync** | Reaper, ungelesene Agent-Nachrichten, `git pull --rebase` im Haupt-Repo | — |
| **0 Worktree-Konsistenz** | Branch-Guard [T000321]: gültiger Branch ausgecheckt **und** unter `.worktrees/*` gearbeitet; legt sonst per `scripts/worktree-create.sh` einen an [T001363] | detached HEAD, oder Worktree-Erstellung schlägt fehl |
| **0.5 Rebase** | `git fetch origin main && git rebase origin/main` | Konflikt — dann manuell lösen |
| **1 Plan-Pfad laden** | liest `FACTORY-PLAN-REF` aus der DB, prüft die Plan-Datei **im Git-Tree** | kein `plan_ref`, leerer Pfad, oder Datei nicht in `HEAD` |
| **1.4–1.7** | Doppelarbeit-Guard, Pipeline-Modus (`slot_count`), Ticket auf `in_progress` (optional vorher `/opsx:apply <slug>`), `touched_files`, Ticket-Anhänge laden | Claim gehört nicht mehr dieser Session |

> **Der Plan-Pfad kommt aus der Datenbank, nie aus einem Glob.** `dev-flow-plan` verankert ihn
> per `ticket.sh stage-plan` als `FACTORY-PLAN-REF branch=<branch> plan=<pfad>`. Raten führt zum
> falschen Plan.

> **Worktree-Isolation ist Pflicht** [T001363]: Läuft die Execute-Phase versehentlich im
> Haupt-Checkout (z. B. nach einem Session-Neustart), schreibt der Implementer direkt ins
> Haupt-Repo statt in eine isolierte Kopie. Liegt auf dem Branch schon Arbeit oder hält ihn ein fremder Worktree (`branch in use`, Exit 3 aus `scripts/worktree-create.sh`), gilt der **Fortsetzungs-Kontrakt** [T002327] — fortsetzen statt neu beginnen, zurückstellen statt `blocked`: [factory-resume-contract](file:///home/patrick/Bachelorprojekt/.claude/skills/references/factory-resume-contract.md).

> **Pipeline-Modus:** Bei `slot_count > 1` hat die Factory bereits begonnen. Dann erst warten,
> bis alle N Partials im Branch sichtbar sind, und danach implementieren.

> **⚠️ Für `type=task`-Tickets dispatcht die Factory nicht.** `dispatcher-bridge.sh` scheduled
> ausschließlich `type=feature`. Ein `task`-Ticket, das `auto-enqueue` aus `plan_staged` gezogen
> hat, belegt einen Slot und wird nie bearbeitet — hier immer manuell weiterfahren.

## Schritt 1.8: Ticket freigeben (release hold)

Wenn das Ticket per `stage-plan --hold` gestaged wurde (interaktiver dev-flow-plan-Pfad), ist
`readiness.execution_released=false` gesetzt — das Ticket wird vom Factory-Dispatch zurückgehalten,
bis dieser Schritt es freigibt. Der Aufruf ist best-effort (`|| true`), da ein ohne `--hold`
gestagetes Ticket (z.B. Mishap-Tracker-Auto-Plans) einfach keinen Hold hat. `execution_released=false` bleibt der **Default** [T002327]: Fortsetzungsfähigkeit ersetzt die Freigabe nicht, sie macht sie nur folgenlos für bereits geleistete Arbeit.

```bash
bash scripts/ticket.sh release-hold --id "$TICKET_ID" || true
```

## Schritt 2: Implementierung an frischen Implementer-Subagenten delegieren

> **Arbeitsteilung (T002365, aus T002351-M3):** Implementer bis `gh pr merge --auto` → **ENDE**,
> Bericht zurück. Orchestrator: CI-Watch (5.5); Exit 3/4 per `SendMessage` an den Implementer
> zurück, nicht neu spawnen — sonst liefe die CI-Überwachung als Hintergrund-Monitor [T001969].

Live-Floor-Telemetrie (best-effort): Implementer-Subagent wird gespawnt — **MCP-first**:
> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "implement", state: "entered", driver: "devflow", detail: "Subagent gestartet · agent_id=$IMPLEMENTER_AGENT_ID" })`
Fallback:
```bash
./scripts/ticket.sh phase "$TICKET_ID" implement entered --driver devflow --detail "Subagent gestartet" || true
```
Statt deinen eigenen Kontext/Modell zurückzusetzen (das ließe dich den Faden verlieren), delegiere die **gesamte Implementierung an EINEN frischen Subagenten** — sauberer Kontext per Konstruktion. Du behältst den vollen Plan-Kontext und verifizierst das Ergebnis anschließend unabhängig.
> **Warum EIN Implementer statt `superpowers:subagent-driven-development`-Fan-out?** Dieser Skill läuft bereits *selbst* als delegierte Ebene (oft aus einem dev-flow-Orchestrator). Ein zusätzlicher Per-Task-Fan-out wäre **verschachtelte Delegation** $\rightarrow$ Kontext-Explosion und Synthese-Last (siehe [subagent-provisioning](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md), 162k-Prompt-Lehre). Der Implementer ruft `superpowers:executing-plans` daher **in-context** auf (kein weiterer Agenten-Fan-out). Nur wenn der Plan ausdrücklich viele **voneinander unabhängige** Tasks hat und der Einzel-Implementer am Kontext-Limit scheitert, lohnt der Wechsel auf `subagent-driven-development` bzw. einen `Workflow`-Fan-out — bewusste Eskalation, nicht Default.
Spawne den Subagenten, provisioniert gemäß [subagent-provisioning](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md):
* **Gemini/Antigravity CLI:** call `invoke_subagent` with `TypeName: "self"` (inherits permissions and tools), `Role: "Implementer <TICKET_ID>"`, and `Workspace: "share"` (or `"inherit"`).
* **Claude Code CLI:** Spawne über das `Agent`/`Task`-Tool einen Subagenten (`subagent_type: general-purpose`) — Modell nach Plan-Charakter (Implementer-Default: `sonnet`; mechanisch `haiku`, komplex/riskant `opus`), Effort per Prompt-Direktive.
* **opencode:** Nutze `delegate(prompt, agent="researcher")` für read-only Subagenten oder die native write-capable Delegation. Die Worktree-`cd`-Pflicht und Modell-Effort-Formulierungen stehen in der Reference (SSOT, nicht hier wiederholen).
- **Kontext-Injektion** (er hat sonst KEINEN Kontext — gib ihm alles explizit; Kompaktheits-Regeln siehe subagent-provisioning §3):
  - Plan-Datei `$PLAN_FILE` (aus Schritt 1, via DB aufgelöst) + Ticket-ID.
  - Attachment-Verzeichnis `$ATTACHMENT_DIR` — bei UI-Arbeit ALLE Bilder/Texte mit dem `Read`-Tool einlesen.
  - **Plan Intel Bundle (Optional):** Sofern vorhanden: `bash scripts/task-context.sh <slug>` — gemeinsamer Assembler, liefert statischen Kern aus intel.json + frische Signale. Format: [plan-intel-bundle](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-intel-bundle.md). Fehlt die Datei, ist das kein Blocker — der Implementer kann die Typen-Wahrheit selbst erheben.
- **⚠️ BATS-Pflicht:** Neue `@test`-Einträge gehören in `tests/spec/<spec-slug>.bats` — die
  OpenSpec-Spec, die das Verhalten abdeckt. Existiert die Datei nicht, anlegen (Vorlage:
  `tests/spec/software-factory.bats`); ohne klare Spec-Zuordnung `tests/unit/` erweitern.
  Ticket-nummerierte Dateien (`FA-SF-42.bats`) sind Legacy und werden **nicht** neu angelegt.
  Vorgehen im Detail: [dev-flow-execute-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-execute-phases.md) §BATS.
- **Auftrag:**
  - **Ein-Ebenen-Regel (PFLICHT, wörtlich Teil dieses Prompts):** Spawne selbst KEINE Subagenten/Sub-Implementer — rufe `superpowers:executing-plans` IN-CONTEXT auf. Wenn du glaubst, einen Sub-Implementer für einen Teil-Task zu brauchen, STOPPE und eskaliere stattdessen an den Orchestrator zurück, statt selbst zu delegieren. Verschachtelte Delegation ist nicht erlaubt (siehe subagent-provisioning.md, 162k-Prompt-Lehre).
  - **/goal: Finish dev-flow-execute and merge the PR cleanly.**
  - *Feature:* Rufe `superpowers:executing-plans` (Claude Code — built-in; opencode: steps inlined in `opencode-flow-execute`) + `test-driven-development` (Claude Code — built-in; opencode: see `vitest/SKILL.md`) auf und arbeite den Plan vollständig ab. Aktualisiere nach jedem Meilenstein die Checkbox im Plan (`- [ ] M1` → `- [x] M1`), committe und pushe.
  - *Fix:* Verifiziere zuerst, dass ein failing Test existiert, dann nach Rot-Grün-Prinzip bis grün.
   - Bei Kompilier-/Testfehlern: diagnostiziere und fixe systematisch (Logs lesen, Fehler eingrenzen, Hypothese testen, fixen, Re-Test).
  - **PFLICHT vor PR-Erstellung — Freshness-Artefakte regenerieren und committen** (sonst schlägt CI mit "stale artifact" fehl; `executing-plans` → `finishing-a-development-branch` überspringt diesen Schritt). Befehle + Artefakt-Pfadliste (SSOT): [verification-block](file:///home/patrick/Bachelorprojekt/.claude/skills/references/verification-block.md) — der Subagent MUSS die Datei lesen und den `git add`-Block daraus verwenden.
  - **Hintergrund-Monitore für lange Test-Runs verboten [T001969 Mishap 1].** Während der Verifikation (lange `task test:changed`/`gh run watch`/CI-Polls) **keine** Background-Tasks starten, auf deren Output der Subagent in einer Monitor-Schleife wartet ("I'll wait for the monitor"). Stattdessen synchron mit explizitem Timeout ausführen: `timeout 600 task test:changed` und auf das Resultat warten. Bei Stop-Events: Arbeit fortsetzen oder an den Orchestrator eskalieren — nicht auf einen Monitor-Loop warten.
  - Erstelle einen PR und fordere Auto-Merge an (`gh pr merge --auto --squash --delete-branch`, Schritt 5).
  - **ENDE (T002365):** Melde Ergebnis zurück — CI-Fix-Schleife (5.5), Merge-Wait, Ticket-Abschluss und
    Plan-Archivierung laufen im Orchestrator. **Der Worktree wird NICHT von dir entfernt** (T002352-M1),
    das ist Orchestrator-Aufgabe (Schritt 7.5). Notification abwarten, dann bei Schritt 5.5 weiter — nicht Schritt 8.

## Schritt 2.5 — Lokaler Self-Correcting-Loop (optional)

`bash scripts/devflow-build-loop.sh "$TICKET_ID"` — läuft **vor** der Verifikation und lokal
**vor** dem Push, reduziert also die Last auf die CI-Retry-Schleife (Schritt 5.5), ersetzt sie
aber nicht. Default `MAX_LOOP=3`, überschreibbar per `FACTORY_BUILD_LOOP_MAX`.

> Bei `abort:escalate-gate|no-progress|max-iterations` wird eskaliert (Ticket-Kommentar) —
> **kein** blindes Weiter-Pushen.

## Schritt 3: Lokale Verifikation

Rufe das Skill **`verification-before-completion`** auf (Claude Code — built-in; opencode: siehe die
inlined Steps in `opencode-flow-execute/SKILL.md` und den `references/verification-block.md`), um die Verifikation strukturiert zu steuern.
Phasen-Telemetrie (PFLICHT für verify — das Gate erzwingt sie) — **MCP-first** (`ticket-mcp`):
> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "implement", state: "done", driver: "devflow", detail: "Implementierung fertig" })`
> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "entered", driver: "devflow", detail: "task test:changed + freshness" })`
Verifikation ausführen — die vier Befehle + `./tests/runner.sh local <FA-XX oder SA-XX>` bei
Manifest-Änderungen. **SSOT:** [verification-block](file:///home/patrick/Bachelorprojekt/.claude/skills/references/verification-block.md).

> **`freshness:check` kann erst NACH dem Commit der regenerierten Artefakte grün werden
> [T002523-M5].** Dieser Schritt steht vor Schritt 5 (Commit & Push), `check` prüft aber nicht
> nur, ob die Artefakte aktuell sind, sondern ob sie **committet** sind
> (`✗ … regenerated but not staged — run 'git add …' and commit`). In der hier notierten
> Reihenfolge ist der erste Aufruf daher zwangsläufig rot. Richtig ist: `regenerate` →
> generierte Artefakte **committen** → `check`. Der Commit-Schritt für generierte Artefakte
> wird also aus Schritt 5 hierher vorgezogen; der eigentliche Implementierungs-Commit bleibt,
> wo er ist.
Nach grünen Tests — **MCP-first**:
> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "done", driver: "devflow", detail: "Tests grün · freshness OK" })`
> `plan`/`implement`/`deploy`-Events entstehen jetzt automatisch aus den Statuswechseln (`update-status`/`stage-plan`); Doppel-Emission ist dank Dedup harmlos.
Fallback (ticket-mcp nicht erreichbar; die `verify`-Zeilen bleiben Pflicht — das Gate in Schritt 6 erzwingt `verify:done`):
```bash
./scripts/ticket.sh phase "$TICKET_ID" implement done --driver devflow --detail "Implementierung fertig" || true
./scripts/ticket.sh phase "$TICKET_ID" verify entered --driver devflow --detail "task test:changed + freshness" || true
# nach den Tests:
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "Tests grün · freshness OK" || true
```
Siehe [dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für TypeScript/pnpm Gotchas in Worktrees.

## Schritt 3.5: Admin-Menu Placement Gate

Falls neue Admin-Seiten hinzugefügt wurden:
```bash
bash scripts/admin-menu-gate.sh
```

## Schritt 3.8: Code Review Gate (Mandatory)

Vor dem PR-Merge muss eine unabhängige Überprüfung stattfinden.
1. Rufe das Skill **`requesting-code-review`** auf (Claude Code — built-in; opencode: nutze
   `pr-review-toolkit:review-pr` oder delegiere an einen Review-Subagenten via `delegate()`),
   um die Änderungen zu auditieren.
2. Behebe alle gefundenen Probleme und stelle sicher, dass der Reviewer "Approved" gibt, bevor du fortfährst.

## Schritt 4: Dev-Iteration (optional)

Rufe `dev-flow-iterate` auf, um Änderungen im dev-Cluster zu testen.
> **⚠ Freshness-Guard (vor dem Commit):** Wenn Schritt 3 (`task freshness:regenerate`) übersprungen oder der Subagent es vergessen hat, schlägt CI mit "stale artifact" fehl. Prüfe: `git diff --name-only` sollte keine generierten Indexdateien zeigen. Falls doch: `task freshness:regenerate && git add` nachholen. Der Pre-commit-Hook automatisiert das nach `task secrets:install-hooks`.

## Schritt 5: PR erstellen

Commit → Push → PR läuft nach **`git-workflow` Schritt 2–4** (SSOT): Scope vorab gegen die
Allowlist prüfen [T001395], explizite Pathspecs statt `git add -A` (git-crypt-Guard [T001210]),
Commit-Verifikation `HEAD_SHA != BASE_SHA` [T000925], `preflight-pr-scope.sh` vor `gh pr create`,
REST-Fallback für Titel-Edits.
Execute-spezifisch: Ticket-ID `[$TICKET_ID]` im Subject (nach `type(scope): `, z.B. `feat(scope): implement feature [$TICKET_ID]`) und `Closes T000XXX` im Body bei Fixes.
Rufe `commit-commands:commit-push-pr` auf (Claude Code slash-command) oder führe `gh pr create` manuell aus (beide Frameworks).

> **⚠️ M1-Lesson (T001899):** Auto-Merge **nicht** vor dem ersten Implementierungs-Push aktivieren.
> Proposal-Commits auf Feature-Branches triggern den Auto-Merge-Flow und können das Ticket
> vorzeitig schließen (Merge = Abschluss, T001092). Auto-Merge erst enable, wenn mindestens ein
> Implementierungs-Commit auf dem Branch liegt. Zu diesem Zeitpunkt (Schritt 5) ist der
> Implementierungs-Commit bereits gepusht, also ist die Voraussetzung erfüllt.

```bash
# Auto-Merge sofort anfordern — GitHub merged selbstständig, sobald Required Checks grün sind.
(cd "$MAIN_REPO" && gh pr merge --auto --squash --delete-branch)
```

## Schritt 5.5: CI/CD-Fix-Schleife (Orchestrator-Zuständigkeit, T002365)

**Orchestrator-Schritt, nicht Implementer** — der läuft daher nie als Hintergrund-Monitor [T001969 Mishap 1, T002351-M3]. Nach der Implementer-Rückmeldung überwacht der Orchestrator CI — Auto-Merge ist bereits angefordert (Schritt 5) und greift, sobald die Required Checks grün sind. Details/Required-Check-Liste: [ci-fix-loop](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ci-fix-loop.md).
```bash
PR_URL=$(gh pr view --json url -q '.url')
bash scripts/devflow-ci-watch.sh "$TICKET_ID" "$PR_URL"
```
Bei roten Checks: Logs aus dem Skript-Output als Prompt-Kontext an einen `sonnet`-Subagenten übergeben (Fix-Routine: Freshness → TS → BATS → Kustomize → Commitlint), nach erfolgreichem Push Loop wiederholen.
`devflow-ci-watch.sh` rebased bei `DIRTY` gegen `origin/main` (T001408) und beendet sich mit Exit-Code `3` bei Rebase-Konflikt bzw. `4` bei echtem `CONFLICTING`-Mergestatus (T001415) — in beiden Fällen gibt der **Orchestrator den Konflikt per `SendMessage` an den bereits gespawnten Implementer zurück** (kein neuer Spawn — Doppel-Push-Risiko aus T001408) und ruft `devflow-ci-watch.sh` nach dessen Push erneut auf.

## Schritt 6: Phase-Chain-Gate & Merge-Wait

> **Ab hier (Schritt 6–7.5) läuft alles im Orchestrator (T002365)** — der Implementer hat bereits
> zurückgemeldet. `E2E PR` ist kein required check (T000722) — blockiert den Merge NICHT. Die
> Required-Check-Liste lebt in [ci-fix-loop](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ci-fix-loop.md).
**Fail-closed Phase-Chain-Gate (T001444) — PFLICHT vor dem Merge, KEIN `|| true`:**
Prüft, dass `plan:done`, `implement:entered` und `verify:done` vorliegen. Bei FAIL
zuerst backfillen (insb. `verify done` nach grünem `task test:changed`), dann mergen.
(Auto-Merge wurde bereits in Schritt 5 angefordert — hier läuft nur noch das Gate.)
```bash
./scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"
```

## Schritte 6.4–7.5 — Merge-Wait, Ticket-Abschluss, Cleanup

`gh pr merge --auto` kehrt **sofort** zurück; der Merge passiert asynchron. Erst warten, bis er
durch ist, dann das Ticket schließen — sonst entsteht die Drift Ticket=done bei PR=OPEN
(Mishap T001149-M1). Danach: PR verlinken, Ticket auf `done` (`shipped`/`fixed`),
`verify:done`-Phase-Event, Plan nach `tickets.ticket_plans` archivieren, OpenSpec-Change ins
Archiv, Claims freigeben, Worktree und Branch entfernen.

Vollständige Befehlsfolgen inklusive Poll-Loop und MCP-first-Aufrufen:
[dev-flow-execute-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-execute-phases.md).
Die Archivierung samt Push-Verifikation [T001268] und PR-Creation-Verifikation [T001331] steht in
[plan-archive-steps](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-archive-steps.md).

Der Abschluss selbst — `resolution` ist `shipped` (Feature) oder `fixed` (Fix):

```bash
./scripts/vda.sh ticket update-status --id "$TICKET_ID" --status done --resolution "$RESOLUTION"
```

> **Merge = Abschluss (T001092):** Das Ticket schließt beim grünen Merge nach `main`. Der
> Prod-Deploy (Schritt 8) ist entkoppelt und ändert den Ticket-Status **nicht**. `qa_review` und
> `awaiting_deploy` sind aus dem Happy-Path entfernt — nicht als Zwischenstatus setzen.

> **Claims vor dem Worktree-Remove freigeben** — sonst bleibt ein Lock auf einen Pfad zurück,
> den es nicht mehr gibt.

## Schritt 8: Post-Merge Deploy & Verify

```bash
bash scripts/devflow-post-merge-deploy.sh "$TICKET_ID"
```
**Deploy-Mapping (Single Source of Truth):** Pfad→Task-Tabelle und Pod-Verify-Schleife leben in [deploy-routing](file:///home/patrick/Bachelorprojekt/.claude/skills/references/deploy-routing.md). Bei Änderungen am Deploy-Mapping **nur** diese Referenz pflegen.
Führe danach `dev-flow-e2e` aus, um E2E-Tests gegen die Live-Umgebung zu schreiben.
> **Mitten in der Umsetzung blockiert?** Nutzer mit `lavish` grillen — erstelle `.lavish/<slug>-grilling.html` (Input-Playbook) und poll auf Antworten. Danach die Antworten ans Ticket
> hängen: `scripts/ticket.sh grill --id <ext-id> --answer <qid>=<text> …`. Siehe
> `.claude/skills/references/grilling-to-ticket.md`.

## Übergabe — Kreislauf geschlossen

**Zustand nach Schritt 8:**
- `main` enthält die gemergten Änderungen (squash commit)
- Worktree `.worktrees/<slug>` gelöscht, Branch `feature/<slug>` gelöscht
- Ticket status = `done` (resolution=shipped)
- Branch-Lock und Ticket-Lock freigegeben
- Deployed (falls `devflow-post-merge-deploy.sh` Pfad-Treffer)
**Kreislauf zurück zu `main`** — nächste Arbeit startet mit `dev-flow-plan` von einem frischen `git pull`.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | **Vorgänger im Kreislauf** — liefert Branch + committiertem Plan |
| `dev-flow-iterate` | Alternative — inkrementelle Dev-Iteration |
| `dev-flow-e2e` | Folge — schreibt E2E-Tests nach Deploy |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung

Melde alle aufgetretenen Fehler oder Prozess-Frictionen über `mishap-tracker`.

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full |
| **opencode** | Full |
| **agy** | Full |
