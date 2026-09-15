---
name: dev-flow-execute
description: 'Use when on a feature/* or fix/* branch that has a staged plan in openspec/changes/ ready to implement. Invoke after dev-flow-plan has committed and pushed the plan to the branch.'
---

# dev-flow-execute — Plan-Ausführung & PR

Rollen- und Übergabevertrag: [dev-flow-lifecycle](.claude/skills/references/dev-flow-lifecycle.md). Diese Skill enthält nur die Execute-Gates, die Mechanik steht in den verlinkten Referenzen. Interaktive Ausführung über die OpenCode-Slash-Commands `dev-flow-exe.md` und `dev-flow-execute.md`.

> **cwd-Regel (PFLICHT, T006367):** Git-Aufrufe immer als `git -C <worktree>` bzw. mit
> explizitem cd+guard — **nie auf implizites cwd vertrauen**. `cd` wirkt nur auf den aktuellen
> Bash-Call (T002357), ein bare `git commit` landet sonst im Haupt-Checkout.

## Wann diese Skill greift

Feature/Fix-Branch mit `plan_staged` Ticket → PR gemergt zu `main`, Ticket `done/shipped`, OpenSpec archiviert.

## Pre-Flight (Schritte −1 bis 1.7)

Befehlsfolgen: [dev-flow-execute-phases](.claude/skills/references/dev-flow-execute-phases.md). Hier nur Leistung und Abbruchbedingung:

| Schritt | Leistet | Bricht ab, wenn |
|---|---|---|
| **−1 Pre-Flight-Lock** | Branch claimen (`agent-lock claim branch` — T003102, kein ticket-Scope), Broadcast an andere Sessions | eine lebende Session den Branch schon hält |
| **0 Main-Sync** | Reaper, ungelesene Agent-Nachrichten, `git pull --rebase` im Haupt-Repo | — |
| **0 Worktree-Konsistenz** | Branch-Guard [T000321]: gültiger Branch ausgecheckt **und** unter `.worktrees/*` gearbeitet; legt sonst per `scripts/worktree-create.sh` einen an [T001363] | detached HEAD, oder Worktree-Erstellung schlägt fehl |
| **0.5 Rebase** | `git fetch origin main && git rebase origin/main` | Konflikt — dann manuell lösen |
| **1 Plan-Pfad laden** | liest `FACTORY-PLAN-REF` aus der DB, prüft die Plan-Datei **im Git-Tree** | kein `plan_ref`, leerer Pfad, oder Datei nicht in `HEAD` |
| **1.4–1.7** | Doppelarbeit-Guard, Pipeline-Modus (`slot_count`), Ticket auf `in_progress` (optional vorher `/opsx:apply <slug>`), `touched_files`, Ticket-Anhänge laden | Claim gehört nicht mehr dieser Session |

> **Der Plan-Pfad kommt aus der Datenbank, nie aus einem Glob** — `ticket.sh stage-plan` setzt
> `FACTORY-PLAN-REF branch=<branch> plan=<pfad>`.

> **Worktree-Isolation ist Pflicht** [T001363]. Liegt auf dem Branch schon Arbeit oder hält ihn ein fremder Worktree (`branch in use`, Exit 3 aus `scripts/worktree-create.sh`), gilt der **Fortsetzungs-Kontrakt** [T002327] — fortsetzen statt neu beginnen, zurückstellen statt `blocked`: [factory-resume-contract](.claude/skills/references/factory-resume-contract.md).

> **Pipeline-Modus:** Bei `slot_count > 1` hat die Factory bereits begonnen. Erst warten, bis alle
> N Partials im Branch sichtbar sind, dann implementieren.

> **⚠️ Für `type=task`-Tickets dispatcht die Factory nicht** (`dispatcher-bridge.sh` scheduled nur
> `type=feature`) — hier immer manuell weiterfahren.

### Schritt −1.1: Branch-Claim ist branch-scoped (T003102)

Der Pre-Flight-Lock claimt **branch-scoped** — niemals über das Ticket:
`bash scripts/agent-lock.sh claim branch "$BRANCH"`. Verifikation:
`bash scripts/agent-lock.sh check branch "$(git branch --show-current)"`. Der Release liegt in der
idempotenten Finalize-Einheit (`scripts/devflow-post-merge-finalize.sh`, Schritt 3.9), ebenfalls
branch-scoped (T003102, T006284).

## Schritt 1.8: Ticket freigeben (release hold)

Nach `stage-plan --hold` ist `readiness.execution_released=false` gesetzt und die Factory hält das
Ticket zurück. Ohne Hold ist der Aufruf ein No-op, daher `|| true`. `execution_released=false`
bleibt der **Default** [T002327].

```bash
bash scripts/ticket.sh release-hold --id "$TICKET_ID" || true
```

## Schritt 2: Implementierung an frischen Implementer-Subagenten delegieren

> **Arbeitsteilung (T002365):** Implementer bis PR-Erstellung → **ENDE**, Bericht zurück, OHNE
> Auto-Merge-Anforderung. Orchestrator: Review-Gate (3.8), CI-Watch (5.5); Exit 3/4 per
> `SendMessage` an den Implementer zurück, nicht neu spawnen [T001969].

Live-Floor-Telemetrie (best-effort) — **MCP-first**:
> `mcp__ticket-mcp-node__record_phase_event({ id: "$TICKET_ID", phase: "implement", state: "entered", driver: "devflow", detail: "Subagent gestartet · agent_id=$IMPLEMENTER_AGENT_ID" })`
Fallback:
```bash
./scripts/ticket.sh phase "$TICKET_ID" implement entered --driver devflow --detail "Subagent gestartet" || true
```

Delegiere die **gesamte Implementierung an EINEN frischen Subagenten**. Du behältst den Plan-Kontext und verifizierst danach unabhängig. Kein Per-Task-Fan-out über `superpowers:subagent-driven-development`: diese Skill läuft oft schon als delegierte Ebene, verschachtelte Delegation sprengt den Kontext (162k-Prompt-Lehre, [subagent-provisioning](.claude/skills/references/subagent-provisioning.md)). Der Implementer ruft `superpowers:executing-plans` **in-context** auf. Fan-out nur als bewusste Eskalation, wenn viele unabhängige Tasks den Einzel-Implementer ans Kontext-Limit bringen.

Spawne den Subagenten, provisioniert gemäß [subagent-provisioning](.claude/skills/references/subagent-provisioning.md):
* **Gemini/Antigravity CLI:** call `invoke_subagent` with `TypeName: "self"` (inherits permissions and tools), `Role: "Implementer <TICKET_ID>"`, and `Workspace: "share"` (or `"inherit"`).
* **Claude Code CLI:** nativer Subagenten-Dispatch, `general-purpose` — Modell nach Plan-Charakter (Default `sonnet`; mechanisch `haiku`, komplex/riskant `opus`), Effort per Prompt-Direktive.
* **opencode:** `background-agents.ts`-Plugin: `delegate(prompt, agent="researcher")` für read-only Subagenten oder die native write-capable Delegation. Worktree-`cd`-Pflicht und Effort-Formulierungen: Reference (SSOT).
- **Kontext-Injektion** (der Subagent hat sonst KEINEN Kontext; Kompaktheits-Regeln: subagent-provisioning §3):
  - Plan-Datei `$PLAN_FILE` (aus Schritt 1, via DB aufgelöst) + Ticket-ID.
  - Attachment-Verzeichnis `$ATTACHMENT_DIR` — bei UI-Arbeit ALLE Bilder/Texte mit dem `Read`-Tool einlesen.
  - **Plan Intel Bundle (Optional):** `bash scripts/task-context.sh <slug>` liefert den Kern aus `intel.json` plus frische Signale. Format: [plan-intel-bundle](.claude/skills/references/plan-intel-bundle.md). Fehlt es, ist das kein Blocker.
- **⚠️ BATS-Pflicht:** Neue `@test`-Einträge gehören in `tests/spec/<spec-slug>.bats` — die
  OpenSpec-Spec, die das Verhalten abdeckt. Existiert die Datei nicht, anlegen (Vorlage:
  `tests/spec/software-factory/`); ohne klare Spec-Zuordnung `tests/unit/` erweitern.
  Ticket-nummerierte Dateien (`FA-SF-42.bats`) sind Legacy und werden **nicht** neu angelegt.
  Details: [dev-flow-execute-phases](.claude/skills/references/dev-flow-execute-phases.md) §BATS.
- **Auftrag:**
  - **Ein-Ebenen-Regel (PFLICHT, wörtlich Teil dieses Prompts):** Spawne selbst KEINE Subagenten/Sub-Implementer — rufe `superpowers:executing-plans` IN-CONTEXT auf. Brauchst du einen Sub-Implementer, STOPPE und eskaliere an den Orchestrator zurück. Verschachtelte Delegation ist nicht erlaubt.
  - **SID-Propagation (PFLICHT, T006365):** Ermittle deine Session-SID mit
    `bash scripts/agent-lock.sh mine` und weise den Implementer an, in jedem
    Bash-Call zuerst `export AGENT_LOCK_SID=<deine-sid>` auszuführen — sonst blockiert
    der Worktree-Write-Guard seine Edit/Write-Tools im geclaimten Worktree.
  - **/goal: Finish dev-flow-execute and merge the PR cleanly.**
  - *Feature:* Rufe `superpowers:executing-plans` (opencode: inlinede Steps in `dev-flow-execute`) + `test-driven-development` (opencode: `vitest/SKILL.md`) auf und arbeite den Plan vollständig ab. Nach jedem Meilenstein Checkbox im Plan abhaken (`- [ ] M1` → `- [x] M1`), committen, pushen.
  - *Fix:* Zuerst verifizieren, dass ein failing Test existiert, dann Rot-Grün bis grün.
  - **PFLICHT vor PR-Erstellung — Freshness-Artefakte regenerieren und committen** (sonst CI "stale artifact"; `finishing-a-development-branch` überspringt das). Befehle + Artefakt-Pfadliste (SSOT): [verification-block](.claude/skills/references/verification-block.md) — der Subagent MUSS die Datei lesen und den `git add`-Block daraus verwenden.
  - **Hintergrund-Monitore für lange Test-Runs verboten [T001969 Mishap 1].** Lange Läufe synchron mit Timeout ausführen (`timeout 600 task test:changed`), nicht auf einen Monitor-Loop warten.
  - Erstelle einen PR (OHNE Auto-Merge-Anforderung — die folgt nach dem Code-Review-Gate, Schritt 3.8).
  - **ENDE (T002365):** Ergebnis zurückmelden. Review-Gate, CI-Fix-Schleife, Merge-Wait,
    Abschluss und Archivierung laufen im Orchestrator. **Der Worktree wird NICHT von dir entfernt**
    (T002352-M1). Der Orchestrator fährt bei Schritt 3.8 fort — nicht Schritt 8.

### Wenn keine Delegation möglich ist [T002698]

Ohne Subagent (Session-Policy, Harness ohne Agent-Tool, Offline) **implementiert der Orchestrator
in-context** und führt die Schritte 3 bis 7.5 selbst aus. Die Ein-Ebenen-Regel entfällt. Rote
Checks und Rebase-Konflikte (`devflow-ci-watch.sh` Exit 3/4) löst der Orchestrator selbst, weiter
ohne Hintergrund-Monitore [T001969]. Weil derselbe Kontext Implementierung und Prüfung trägt,
sorgfältiger verifizieren.

## Schritt 2.5 — Lokaler Self-Correcting-Loop (optional)

`bash scripts/devflow-build-loop.sh "$TICKET_ID"` — läuft lokal **vor** Verifikation und Push,
entlastet die CI-Retry-Schleife (5.5), ersetzt sie nicht. Default `MAX_LOOP=3`
(`FACTORY_BUILD_LOOP_MAX`).

> Bei `abort:escalate-gate|no-progress|max-iterations` eskalieren (Ticket-Kommentar) — **kein**
> blindes Weiter-Pushen.

## Schritt 3: Lokale Verifikation

Rufe das Skill **`verification-before-completion`** auf (opencode: `references/verification-block.md`).
Phasen-Telemetrie (PFLICHT für verify — das Gate erzwingt sie) — **MCP-first** (`ticket-mcp-node`):
> `mcp__ticket-mcp-node__record_phase_event({ id: "$TICKET_ID", phase: "implement", state: "done", driver: "devflow", detail: "Implementierung fertig" })`
> `mcp__ticket-mcp-node__record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "entered", driver: "devflow", detail: "task test:changed + freshness" })`
Verifikation: die vier Befehle + `./tests/runner.sh local <FA-XX oder SA-XX>` bei
Manifest-Änderungen. **SSOT:** [verification-block](.claude/skills/references/verification-block.md).

> **`freshness:check` wird erst NACH dem Commit der regenerierten Artefakte grün [T002523-M5]**,
> weil es auch prüft, ob sie committet sind. Reihenfolge: `regenerate` → Artefakte **committen** →
> `check`. Der Implementierungs-Commit bleibt in Schritt 5.
Nach grünen Tests — **MCP-first**:
> `mcp__ticket-mcp-node__record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "done", driver: "devflow", detail: "Tests grün · freshness OK" })`
> `plan`/`implement`/`deploy`-Events entstehen automatisch aus den Statuswechseln; Doppel-Emission ist dank Dedup harmlos.
Fallback (ticket-mcp nicht erreichbar; die `verify`-Zeilen bleiben Pflicht — Schritt 6 erzwingt `verify:done`):
```bash
./scripts/ticket.sh phase "$TICKET_ID" implement done --driver devflow --detail "Implementierung fertig" || true
./scripts/ticket.sh phase "$TICKET_ID" verify entered --driver devflow --detail "task test:changed + freshness" || true
# nach den Tests:
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "Tests grün · freshness OK" || true
```
TypeScript/pnpm-Gotchas in Worktrees: [dev-flow-gotchas](.claude/skills/references/dev-flow-gotchas.md).

## Schritt 3.5: Admin-Menu Placement Gate

Falls neue Admin-Seiten hinzugefügt wurden:
```bash
bash scripts/admin-menu-gate.sh
```

## Schritt 3.8: Code-Review-Gate (Orchestrator, PFLICHT vor Auto-Merge)

**Orchestrator-Schritt, nicht Implementer** — Self-Attestation ist kein Review (T005307). Ohne
bestandenes Gate kein Auto-Merge: fail-closed im Prozess.

1. Auto-Merge-Zustand des PRs prüfen (T006282). **Den Branch immer explizit übergeben** [T900040]:
   ohne `--branch` leitet `gh` den PR aus dem ausgecheckten Branch ab und meldet im Haupt-Checkout
   `OK: Kein PR gefunden` (rc=0), obwohl ein PR offen ist.
   ```bash
   bash scripts/check-pr-automerge.sh --branch "$BRANCH"
   ```
   Semantik:
   - `rc=1`: Gate bricht fail-closed ab — die Meldung nennt die PR-Nummer; es wird KEIN
     Review-Ergebnis erteilt und KEIN Auto-Merge deaktiviert (Design D2: der Operator entscheidet).
   - `rc=2`: Abbruch als Umgebungsfehler.
2. Rufe das Skill **`requesting-code-review`** auf (opencode: `pr-review-toolkit:review-pr` oder
   ein Review-Subagent via `delegate()`).
3. Findings per `SendMessage` an den **bereits gespawnten** Implementer (Muster Exit 3/4 aus
   T002365 — kein neuer Spawn, Doppel-Push-Risiko aus T001408); nach dessen Push erneut reviewen.
4. Erst nach "Approved" fail-closed die Phase-Chain prüfen, dann Auto-Merge anfordern:

```bash
./scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"
```

```bash
# GitHub merged selbstständig, sobald Required Checks grün sind.
# KEIN --delete-branch (T004612): die Archivierung braucht den Branch noch (Löschung in 7.5).
(cd "$MAIN_REPO" && gh pr merge --auto --squash)
```

## Schritt 3.9: Finalisierung delegieren

> **Härtung T006284:** Nach dem Auto-Merge-Request endet der Orchestrator. Die Schritte 6.4–7.5
> laufen in einem frischen Finalizer, weil ein Executor nach dem Merge an Kontext-Erschöpfung
> starb und Closure, Archiv und Cleanup liegen blieben.

Spawne einen **frischen Finalizer-Subagenten** (nativer Dispatch, `general-purpose`; Modell
`sonnet`, mechanisch `haiku`) und gib ihm alles explizit: Ticket-ID `$TICKET_ID`, PR-Nummer
`$PR_NUM`, Branch `$BRANCH`, Worktree-Pfad `$MAIN_REPO/.worktrees/<slug>`, Plan-Pfad `$PLAN_FILE`,
Resolution (`shipped`/`fixed`).

Auftrag an den Finalizer (wörtlich Teil des Prompts):
- **Merge-Wait-Loop zuerst (T001149-M1):** [ci-fix-loop](.claude/skills/references/ci-fix-loop.md)
  §"PR-Merge-Wait-Loop" lesen und von dort ausführen. Bei Timeout KEIN Ticket schließen
  (Drift Ticket=done bei PR=OPEN), sondern strukturiert berichten.
- **Abschluss über die idempotente Einheit,** keine freie Rekonstruktion der Einzelschritte:
  ```bash
  bash scripts/devflow-post-merge-finalize.sh "$TICKET_ID" --pr "$PR_NUM"
  ```
- **T001571-Standing-Direktive:** Bei Anzeichen von Kontext-Überlauf stoppen und einen
  strukturierten Handoff-Report liefern (erledigte Schritte, Git-Zustand, offene Schritte).
- **Rückmeldung an den Auftraggeber (Pflicht):** Endzustand berichten — erledigt, offen.

**Der Orchestrator endet hier** und führt 6.4–7.5 NICHT im eigenen Kontext aus. Er bleibt nur für
die CI-Fix-Schleife (5.5) zuständig, solange sie läuft.

## Schritt 4: Dev-Iteration (optional)

Iteratives Testen im Dev-Namespace `workspace-dev` auf Fleet ([deploy-routing.md](.claude/skills/references/deploy-routing.md)): `task dev:redeploy:website` bzw. `task dev:redeploy:brett`.
> **⚠ Freshness-Guard (vor dem Commit):** `git diff --name-only` darf keine generierten Indexdateien zeigen. Sonst `task freshness:regenerate && git add` nachholen (Pre-commit-Hook nach `task secrets:install-hooks` automatisiert das).

## Schritt 5: PR erstellen

Commit → Push → PR läuft nach **`git-workflow` Schritt 2–4** (SSOT): Scope vorab gegen die
Allowlist prüfen [T001395], explizite Pathspecs statt `git add -A` (git-crypt-Guard [T001210]),
Commit-Verifikation `HEAD_SHA != BASE_SHA` [T000925], `preflight-pr-scope.sh` vor `gh pr create`,
REST-Fallback für Titel-Edits.
Execute-spezifisch: Ticket-ID `[$TICKET_ID]` im Subject (z.B. `feat(scope): implement feature [$TICKET_ID]`) und `Closes T000XXX` im Body bei Fixes.
Rufe `commit-commands:commit-push-pr` auf oder führe `gh pr create` manuell aus.

> **⚠️ M1-Lesson (T001899):** Auto-Merge **nicht** vor dem ersten Implementierungs-Push aktivieren —
> Proposal-Commits könnten das Ticket sonst vorzeitig schließen. Der Auto-Merge folgt erst im
> Code-Review-Gate (3.8).

## Schritt 5.5: CI/CD-Fix-Schleife (Orchestrator-Zuständigkeit, T002365)

**Orchestrator-Schritt, nie als Hintergrund-Monitor** [T001969 Mishap 1, T002351-M3]. Auto-Merge ist seit 3.8 angefordert und greift bei grünen Required Checks. Details/Required-Check-Liste: [ci-fix-loop](.claude/skills/references/ci-fix-loop.md).
```bash
PR_URL=$(gh pr view --json url -q '.url')
bash scripts/devflow-ci-watch.sh "$TICKET_ID" "$PR_URL"
```
Bei roten Checks: Logs aus dem Skript-Output an einen `sonnet`-Subagenten (Fix-Routine: Freshness → TS → BATS → Kustomize → Commitlint), nach dem Push Loop wiederholen.
`devflow-ci-watch.sh` rebased bei `DIRTY` gegen `origin/main` (T001408) und endet mit Exit-Code `3` bei Rebase-Konflikt bzw. `4` bei echtem `CONFLICTING`-Mergestatus (T001415) — dann gibt der **Orchestrator den Konflikt per `SendMessage` an den bereits gespawnten Implementer zurück** (kein neuer Spawn — Doppel-Push-Risiko aus T001408) und ruft `devflow-ci-watch.sh` nach dessen Push erneut auf.

## Schritt 6: Phase-Chain-Gate & Merge-Wait

> Schritt 6 läuft im Orchestrator; 6.4–7.5 hat der Finalizer (3.9). `E2E PR` ist kein required
> check (T000722). Required-Check-Liste: [ci-fix-loop](.claude/skills/references/ci-fix-loop.md).
**Fail-closed Phase-Chain-Gate (T001444) — PFLICHT vor dem Merge, KEIN `|| true`:**
Prüft `plan:done`, `implement:entered` und `verify:done`. Bei FAIL zuerst backfillen (insb.
`verify done` nach grünem `task test:changed`).
```bash
./scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"
```

## Schritte 6.4–7.5 — Merge-Wait, Ticket-Abschluss, Cleanup

Zuständig ist der Finalizer, den Schritt 3.9 als frischen Subagenten spawnt. `gh pr merge --auto` kehrt sofort zurück; erst den
Merge abwarten ([ci-fix-loop](.claude/skills/references/ci-fix-loop.md) §"PR-Merge-Wait-Loop",
T001149-M1), dann abschließen:

```bash
bash scripts/devflow-post-merge-finalize.sh "$TICKET_ID" --pr "$PR_NUM"
```

Das Skript führt idempotent aus: PR verlinken, Ticket auf `done` (`shipped`/`fixed`),
`verify:done`-Phase-Event, Plan nach `tickets.ticket_plans` archivieren, OpenSpec-Change ins Archiv
(inkl. Archiv-PR), Claims freigeben, Worktree und Branch entfernen. Jede Session kann offene
Schritte mit einem Aufruf nachholen. Die Closure darin:

```bash
./scripts/vda.sh ticket update-status --id "$TICKET_ID" --status done --resolution "$RESOLUTION"
```

Befehlsfolgen inkl. Poll-Loop und MCP-first-Aufrufen:
[dev-flow-execute-phases](.claude/skills/references/dev-flow-execute-phases.md). Archivierung samt
Push-Verifikation [T001268] und PR-Creation-Verifikation [T001331]:
[plan-archive-steps](.claude/skills/references/plan-archive-steps.md).

> **Merge = Abschluss (T001092)** — Regel in CLAUDE.md. `qa_review`/`awaiting_deploy` nicht als
> Zwischenstatus setzen. **Reihenfolge (T004612):** Archivierung VOR der Branch-Löschung.
> **Claims vor dem Worktree-Remove freigeben.**

## Schritt 8: Post-Merge Deploy & Verify

```bash
bash scripts/devflow-post-merge-deploy.sh "$TICKET_ID"
```
**Deploy-Mapping (Single Source of Truth):** [deploy-routing](.claude/skills/references/deploy-routing.md) — nur dort pflegen.
Danach `dev-flow-e2e` ausführen, um E2E-Tests gegen die Live-Umgebung zu schreiben.
> **Mitten in der Umsetzung blockiert?** Nutzer mit `lavish` grillen (`.lavish/<slug>-grilling.html`),
> Antworten ans Ticket: `scripts/ticket.sh grill --id <ext-id> --answer <qid>=<text> …`. Siehe
> `.claude/skills/references/grilling-to-ticket.md`.

## Übergabe — Kreislauf geschlossen

**Zustand nach Schritt 8:**
- `main` enthält die gemergten Änderungen (squash commit)
- Worktree `.worktrees/<slug>` gelöscht, Branch `feature/<slug>` gelöscht
- Ticket status = `done` (resolution=shipped)
- Branch-Lock freigegeben
- Deployed (falls `devflow-post-merge-deploy.sh` Pfad-Treffer)
**Kreislauf zurück zu `main`** — nächste Arbeit startet mit `dev-flow-plan` von einem frischen `git pull`.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | **Vorgänger im Kreislauf** — liefert Branch + committiertem Plan |
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
