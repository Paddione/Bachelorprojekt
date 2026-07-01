---
title: Messbare Delivery-Pipeline + DORA-Dashboard
ticket_id: T001092
plan_ref: openspec/changes/dora-delivery-pipeline/tasks.md
status: plan_staged
date: 2026-06-22
domains: [website, factory, db]
spec_ref: docs/superpowers/specs/2026-06-22-dora-delivery-pipeline-design.md
openspec_ref: openspec/changes/dora-delivery-pipeline/
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Messbare Delivery-Pipeline + DORA-Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vereinheitliche das „Merge = Abschluss"-Lifecycle für Factory + dev-flow-execute (inkl. Batches), mache die Pipeline bis „Shipped" sichtbar, und liefere ein konsolidiertes admin-only DORA-Dashboard mit allen 4 kanonischen Metriken inkl. neu berechnetem MTTR.

**Architecture:** Drei gekoppelte Scheiben, Build-Reihenfolge **C → B → A** (C ist das Status-Fundament; B = Floor-Sichtbarkeit; A = Messung hängt an C). Scheibe C entkoppelt Closure vom Prod-Deploy: nach grünem Auto-Merge geht ein Ticket direkt auf `done · resolution=shipped` — `awaiting_deploy`/`qa_review` verlassen den Happy-Path (Enum-Werte bleiben nicht-destruktiv erhalten). Quality-Gate-Ergebnisse werden als `verify`-Phase-Events (`tickets.factory_phase_events`, strukturiertes `detail`) erfasst — kein neues Schema. Scheibe B lagert die Lane-Logik in ein neues pures Modul `factory-floor-lanes.ts` aus (factory-floor.ts hat nur ~20 Zeilen S1-Budget). Scheibe A berechnet alle 4 DORA-Metriken in einem neuen puren Modul `dora-metrics.ts` (Vitest-testbar), exponiert über `/api/admin/dora-metrics` und rendert in `/admin/dora` + `DoraDashboard.svelte`.

**Tech Stack:** Node.js CJS (`scripts/factory/*.cjs`/`pipeline.js`), Bash (`scripts/ticket.sh`, `scripts/vda/ticket/*.sh`), BATS (`tests/spec/software-factory.bats`), TypeScript (pure `lib/*.ts` + Astro API-Routes), Vitest, Svelte 5 (runes), Astro SSR (`AdminLayout.astro`), PostgreSQL 16 (`tickets.*`).

## Global Constraints

Jeder Task erbt diesen Abschnitt implizit. Werte stammen aus der Design-Spec §S1-Budgets, §3, §5, §6 und der Quality-Gates-Referenz (`.claude/skills/references/plan-quality-gates.md`, SSOT `docs/code-quality/gates.yaml`).

- **Merge = Abschluss (Kern-Invariante).** Nach grünem Auto-Merge nach `main` → Ticket **direkt** `done · resolution=shipped` im selben Schritt wie der Merge. KEIN `awaiting_deploy`, KEIN `qa_review` im Happy-Path. Prod-Deploy bleibt entkoppelt (push-based) und ändert den Ticket-Status NICHT. Gilt einheitlich für **Factory (pipeline.js)** + **dev-flow-execute (SKILL)** + **Batches** (mehrere devflow-Tickets parallel).
- **Enum-Werte NICHT destruktiv löschen.** `awaiting_deploy` und `qa_review` bleiben im TS-Enum (`transition.ts:7-14`), im `VALID_STATUSES`-Set, und im DB-`CHECK`-Constraint — für historische Zeilen, manuelle Sonderfälle und das Watchdog-Sicherheitsnetz. KEIN DB-Constraint-Drop, KEINE destruktive Migration.
- **Watchdog bleibt.** `scripts/factory/watchdog.sh` eskaliert `awaiting_deploy > 24h` weiter (no-op im Normalbetrieb, da Happy-Path den Stand nicht mehr erzeugt). NICHT entfernen.
- **`ticket_links kind='fixes'` ist ein Self-Link (`from_id=to_id`), KEIN „behebt-Bug"-Signal.** `transition.ts:93-100` legt ihn bei JEDEM Abschluss mit PR an = PR-Anheftung. Failure-Signale ausschließlich über `tickets.type='bug'` (MTTR) bzw. `tickets.pr_events.status='reverted'` (CFR) ableiten — NIEMALS über die Existenz eines `fixes`-Links.
- **MTTR-Definition.** `type='bug'`-Tickets, **Median** von `merged_at`(des schließenden PR) − `created_at`. Der schließende PR wird über den `ticket_links`-Self-Link (`pr_number`) → `pr_events.merged_at` gefunden. „n/a" wenn keine geschlossenen Bugs im Fenster.
- **Deployment Frequency** = Merges nach `main` pro Fenster (Tickets `done` mit verknüpftem gemergten PR). Im UI EXPLIZIT als „Merges nach main" labeln (ehrlich; nicht „Prod-Deploys").
- **Change Failure Rate** = `(# reverted Merges + # Bug-Tickets im Fenster) / # Merges im Fenster`. Im UI EHRLICH als **Proxy** deklarieren.
- **Lead Time** als **Median** (primär) + **Mittel** (sekundär). Sub-Zeiten als Drill-down erhalten.
- **S1 — Per-File Line Ratchet** (statische Limits: `.ts`/`.js`=600, `.svelte`/`.sh`/`.mjs`=500, `.astro`=400; wirksame Schwelle = Baseline falls gebaselined). Alle hier berührten Code-Dateien sind **`nicht-baselined`** (Schwelle = statisches Limit). Ist-Stand und Budget:
  - `website/src/lib/factory-floor.ts` — Ist **580** · Limit 600 → **Budget ~20**. ⚠ Neue Lane-Logik MUSS in das NEUE Modul `website/src/lib/factory-floor-lanes.ts` (startet bei 0) — KEINE kosmetische Verdichtung, echte Auslagerung. factory-floor.ts darf nur Re-Export/Delegation gewinnen (≤ ~10 Zeilen netto).
  - `website/src/components/FactoryFloor.svelte` — Ist **492** · Limit 500 → **Budget ~8**. ⚠ Sehr knapp. Lane-Sichtbarkeits-/leer-ausblenden-Logik darf hier praktisch nicht wachsen — nur ein bestehender Render-Zweig wird konditioniert (netto ~0). Bei Überschreitung echten Split planen, nicht verdichten.
  - `website/src/lib/tickets/transition.ts` — Ist **151** · Limit 600 → Budget ~449. Reichlich.
  - `website/src/lib/delivery-metrics.ts` — Ist **125** · Limit 600 → Budget ~475. Reichlich (Wiederverwendung von `calcDurationH`/`avg`/`modelMixPercent`).
  - `website/src/pages/api/admin/delivery-metrics.ts` — Ist **128** · Limit 600 → Budget ~472. (Nur referenziert; nicht zwingend geändert.)
  - `website/src/layouts/AdminLayout.astro` — Ist **357** · Limit 400 → **Budget ~43**. Ein Nav-Eintrag ist ~1 Zeile. OK, aber knapp halten.
  - `scripts/factory/pipeline.js` — **S1-IGNORIERT** (sanktionierte Monolith-Ausnahme): kein Zeilenbudget. ABER der **FA-SF-20-Contract-Test** wacht über Struktur-Invarianten — C-Änderungen müssen sie wahren (siehe Task 3).
  - Neue Dateien (volles Budget): `factory-floor-lanes.ts` (<600), `dora-metrics.ts` (<600), `api/admin/dora-metrics.ts` (<600), `admin/dora.astro` (<400), `components/admin/DoraDashboard.svelte` (<500), `factory/deploy-transition.cjs`-Änderung (Ist klein).
- **S2 — keine Import-Zyklen.** `factory-floor-lanes.ts` und `dora-metrics.ts` als **pure Module** planen (importieren nur `pool` aus `website-db` für Query-Funktionen bzw. gar nichts für reine Rechen-Helfer); KEIN Rück-Import von API-/Astro-Schichten.
- **S3 — keine Brand-Domain-Literale** (`*.mentolder.de` / `*.korczewski.de`) in `k3d/`, `prod*/`, `website/src/` (Kommentare ausgenommen). PR-URLs aus `GITHUB_REPO`-Env ableiten (wie `delivery-metrics.ts`/API es tun). KEINE Brand-Domains in Code-Snippets.
- **S4 — keine Orphans.** Neue `scripts/*` von Taskfile/CI/Doku/anderem Skript erreichbar; neue `website/src/pages/*` über `AdminLayout`-Nav erreichbar. (Dieser Change fügt keine neuen `k3d/*.yaml` hinzu.)
- **Admin-Auth-Muster (verbatim kopieren).** API-Routes nutzen `getSession(request.headers.get('cookie'))` + `isAdmin(session)` aus `website/src/lib/auth.ts`, `export const prerender = false`, `locals.requestLogger.error(...)` für Fehler. 401 bei `!session || !isAdmin(session)`. Vorlage: `website/src/pages/api/admin/delivery-metrics.ts:54-61`. SSR-Seite: `getSession`/`isAdmin`-Redirect wie bestehende `/admin/*.astro`.
- **Gate-Outcome-Events: kein neues Schema.** `verify`-Phase-Events in `tickets.factory_phase_events` mit strukturiertem `detail` (`gate=<name> result=<pass|fail> [step=<x>]`) via `bash scripts/ticket.sh phase <id> verify <done|blocked> --detail "<...>" --driver <factory|devflow>`. Phase-Events sind fire-and-forget (`|| true`) und dürfen NIE den Merge blockieren.
- **Out of scope (NICHT implementieren):** Scheibe D (scout-quality/drift/plan-drift als fail-closed CI-Gates); öffentliche Read-only-DORA-Ansicht; destruktive Enum-Migration; neue `tickets.v_dora`-View (Default: Berechnung in `dora-metrics.ts`); echte Prod-Deploy-Frequenz als Closure-Gate.

---

## File Structure

**Neue Dateien:**
- `scripts/factory/deploy-transition.cjs` — geteilte „Merge=Abschluss"-Transition (Factory + devflow), hält pipeline.js schlank (C)
- `website/src/lib/factory-floor-lanes.ts` — ausgelagerte Lane-Logik (B, S1-Budget)
- `website/src/lib/dora-metrics.ts` — pure 4-Metriken-Berechnung, Vitest-testbar (A)
- `website/src/pages/api/admin/dora-metrics.ts` — Query + `isAdmin`-Gate (A)
- `website/src/pages/admin/dora.astro` — admin-only Seite (A)
- `website/src/components/admin/DoraDashboard.svelte` — 4 Metrik-Karten + Driver-Breakdown (A)
- Tests: `tests/spec/software-factory.bats` (erweitert, FA-SF-22), `website/src/lib/factory-floor-lanes.test.ts`, `website/src/lib/dora-metrics.test.ts`, `website/src/pages/api/admin/dora-metrics.test.ts`, `website/src/components/admin/DoraDashboard.test.ts`

**Geänderte Dateien:**
- `scripts/factory/pipeline.js` — delegiert Deploy-Transition an `deploy-transition.cjs` (C; S1-ignoriert, FA-SF-20-Invarianten wahren)
- `scripts/factory/watchdog.sh` — `awaiting_deploy`-Eskalation bleibt als Sicherheitsnetz (C)
- `scripts/ticket.sh`, `scripts/vda/ticket/update-status.sh` — `--resolution`-Durchreichung verifizieren (C)
- `.claude/skills/dev-flow-execute/SKILL.md` — Schritt 6.5 + AUSSTIEG auf `done/shipped` (C)
- `CLAUDE.md` — `awaiting_deploy`/„merge ≠ prod"-Doku ans neue Modell anpassen (C)
- `website/src/lib/tickets/transition.ts` — falls Resolution-Pfad berührt (C)
- `website/src/lib/factory-floor.ts` — delegiert an `factory-floor-lanes.ts` + `awaitingDeployVisible` im Payload (B)
- `website/src/components/FactoryFloor.svelte` — leere awaiting_deploy-Lane ausblenden (B)
- `website/src/lib/delivery-metrics.ts` — Helfer-Wiederverwendung/Verallgemeinerung (A)
- `website/src/layouts/AdminLayout.astro`, `website/src/pages/admin/architektur.astro` — Nav-Eintrag „DORA" (A)
- `docs/code-quality/gates.yaml` — nur falls nötig (Default: nicht nötig, neue Dateien unter Limit)
- `website/src/data/test-inventory.json` — regeneriert (Verifikations-Task)

## Scheibe C — Vereinheitlichter Abschluss + Gate-Events (Fundament)

### Task 1: Failing BATS-Test für „Merge = Abschluss" (TDD-Kern)

**Files:**
- Modify: `tests/spec/software-factory.bats` (neue `@test`-Einträge im FA-SF-20-Block, nach Zeile ~565)

**Interfaces:**
- Consumes: `scripts/factory/deploy-transition.cjs` (`decideDeployTransition`), `scripts/factory/pipeline.js`, `.claude/skills/dev-flow-execute/SKILL.md`.
- Produces: rote Tests, die nach Task 2/3/4 grün werden. Sie kodifizieren die Kern-Invariante „kein `awaiting_deploy`/`qa_review` im Happy-Path; Abschluss = `done`+`shipped`".

> TDD: Diese Tests MÜSSEN jetzt FEHLSCHLAGEN (der heutige Code setzt `awaiting_deploy`/`qa_review`). Sie sind grep-/`node -e`-Assertions auf die Skript-/SKILL-Logik (offline, kein Cluster), passend zum bestehenden FA-SF-20-Stil.

- [x] **Step 1: Die fehlschlagenden Tests schreiben**

Füge in `tests/spec/software-factory.bats` nach dem letzten FA-SF-20-Test (vor dem `# ── FA-SF-21` Block, ~Zeile 566) ein:

```bash
# ── FA-SF-22-merge-equals-done (T001092) ──────────────────────────#
# Kern-Invariante: grüner Auto-Merge → Ticket direkt done/shipped.
# awaiting_deploy/qa_review verlassen den Happy-Path (Enum bleibt gültig).
DEPLOY_TRANSITION="scripts/factory/deploy-transition.cjs"

@test "FA-SF-22: decideDeployTransition returns done (never awaiting_deploy) on a clean merge" {
  run node -e "const {decideDeployTransition}=require('./scripts/factory/deploy-transition.cjs'); const r=decideDeployTransition({isWebsite:false, deployOutput:'PR #123 merged'}); process.stdout.write(r.status)"
  [ "$status" -eq 0 ]
  [ "$output" = "done" ]
}

@test "FA-SF-22: decideDeployTransition still blocks on a deploy-guard signal" {
  run node -e "const {decideDeployTransition}=require('./scripts/factory/deploy-transition.cjs'); const r=decideDeployTransition({isWebsite:false, deployOutput:'BLOCK: WORK_BRANCH'}); process.stdout.write(r.status)"
  [ "$status" -eq 0 ]
  [ "$output" = "blocked" ]
}

@test "FA-SF-22: pipeline.js Deploy phase no longer writes an awaiting_deploy status transition" {
  # The happy-path must not call update-status --status awaiting_deploy.
  run grep -Eq "update-status[^\n]*--status[[:space:]]+awaiting_deploy" "$PIPELINE_SCRIPT"
  [ "$status" -ne 0 ]
}

@test "FA-SF-22: pipeline.js Deploy phase no longer writes a qa_review status transition" {
  run grep -Eq "update-status[^\n]*--status[[:space:]]+qa_review" "$PIPELINE_SCRIPT"
  [ "$status" -ne 0 ]
}

@test "FA-SF-22: pipeline.js closes the ticket with --status done --resolution shipped" {
  run bash -c "grep -Eq -- '--status[[:space:]]+done' \"$PIPELINE_SCRIPT\" && grep -Eq -- '--resolution[[:space:]]+shipped' \"$PIPELINE_SCRIPT\""
  [ "$status" -eq 0 ]
}

@test "FA-SF-22: dev-flow-execute SKILL closes with done/shipped, not qa_review" {
  SKILL=".claude/skills/dev-flow-execute/SKILL.md"
  run grep -Eq -- "--status[[:space:]]+done[^\n]*--resolution[[:space:]]+|--resolution[^\n]*--status[[:space:]]+done" "$SKILL"
  [ "$status" -eq 0 ]
  run grep -Eq -- "update-status[^\n]*--status[[:space:]]+qa_review" "$SKILL"
  [ "$status" -ne 0 ]
}

@test "FA-SF-22: transition.ts retains awaiting_deploy + qa_review in VALID_STATUSES (non-destructive)" {
  TS="website/src/lib/tickets/transition.ts"
  run grep -q "awaiting_deploy" "$TS"; [ "$status" -eq 0 ]
  run grep -q "qa_review" "$TS"; [ "$status" -eq 0 ]
}
```

- [x] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `bats tests/spec/software-factory.bats -f "FA-SF-22"`
Expected: FAIL — `FA-SF-22: decideDeployTransition returns done …` (heute liefert es `awaiting_deploy`), `… no longer writes an awaiting_deploy …` (pipeline.js:700 schreibt es), `… closes with done/shipped` (fehlt), und der SKILL-Test schlägt fehl (SKILL.md:408 setzt `qa_review`). Die `transition.ts`-Retain-Tests dürfen SCHON grün sein (Enum-Werte sind vorhanden) — das ist beabsichtigt (Regressionsschutz gegen destruktives Löschen).

- [x] **Step 3: Commit (rote Tests)**

```bash
git add tests/spec/software-factory.bats
git commit -m "test(factory): failing FA-SF-22 — merge=done, no awaiting_deploy/qa_review [T001092]"
```

---

### Task 2: deploy-transition.cjs — `done` statt `awaiting_deploy`

**Files:**
- Modify: `scripts/factory/deploy-transition.cjs`

**Interfaces:**
- Consumes: `ctx = { isWebsite: boolean, deployOutput: string }` (unverändert).
- Produces: `decideDeployTransition(ctx)` gibt bei sauberem Merge `{ status: 'done', reason: 'merged' }` zurück (vorher `{ status: 'awaiting_deploy', reason: 'merged-not-deployed' }`); Block-Signal weiter `{ status: 'blocked', reason: 'deploy-guard' }`. `isWebsite` ist nun irrelevant für den Erfolgspfad (beide → `done`), bleibt aber als Parameter erhalten (Aufrufer in pipeline.js übergibt ihn weiterhin). Konsumiert von pipeline.js:698 (Task 3).

- [x] **Step 1: Funktion anpassen**

Ersetze in `scripts/factory/deploy-transition.cjs` den Erfolgs-Zweig. Vorher (Ist):

```js
  if (ctx.isWebsite) return { status: 'done' };
  return { status: 'awaiting_deploy', reason: 'merged-not-deployed' };
```

Nachher:

```js
  // Merge = Abschluss (T001092): a clean auto-merge to main closes the ticket
  // directly as done/shipped. Prod-deploy is decoupled (push-based) and does NOT
  // gate closure. isWebsite no longer changes the outcome — both close as done.
  return { status: 'done', reason: 'merged' };
```

(Der `BLOCK:`/`deploy-guard`-Zweig bleibt unverändert oben in der Funktion.)

- [x] **Step 2: FA-SF-22 decideDeployTransition-Tests grün**

Run: `bats tests/spec/software-factory.bats -f "FA-SF-22: decideDeployTransition"`
Expected: PASS (beide: `done` bei sauberem Merge, `blocked` bei Guard-Signal).

- [x] **Step 3: Commit**

```bash
git add scripts/factory/deploy-transition.cjs
git commit -m "feat(factory): deploy-transition resolves to done on merge (decouple prod) [T001092]"
```

---

### Task 3: pipeline.js Deploy-Phase — Abschluss done/shipped + Gate-Event

**Files:**
- Modify: `scripts/factory/pipeline.js` (Deploy-Phase, ~Zeile 645-702) — S1-ignoriert, aber FA-SF-20-Contract wahren.

**Interfaces:**
- Consumes: `decideDeployTransition` aus Task 2; `A.ticket_id`, `slug`, `WORK_BRANCH`, `planFilePath`, `deploy` (Agent-Output), `phaseEvent(...)`.
- Produces: nach bestätigtem Auto-Merge ein einziger Abschluss-Übergang `update-status --status done --resolution shipped` (+ `add-pr-link`), ein `phase deploy done`-Event, und ein `verify`-Gate-Outcome-Event. KEINE `awaiting_deploy`/`qa_review`-Schreibstelle mehr.

> Achtung FA-SF-20: NICHT entfernen — `feature:`, `ENV=mentolder`/`ENV=korczewski`, `ticket.sh touch` (≥6), die sechs `phase('…')`-Meta-Einträge, `ToolSearch select:PushNotification` (≥2), `consumeInjections` (≥7). Nur die Status-Schreibstellen ändern.

- [x] **Step 1: `qa_review`-Schreibstelle (Schritt 5) durch done/shipped ersetzen**

Finde im Deploy-Prompt-Template (um Zeile 647):

```
   5. bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status qa_review
      bash ${REPO}/scripts/ticket.sh archive-plan --id ${A.ticket_id} --slug ${slug} --branch ${WORK_BRANCH} --plan-file ${planFilePath ?? resolveTaskSource(slug, REPO)}
```

Ersetze die `qa_review`-Zeile (und ergänze PR-Link + Gate-Event) durch:

```
   5. PR_NUM=$(gh pr view "$PR" --json number -q '.number' 2>/dev/null || echo "$PR")
      bash ${REPO}/scripts/ticket.sh add-pr-link --id ${A.ticket_id} --pr "$PR_NUM" || true
      bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status done --resolution shipped
      bash ${REPO}/scripts/ticket.sh phase ${A.ticket_id} verify done --driver factory --detail "gate=ci result=pass" || true
      bash ${REPO}/scripts/ticket.sh archive-plan --id ${A.ticket_id} --slug ${slug} --branch ${WORK_BRANCH} --plan-file ${planFilePath ?? resolveTaskSource(slug, REPO)}
```

(Der `add-pr-link` setzt einen `kind='pr'`-Link, den `getShipped()` und die DORA-Query lesen; `update-status --resolution shipped` ist bereits unterstützt — siehe `scripts/vda/ticket/update-status.sh`. Der `verify`-Gate-Event ist fire-and-forget.)

- [x] **Step 2: CI-rot-Pfad (Schritt b/d) um Gate-Fail-Event ergänzen (optional, additiv)**

Im Self-Healing-Loop, im Block, der bei erschöpften Retries blockt (Zeile ~645), ergänze nach `update-status … --status blocked` einen Gate-Event:

```
      If RC -ge 2 or a gate failed: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked; bash ${REPO}/scripts/ticket.sh phase ${A.ticket_id} verify blocked --driver factory --detail "gate=ci result=fail" || true; add-comment "CI red after retries"; return.
```

- [x] **Step 3: `awaiting_deploy`-Schreibstelle (Zeile ~698-700) entfernen**

Ersetze:

```js
const { status: deployStatus, reason: deployReason } = decideDeployTransition({ isWebsite: slug?.includes('website') ?? false, deployOutput: deploy })
phaseEvent('deploy', deployStatus === 'blocked' ? 'blocked' : 'done', deployStatus === 'awaiting_deploy' ? 'merged; awaiting deploy' : 'PR merged')
if (deployStatus === 'awaiting_deploy') { await agent(`bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status awaiting_deploy`, { label: 'status:awaiting_deploy', phase: 'Deploy' }) }
```

durch:

```js
const { status: deployStatus, reason: deployReason } = decideDeployTransition({ isWebsite: slug?.includes('website') ?? false, deployOutput: deploy })
// Merge = Abschluss (T001092): the agent prompt (step 5) already set the ticket to
// done/shipped after the confirmed auto-merge. The Deploy phase-event records the
// merge; there is no separate awaiting_deploy resting state on the happy path.
phaseEvent('deploy', deployStatus === 'blocked' ? 'blocked' : 'done', deployStatus === 'blocked' ? 'deploy blocked' : 'PR merged · done/shipped')
```

- [x] **Step 4: node --check + FA-SF-20 + FA-SF-22 pipeline-Tests grün**

```bash
node --check scripts/factory/pipeline.js
bats tests/spec/software-factory.bats -f "FA-SF-20"
bats tests/spec/software-factory.bats -f "FA-SF-22: pipeline"
```
Expected: `node --check` Exit 0; ALLE FA-SF-20-Tests weiter PASS (Struktur-Invarianten gewahrt); die drei FA-SF-22-pipeline-Tests (no awaiting_deploy, no qa_review, closes with done/shipped) jetzt PASS.

- [x] **Step 5: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(factory): pipeline closes ticket done/shipped on merge + gate events [T001092]"
```

---

### Task 4: dev-flow-execute SKILL — Schritt 6.5 auf done/shipped

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (Schritt 6.5 ~Zeile 408; AUSSTIEG-Texte Zeile 30, 49; „Zustand nach Schritt 8" Zeile 490)

**Interfaces:**
- Consumes: `$TICKET_ID`, `$PR_NUM`, `$RESOLUTION`.
- Produces: devflow-Tickets schließen wie Factory-Tickets auf `done · resolution=shipped` und emittieren `phase deploy done --driver devflow`. KEIN `qa_review` mehr. (`.md` hat kein S1-Limit.)

- [x] **Step 1: Schritt 6.5 umschreiben**

Ersetze in `.claude/skills/dev-flow-execute/SKILL.md` den `qa_review`-Aufruf (Zeile ~408) und ergänze das Gate-Event. Vorher:

```bash
./scripts/vda.sh ticket update-status --id "$TICKET_ID" --status qa_review
# Live-Floor-Telemetrie (best-effort; --driver devflow; darf den Flow nie stoppen)
./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow --detail "PR #$PR_NUM merged · deployed" || true
```

Nachher:

```bash
# Merge = Abschluss (T001092): grüner Auto-Merge nach main schließt das Ticket direkt.
# Prod-Deploy (Schritt 8) ist entkoppelt und ändert den Ticket-Status NICHT.
./scripts/vda.sh ticket update-status --id "$TICKET_ID" --status done --resolution "$RESOLUTION"
# Quality-Gate-Outcome + Live-Floor-Telemetrie (best-effort; --driver devflow; nie blockierend)
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "gate=ci result=pass" || true
./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow --detail "PR #$PR_NUM merged · done/shipped" || true
```

(`$RESOLUTION` ist bereits in Schritt 6.5 gesetzt: `RESOLUTION="shipped"` / `"fixed"` bei Fixes — Zeile ~402. `add-pr-link` bleibt davor unverändert.)

- [x] **Step 2: AUSSTIEG- und „Kreislauf"-Texte aktualisieren**

Ersetze die drei `qa_review`-Erwähnungen im Prosa-Text:
- Zeile ~30: `Ticket \`qa_review\`` → `Ticket \`done/shipped\``
- Zeile ~49: `Ticket \`qa_review\`` → `Ticket \`done/shipped\``
- Zeile ~490: `- Ticket status = \`qa_review\`` → `- Ticket status = \`done\` (resolution=shipped)`

- [x] **Step 3: FA-SF-22 SKILL-Test grün + keine `qa_review`-Reste**

```bash
bats tests/spec/software-factory.bats -f "FA-SF-22: dev-flow-execute"
grep -n "qa_review" .claude/skills/dev-flow-execute/SKILL.md || echo "OK — keine qa_review-Reste"
```
Expected: SKILL-Test PASS; `grep` findet keine `qa_review`-Vorkommen mehr (oder nur in einem expliziten „retired"-Erklärsatz, falls bewusst dokumentiert — dann den FA-SF-22-SKILL-Test entsprechend so halten, dass er nur die `update-status … --status qa_review`-Schreibstelle verbietet, nicht jede Erwähnung).

- [x] **Step 4: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "docs(skill): dev-flow-execute closes done/shipped on merge, drop qa_review [T001092]"
```

---

### Task 5: CLAUDE.md — „awaiting_deploy"/„merge ≠ prod" auf neues Modell umschreiben

**Files:**
- Modify: `CLAUDE.md` (Abschnitt „Domain conventions: awaiting_deploy status"; ggf. „merge ≠ prod"-Erwähnungen)

**Interfaces:**
- Consumes: nichts.
- Produces: Doku, die das vereinheitlichte Lifecycle beschreibt (Merge=Abschluss, `awaiting_deploy`/`qa_review` retired aus Happy-Path, Enum nicht-destruktiv erhalten, Watchdog bleibt). (`.md` hat kein S1-Limit.)

- [x] **Step 1: Abschnitt finden**

Run: `grep -n "awaiting_deploy\|merge ≠ prod\|Domain conventions" CLAUDE.md`
Expected: u.a. der Abschnitt `### Domain conventions: awaiting_deploy status`.

- [x] **Step 2: Abschnitt umschreiben**

Ersetze den `awaiting_deploy`-Abschnitt durch eine Beschreibung des neuen Modells, z. B.:

```markdown
### Domain conventions: Merge = Abschluss (T001092)

Ein Ticket wird bei **grünem Auto-Merge nach `main` direkt geschlossen** (`done · resolution=shipped`) —
einheitlich für Factory (`pipeline.js`) und dev-flow-execute (inkl. Batches). Der Prod-Deploy ist
**entkoppelt** (push-based) und ändert den Ticket-Status NICHT. `awaiting_deploy` und `qa_review` sind
**aus dem Happy-Path entfernt**, bleiben aber als Enum-Werte gültig (historische Zeilen, manuelle
Sonderfälle, Watchdog-Sicherheitsnetz `awaiting_deploy > 24h`). Es gibt keine separate
„gemergt-aber-noch-nicht-live"-Ruhestufe mehr; Closure trackt **Merge**, nicht Prod-Live.
```

Passe verbleibende „merge ≠ prod"-Lane-Erwähnungen entsprechend an (Hinweis: Floor blendet die `awaiting_deploy`-Lane jetzt leer aus — siehe Scheibe B).

- [x] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document Merge=Abschluss lifecycle (retire awaiting_deploy happy-path) [T001092]"
```

---

## Scheibe B — Floor zeigt die volle Reise bis „Shipped" (Sichtbarkeit)

### Task 6: factory-floor-lanes.ts — neues Lane-Modul (S1-Auslagerung)

**Files:**
- Create: `website/src/lib/factory-floor-lanes.ts`
- Create: `website/src/lib/factory-floor-lanes.test.ts`

**Interfaces:**
- Consumes: nichts (pures Modul, nur Typ-Importe via `import type`).
- Produces:
  - `interface ShippedItem { extId: string; title: string; doneAt: string | null; prNumber: number | null; }`
  - `interface AwaitingDeployItem { extId: string; title: string; mergedAt: string | null; prNumber: number | null; }`
  - `mapShippedRow(row: { external_id: string; title: string; done_at: string | null; pr_number: number | null }): ShippedItem`
  - `mapAwaitingRow(row: { external_id: string; title: string; updated_at: string | null; pr_number: number | null }): AwaitingDeployItem`
  - `isAwaitingDeployLaneVisible(items: AwaitingDeployItem[]): boolean` — `true` nur wenn `items.length > 0` (leer-ausblenden im Normalbetrieb).
  - Konsumiert von factory-floor.ts (Task 7, Query bleibt dort) und FactoryFloor.svelte (Task 8, Sichtbarkeits-Flag im Payload).

> Reine Mapping-/Sichtbarkeits-Helfer — KEINE SQL, KEIN `pool`-Import (S2: pures Modul, kein DB-/API-Rück-Import). Die SQL bleibt in factory-floor.ts; nur die Row→Item-Abbildung und die Lane-Sichtbarkeits-Regel ziehen hierher um.

- [x] **Step 1: Den fehlschlagenden Test schreiben**

Create `website/src/lib/factory-floor-lanes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  mapShippedRow,
  mapAwaitingRow,
  isAwaitingDeployLaneVisible,
} from './factory-floor-lanes';

describe('factory-floor-lanes', () => {
  it('mapShippedRow normalises done_at to ISO and keeps prNumber', () => {
    const r = mapShippedRow({ external_id: 'T1', title: 'X', done_at: '2026-06-22T10:00:00Z', pr_number: 42 });
    expect(r).toEqual({ extId: 'T1', title: 'X', doneAt: '2026-06-22T10:00:00.000Z', prNumber: 42 });
  });

  it('mapShippedRow tolerates null done_at and null pr_number', () => {
    const r = mapShippedRow({ external_id: 'T2', title: 'Y', done_at: null, pr_number: null });
    expect(r.doneAt).toBeNull();
    expect(r.prNumber).toBeNull();
  });

  it('mapAwaitingRow maps updated_at to mergedAt (ISO)', () => {
    const r = mapAwaitingRow({ external_id: 'T3', title: 'Z', updated_at: '2026-06-22T09:00:00Z', pr_number: 7 });
    expect(r.mergedAt).toBe('2026-06-22T09:00:00.000Z');
    expect(r.prNumber).toBe(7);
  });

  it('isAwaitingDeployLaneVisible hides an empty lane (happy path)', () => {
    expect(isAwaitingDeployLaneVisible([])).toBe(false);
  });

  it('isAwaitingDeployLaneVisible shows a non-empty lane (manual hold-back)', () => {
    expect(isAwaitingDeployLaneVisible([{ extId: 'T4', title: 'M', mergedAt: null, prNumber: null }])).toBe(true);
  });
});
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd website && npx vitest run src/lib/factory-floor-lanes.test.ts`
Expected: FAIL — `Cannot find module './factory-floor-lanes'`.

- [x] **Step 3: Modul schreiben**

Create `website/src/lib/factory-floor-lanes.ts`:

```ts
// Pure lane mapping + visibility helpers for the Software Factory floor (T001092).
// Extracted from factory-floor.ts to keep that file under its S1 line budget.
// No DB/API imports — pure functions, Vitest-testable.

export interface ShippedItem {
  extId: string;
  title: string;
  doneAt: string | null;
  prNumber: number | null;
}

export interface AwaitingDeployItem {
  extId: string;
  title: string;
  mergedAt: string | null;
  prNumber: number | null;
}

export function mapShippedRow(row: {
  external_id: string;
  title: string;
  done_at: string | null;
  pr_number: number | null;
}): ShippedItem {
  return {
    extId: row.external_id,
    title: row.title,
    doneAt: row.done_at ? new Date(row.done_at).toISOString() : null,
    prNumber: row.pr_number ?? null,
  };
}

export function mapAwaitingRow(row: {
  external_id: string;
  title: string;
  updated_at: string | null;
  pr_number: number | null;
}): AwaitingDeployItem {
  return {
    extId: row.external_id,
    title: row.title,
    mergedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    prNumber: row.pr_number ?? null,
  };
}

// Merge = Abschluss (T001092): the happy path no longer produces awaiting_deploy,
// so this lane is empty in normal operation and is hidden. It only renders when a
// ticket was *manually* left in awaiting_deploy (a held-back special case).
export function isAwaitingDeployLaneVisible(items: AwaitingDeployItem[]): boolean {
  return items.length > 0;
}
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

Run: `cd website && npx vitest run src/lib/factory-floor-lanes.test.ts`
Expected: alle 5 Tests PASS.

- [x] **Step 5: Budget-Check**

Run: `wc -l website/src/lib/factory-floor-lanes.ts`
Expected: < 600 (≈ 55).

- [x] **Step 6: Commit**

```bash
git add website/src/lib/factory-floor-lanes.ts website/src/lib/factory-floor-lanes.test.ts
git commit -m "feat(floor): extract pure lane mapping + visibility helpers [T001092]"
```

---

### Task 7: factory-floor.ts — auf factory-floor-lanes.ts delegieren + Sichtbarkeit im Payload

**Files:**
- Modify: `website/src/lib/factory-floor.ts` (Re-Export + Delegation, ~Budget 20 Zeilen)
- Modify: `website/src/lib/factory-floor.test.ts` — falls vorhanden (sonst überspringen)

**Interfaces:**
- Consumes: `mapShippedRow`, `mapAwaitingRow`, `isAwaitingDeployLaneVisible`, `ShippedItem`, `AwaitingDeployItem` aus `./factory-floor-lanes`.
- Produces: `getShipped()`/`getAwaitingDeploy()` nutzen die ausgelagerten Mapper; `FloorPayload` erhält ein neues Feld `awaitingDeployVisible: boolean`. `ShippedItem`/`AwaitingDeployItem` werden aus `factory-floor-lanes` re-exportiert (backward-kompatibel für bestehende Importe).

> S1: factory-floor.ts ist 580/600 → ~20 Budget. Diese Task ersetzt die inline-Interfaces + inline-`.map()`-Bodies durch Importe/Delegation (netto ≤ ~10 Zeilen Zuwachs durch das eine neue Payload-Feld). Wenn `wc -l` danach ≥ 595, eine weitere Hilfsfunktion (z. B. `parsePlanRef`) nach `factory-floor-lanes.ts` ziehen — KEINE kosmetische Verdichtung.

- [x] **Step 1: Interfaces durch Re-Export ersetzen**

Entferne die zwei inline-Interface-Deklarationen in `factory-floor.ts` (Zeile ~93-94):

```ts
export interface ShippedItem { extId: string; title: string; doneAt: string | null; prNumber: number | null; }
export interface AwaitingDeployItem { extId: string; title: string; mergedAt: string | null; prNumber: number | null; }
```

und ersetze sie durch einen Re-Export plus Helfer-Import (oben bei den anderen Importen, nach Zeile 6):

```ts
import { mapShippedRow, mapAwaitingRow, isAwaitingDeployLaneVisible } from './factory-floor-lanes';
export type { ShippedItem, AwaitingDeployItem } from './factory-floor-lanes';
```

- [x] **Step 2: `getShipped()` Mapping delegieren**

Ersetze in `getShipped()` (Zeile ~263-268) den `r.rows.map((row: any) => ({ … }))`-Body durch:

```ts
  return r.rows.map((row: any) => mapShippedRow(row));
```

- [x] **Step 3: `getAwaitingDeploy()` Mapping delegieren**

Ersetze in `getAwaitingDeploy()` (Zeile ~291-296) den `r.rows.map((row: any) => ({ … }))`-Body durch:

```ts
  return r.rows.map((row: any) => mapAwaitingRow(row));
```

- [x] **Step 4: `awaitingDeployVisible` zum Payload hinzufügen**

In `interface FloorPayload` (Zeile ~107-121), nach `awaitingDeploy: AwaitingDeployItem[];`, ergänze:

```ts
  awaitingDeployVisible: boolean;
```

In `getFloor()` (Zeile ~428-434), im zurückgegebenen Objekt, ergänze das Feld (nach `awaitingDeploy`):

```ts
    awaitingDeployVisible: isAwaitingDeployLaneVisible(awaitingDeploy),
```

- [x] **Step 5: Budget-Check + Typecheck**

```bash
wc -l website/src/lib/factory-floor.ts
cd website && npx vitest run src/lib/factory-floor.test.ts 2>/dev/null || echo "no factory-floor.test.ts — skip"
cd website && npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i "factory-floor" || echo "no factory-floor type errors"
```
Expected: `wc -l` ≤ ~590 (Budget gehalten; falls ≥ 595, weitere Funktion auslagern); keine neuen Typfehler in `factory-floor.ts`. Falls ein `factory-floor.test.ts` existiert, weiter grün (die Mapper liefern identische Shapes).

- [x] **Step 6: Commit**

```bash
git add website/src/lib/factory-floor.ts
git commit -m "refactor(floor): delegate lane mapping to factory-floor-lanes + awaitingDeployVisible [T001092]"
```

---

### Task 8: FactoryFloor.svelte — `awaiting_deploy`-Lane leer ausblenden

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte` (Ist 492 · Limit 500 → Budget ~8; netto ~0 planen)

**Interfaces:**
- Consumes: `floor.awaitingDeployVisible` (neues Feld aus Task 7) + `floor.awaitingDeploy`.
- Produces: die `AwaitingDeployLane` rendert nur noch, wenn `awaitingDeployVisible === true` (im Normalbetrieb leer → ausgeblendet). KEINE neue Lane, kein Bruch der `getHall()`-/`getShipped()`-Darstellung.

> S1 sehr knapp (~8 Zeilen). Nur den bestehenden Render-Zweig der AwaitingDeploy-Lane mit `{#if floor.awaitingDeployVisible}` umschließen (netto +1 `{#if}` / +1 `{/if}` ≈ 0 effektiv, da die Lane-Zeilen bestehen bleiben). KEIN neuer Markup-Block, KEINE Verdichtung anderswo.

- [x] **Step 1: Render-Zweig der AwaitingDeploy-Lane finden**

Run: `grep -n "AwaitingDeployLane\|awaitingDeploy" website/src/components/FactoryFloor.svelte`
Expected: die Stelle, an der `<AwaitingDeployLane … />` mit `floor.awaitingDeploy` gerendert wird.

- [x] **Step 2: Konditionale Sichtbarkeit umsetzen**

Umschließe den vorhandenen `<AwaitingDeployLane … />`-Aufruf (Markup unverändert lassen) mit dem neuen Flag. Beispiel (an die echte Struktur anpassen):

```svelte
{#if floor.awaitingDeployVisible}
  <AwaitingDeployLane items={floor.awaitingDeploy} />
{/if}
```

(Falls die Lane heute bedingungslos gerendert wird, ersetze ein evtl. vorhandenes `{#if floor.awaitingDeploy.length}` durch `{#if floor.awaitingDeployVisible}` — netto 0 Zeilen.)

- [x] **Step 3: Budget-Check + Typecheck/Build-Gate**

```bash
wc -l website/src/components/FactoryFloor.svelte
cd website && npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i "FactoryFloor" || echo "no FactoryFloor type errors"
```
Expected: `wc -l` ≤ 500 (Budget gehalten); keine neuen Typfehler. Wenn ≥ 500: NICHT verdichten — den AwaitingDeploy-Render-Block in eine kleine Unterkomponente auslagern (eigener Commit) und dort kapseln.

- [x] **Step 4: Commit**

```bash
git add website/src/components/FactoryFloor.svelte
git commit -m "feat(floor): hide empty awaiting_deploy lane (merge=done) [T001092]"
```

---

## Scheibe A — Konsolidiertes DORA-Dashboard (Messung)

### Task 9: dora-metrics.ts — reine 4-Metriken-Berechnung (Vitest)

**Files:**
- Create: `website/src/lib/dora-metrics.ts`
- Create: `website/src/lib/dora-metrics.test.ts`

**Interfaces:**
- Consumes: `calcDurationH` aus `./delivery-metrics` (Wiederverwendung).
- Produces (pure Funktionen, KEIN DB-Import — S2):
  - `interface DoraDeliveryRow { ticketId: string; type: string; driver: 'factory' | 'devflow' | null; createdAt: string | null; mergedAt: string | null; prNumber: number | null; reverted: boolean; }`
  - `interface DoraMetrics { window: string; deploymentFrequency: { merges: number; perWeek: number }; leadTimeHours: { median: number | null; mean: number | null }; changeFailureRate: { rate: number | null; reverts: number; bugs: number; merges: number; isProxy: true }; mttrHours: { median: number | null; closedBugs: number }; driverBreakdown: { factory: number; devflow: number }; }`
  - `median(values: (number | null)[]): number | null`
  - `mean(values: (number | null)[]): number | null` (lokal definiert, da `avg` in delivery-metrics nicht exportiert ist)
  - `computeDora(rows: DoraDeliveryRow[], bugRows: DoraDeliveryRow[], windowDays: number, windowLabel: string): DoraMetrics`
  - Konsumiert von `/api/admin/dora-metrics` (Task 10) und `DoraDashboard.svelte` (Task 11, nur Typen).

> Definitionen (Global Constraints): DF = Merges nach main; Lead Time = `mergedAt − createdAt` Median+Mean; CFR = `(reverts + bugs)/merges` als Proxy; MTTR = Median(`mergedAt − createdAt`) nur für `type='bug'`-Rows, „null"/n/a wenn keine. `driverBreakdown` zählt distinct Merges je Driver. Mixed-Driver-Ticket wird einmal gezählt (Aufrufer liefert distinct ticketId-Rows).

- [x] **Step 1: Den fehlschlagenden Test schreiben**

Create `website/src/lib/dora-metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { median, mean, computeDora } from './dora-metrics';
import type { DoraDeliveryRow } from './dora-metrics';

const merge = (over: Partial<DoraDeliveryRow>): DoraDeliveryRow => ({
  ticketId: 'T', type: 'feature', driver: 'factory',
  createdAt: '2026-06-01T00:00:00Z', mergedAt: '2026-06-01T10:00:00Z',
  prNumber: 1, reverted: false, ...over,
});

describe('median/mean', () => {
  it('median of an odd set', () => expect(median([3, 1, 2])).toBe(2));
  it('median of an even set averages the two middle values', () => expect(median([4, 1, 3, 2])).toBe(2.5));
  it('median ignores nulls and returns null when empty', () => {
    expect(median([null, 5, null])).toBe(5);
    expect(median([null, null])).toBeNull();
  });
  it('mean ignores nulls and returns null when empty', () => {
    expect(mean([2, 4, null])).toBe(3);
    expect(mean([])).toBeNull();
  });
});

describe('computeDora', () => {
  it('Deployment Frequency counts merges and derives per-week', () => {
    const rows = [merge({ ticketId: 'A' }), merge({ ticketId: 'B' })];
    const m = computeDora(rows, [], 7, '7d');
    expect(m.deploymentFrequency.merges).toBe(2);
    expect(m.deploymentFrequency.perWeek).toBe(2);
  });

  it('Lead Time reports both median and mean (hours)', () => {
    const rows = [
      merge({ ticketId: 'A', createdAt: '2026-06-01T00:00:00Z', mergedAt: '2026-06-01T10:00:00Z' }), // 10h
      merge({ ticketId: 'B', createdAt: '2026-06-01T00:00:00Z', mergedAt: '2026-06-01T20:00:00Z' }), // 20h
    ];
    const m = computeDora(rows, [], 7, '7d');
    expect(m.leadTimeHours.median).toBe(15);
    expect(m.leadTimeHours.mean).toBe(15);
  });

  it('Change Failure Rate is (reverts + bugs)/merges and flagged as proxy', () => {
    const rows = [merge({ ticketId: 'A' }), merge({ ticketId: 'B', reverted: true }), merge({ ticketId: 'C' })];
    const bugs = [merge({ ticketId: 'BUG1', type: 'bug' })];
    const m = computeDora(rows, bugs, 7, '7d');
    // 1 revert + 1 bug = 2 over 3 merges
    expect(m.changeFailureRate.rate).toBeCloseTo(2 / 3, 5);
    expect(m.changeFailureRate.reverts).toBe(1);
    expect(m.changeFailureRate.bugs).toBe(1);
    expect(m.changeFailureRate.isProxy).toBe(true);
  });

  it('MTTR is the median bug recovery time (mergedAt − createdAt)', () => {
    const bugs = [
      merge({ ticketId: 'BUG1', type: 'bug', createdAt: '2026-06-01T00:00:00Z', mergedAt: '2026-06-01T04:00:00Z' }), // 4h
      merge({ ticketId: 'BUG2', type: 'bug', createdAt: '2026-06-01T00:00:00Z', mergedAt: '2026-06-01T08:00:00Z' }), // 8h
    ];
    const m = computeDora([], bugs, 7, '7d');
    expect(m.mttrHours.median).toBe(6);
    expect(m.mttrHours.closedBugs).toBe(2);
  });

  it('MTTR is null (n/a) when there are no closed bugs', () => {
    const m = computeDora([merge({})], [], 7, '7d');
    expect(m.mttrHours.median).toBeNull();
    expect(m.mttrHours.closedBugs).toBe(0);
  });

  it('driverBreakdown counts merges per driver', () => {
    const rows = [merge({ ticketId: 'A', driver: 'factory' }), merge({ ticketId: 'B', driver: 'devflow' }), merge({ ticketId: 'C', driver: 'devflow' })];
    const m = computeDora(rows, [], 7, '7d');
    expect(m.driverBreakdown).toEqual({ factory: 1, devflow: 2 });
  });

  it('empty window yields zero merges and n/a rates without throwing', () => {
    const m = computeDora([], [], 7, '7d');
    expect(m.deploymentFrequency.merges).toBe(0);
    expect(m.leadTimeHours.median).toBeNull();
    expect(m.changeFailureRate.rate).toBeNull();
    expect(m.mttrHours.median).toBeNull();
  });
});
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd website && npx vitest run src/lib/dora-metrics.test.ts`
Expected: FAIL — `Cannot find module './dora-metrics'`.

- [x] **Step 3: Modul schreiben**

Create `website/src/lib/dora-metrics.ts`:

```ts
// Pure DORA metric computation (T001092). No DB import — Vitest-testable.
// Reuses calcDurationH from delivery-metrics. The API route (api/admin/dora-metrics.ts)
// supplies the rows from a single query over closed tickets + pr_events.
import { calcDurationH } from './delivery-metrics';

export interface DoraDeliveryRow {
  ticketId: string;
  type: string;                 // 'feature' | 'bug' | …
  driver: 'factory' | 'devflow' | null;
  createdAt: string | null;
  mergedAt: string | null;
  prNumber: number | null;
  reverted: boolean;            // pr_events.status = 'reverted'
}

export interface DoraMetrics {
  window: string;
  deploymentFrequency: { merges: number; perWeek: number };
  leadTimeHours: { median: number | null; mean: number | null };
  changeFailureRate: { rate: number | null; reverts: number; bugs: number; merges: number; isProxy: true };
  mttrHours: { median: number | null; closedBugs: number };
  driverBreakdown: { factory: number; devflow: number };
}

export function median(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

export function mean(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeDora(
  rows: DoraDeliveryRow[],
  bugRows: DoraDeliveryRow[],
  windowDays: number,
  windowLabel: string,
): DoraMetrics {
  const merges = rows.length;
  const weeks = windowDays === 0 ? 1 : Math.max(1, windowDays / 7);
  const perWeek = merges > 0 ? Math.round((merges / weeks) * 10) / 10 : 0;

  const leadTimes = rows.map((r) => calcDurationH(r.createdAt, r.mergedAt));
  const reverts = rows.filter((r) => r.reverted).length;
  const bugs = bugRows.length;
  const rate = merges > 0 ? (reverts + bugs) / merges : null;

  const recovery = bugRows.map((b) => calcDurationH(b.createdAt, b.mergedAt));

  const driverBreakdown = { factory: 0, devflow: 0 };
  for (const r of rows) {
    if (r.driver === 'devflow') driverBreakdown.devflow += 1;
    else driverBreakdown.factory += 1; // null driver counts as factory (legacy/manual)
  }

  return {
    window: windowLabel,
    deploymentFrequency: { merges, perWeek },
    leadTimeHours: { median: median(leadTimes), mean: mean(leadTimes) },
    changeFailureRate: { rate, reverts, bugs, merges, isProxy: true },
    mttrHours: { median: median(recovery), closedBugs: bugRows.length },
    driverBreakdown,
  };
}
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

Run: `cd website && npx vitest run src/lib/dora-metrics.test.ts`
Expected: alle Tests PASS.

- [x] **Step 5: Budget-Check**

Run: `wc -l website/src/lib/dora-metrics.ts`
Expected: < 600 (≈ 75).

- [x] **Step 6: Commit**

```bash
git add website/src/lib/dora-metrics.ts website/src/lib/dora-metrics.test.ts
git commit -m "feat(dora): pure 4-metric DORA computation (DF, lead time, CFR, MTTR) [T001092]"
```

---

### Task 10: /api/admin/dora-metrics.ts — Query + isAdmin-Gate

**Files:**
- Create: `website/src/pages/api/admin/dora-metrics.ts`
- Create: `website/src/pages/api/admin/dora-metrics.test.ts`

**Interfaces:**
- Consumes: `getSession`, `isAdmin` aus `../../../lib/auth`; `pool` aus `../../../lib/website-db`; `computeDora`, `DoraDeliveryRow`, `DoraMetrics` aus `../../../lib/dora-metrics`.
- Produces: `GET /api/admin/dora-metrics?window=7d|30d|90d|all` → `{ metrics: DoraMetrics }`. 401 bei `!session || !isAdmin`. Konsumiert von `DoraDashboard.svelte` (Task 11) und `dora.astro` (Task 12, SSR-Prefetch optional).

> Query vereint **alle** geschlossenen Tickets (`status='done'`, JEDER Driver) — nicht nur devflow (G3). Merges = Feature-/Task-Tickets `done` mit verknüpftem gemergten PR. Bug-Rows separat (`type='bug'`, `done`). `reverted` aus `pr_events.status='reverted'`. `driver` aus dem jüngsten `factory_phase_events.driver` (oder NULL). Auth-Muster verbatim aus `delivery-metrics.ts:54-61`.

- [x] **Step 1: Den fehlschlagenden Test schreiben**

Create `website/src/pages/api/admin/dora-metrics.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/auth', () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));
vi.mock('../../../lib/website-db', () => ({ pool: { query: vi.fn() } }));

import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';
import { GET } from './dora-metrics';

const mkReq = (w = '7d') =>
  new Request(`http://x/api/admin/dora-metrics?window=${w}`, { headers: { cookie: 's=1' } });
const locals = { requestLogger: { error: vi.fn() } } as any;

describe('GET /api/admin/dora-metrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when not admin', async () => {
    (getSession as any).mockResolvedValue(null);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(401);
  });

  it('returns DORA metrics for an admin', async () => {
    (getSession as any).mockResolvedValue({ preferred_username: 'admin', sub: 'a', email: 'a@x' });
    (isAdmin as any).mockReturnValue(true);
    // first query = merges, second = bugs (order matches the route's Promise.all)
    (pool.query as any)
      .mockResolvedValueOnce({ rows: [
        { ticket_id: 'A', type: 'feature', driver: 'factory', created_at: '2026-06-01T00:00:00Z', merged_at: '2026-06-01T10:00:00Z', pr_number: 1, reverted: false },
      ] })
      .mockResolvedValueOnce({ rows: [
        { ticket_id: 'BUG1', type: 'bug', driver: 'devflow', created_at: '2026-06-01T00:00:00Z', merged_at: '2026-06-01T04:00:00Z', pr_number: 2, reverted: false },
      ] });
    const res = await GET({ request: mkReq('30d'), locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics.deploymentFrequency.merges).toBe(1);
    expect(body.metrics.window).toBe('30d');
    expect(body.metrics.mttrHours.median).toBe(4);
    expect(body.metrics.changeFailureRate.isProxy).toBe(true);
  });

  it('returns 500 on a query failure (logged, not thrown)', async () => {
    (getSession as any).mockResolvedValue({ preferred_username: 'admin', sub: 'a', email: 'a@x' });
    (isAdmin as any).mockReturnValue(true);
    (pool.query as any).mockRejectedValue(new Error('db down'));
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(500);
    expect(locals.requestLogger.error).toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd website && npx vitest run src/pages/api/admin/dora-metrics.test.ts`
Expected: FAIL — `Cannot find module './dora-metrics'`.

- [x] **Step 3: API-Route schreiben**

Create `website/src/pages/api/admin/dora-metrics.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';
import { computeDora } from '../../../lib/dora-metrics';
import type { DoraDeliveryRow } from '../../../lib/dora-metrics';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function resolveWindow(w: string): { interval: string; days: number; label: string } {
  switch (w) {
    case '30d': return { interval: "INTERVAL '30 days'", days: 30, label: '30d' };
    case '90d': return { interval: "INTERVAL '90 days'", days: 90, label: '90d' };
    case 'all': return { interval: "INTERVAL '9999 days'", days: 0, label: 'all' };
    default:    return { interval: "INTERVAL '7 days'", days: 7, label: '7d' };
  }
}

function toRow(r: any): DoraDeliveryRow {
  return {
    ticketId: r.ticket_id,
    type: r.type,
    driver: r.driver ?? null,
    createdAt: r.created_at ?? null,
    mergedAt: r.merged_at ?? null,
    prNumber: r.pr_number ?? null,
    reverted: r.reverted === true || r.reverted === 'reverted',
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { interval, days, label } = resolveWindow(new URL(request.url).searchParams.get('window') ?? '7d');

  try {
    // Unified across drivers (G3): all done feature/task tickets with a merged PR,
    // plus the latest phase-event driver (NULL → counts as factory). pr_events gives
    // merged_at + reverted. Bug rows are fetched separately for MTTR + CFR bug term.
    const [mergesRes, bugsRes] = await Promise.all([
      pool.query(
        `SELECT t.external_id AS ticket_id, t.type, dv.driver,
                t.created_at, pe.merged_at, l.pr_number,
                (pe.status = 'reverted') AS reverted
           FROM tickets.tickets t
           JOIN tickets.ticket_links l ON l.from_id = t.id AND l.kind = 'pr' AND l.pr_number IS NOT NULL
           JOIN tickets.pr_events pe ON pe.pr_number = l.pr_number
           LEFT JOIN LATERAL (
             SELECT driver FROM tickets.factory_phase_events
              WHERE ticket_id = t.id ORDER BY at DESC LIMIT 1
           ) dv ON true
          WHERE t.type IN ('feature','task') AND t.status = 'done'
            AND t.done_at >= now() - ${interval}
          ORDER BY t.done_at DESC LIMIT 500`,
      ),
      pool.query(
        `SELECT t.external_id AS ticket_id, t.type, dv.driver,
                t.created_at, pe.merged_at, l.pr_number, false AS reverted
           FROM tickets.tickets t
           JOIN tickets.ticket_links l ON l.from_id = t.id AND l.kind = 'fixes' AND l.pr_number IS NOT NULL
           JOIN tickets.pr_events pe ON pe.pr_number = l.pr_number
           LEFT JOIN LATERAL (
             SELECT driver FROM tickets.factory_phase_events
              WHERE ticket_id = t.id ORDER BY at DESC LIMIT 1
           ) dv ON true
          WHERE t.type = 'bug' AND t.status = 'done'
            AND t.done_at >= now() - ${interval}
          ORDER BY t.done_at DESC LIMIT 500`,
      ),
    ]);

    const merges = (mergesRes.rows as any[]).map(toRow);
    const bugs = (bugsRes.rows as any[]).map(toRow);
    const metrics = computeDora(merges, bugs, days, label);

    return json({ metrics }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/dora-metrics] error:');
    return json({ error: 'fetch_failed' }, 500);
  }
};
```

> Hinweis zur Bug-MTTR-Quelle: Der schließende PR eines Bugs wird über den `ticket_links kind='fixes'`-Self-Link (`pr_number`) → `pr_events.merged_at` gefunden. Das ist die **PR-Anheftung** des Bug-Tickets selbst (nicht „behebt-Bug"-Semantik) — exakt wie in den Global Constraints / §5 verlangt.

- [x] **Step 4: Test laufen lassen, grün bestätigen**

Run: `cd website && npx vitest run src/pages/api/admin/dora-metrics.test.ts`
Expected: alle 3 Tests PASS.

- [x] **Step 5: Budget-Check**

Run: `wc -l website/src/pages/api/admin/dora-metrics.ts`
Expected: < 600 (≈ 105).

- [x] **Step 6: Commit**

```bash
git add website/src/pages/api/admin/dora-metrics.ts website/src/pages/api/admin/dora-metrics.test.ts
git commit -m "feat(api): /api/admin/dora-metrics unified DORA endpoint (isAdmin) [T001092]"
```

---

### Task 11: DoraDashboard.svelte — 4 Metrik-Karten + Driver-Breakdown

**Files:**
- Create: `website/src/components/admin/DoraDashboard.svelte`
- Create: `website/src/components/admin/DoraDashboard.test.ts`

**Interfaces:**
- Consumes: `GET /api/admin/dora-metrics?window=<w>` → `{ metrics: DoraMetrics }`.
- Produces: rendert 4 Metrik-Karten (Deployment Frequency, Lead Time, Change Failure Rate, MTTR), einen Driver-Breakdown (factory/devflow), einen Fenster-Switch (7d/30d/90d/all) und ehrliche Labels („Merges nach main", „Proxy", „Median"). Konsumiert von `dora.astro` (Task 12).

> Svelte 5 runes (`$state`, `$effect`). MTTR `median === null` → „n/a"-Karte. Leere Fenster crashen nicht. CFR-Karte trägt explizit den Hinweis „(Proxy)". DF-Karte-Label „Merges nach main". Keine Brand-Domain-Literale (S3) — PR-/Host-Bezug entfällt; nur Zahlen.

- [x] **Step 1: Den fehlschlagenden Test schreiben**

Create `website/src/components/admin/DoraDashboard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import DoraDashboard from './DoraDashboard.svelte';

const sample = {
  metrics: {
    window: '7d',
    deploymentFrequency: { merges: 5, perWeek: 5 },
    leadTimeHours: { median: 12, mean: 18 },
    changeFailureRate: { rate: 0.25, reverts: 1, bugs: 0, merges: 4, isProxy: true },
    mttrHours: { median: null, closedBugs: 0 },
    driverBreakdown: { factory: 3, devflow: 2 },
  },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => sample }));
});
afterEach(() => vi.unstubAllGlobals());

describe('DoraDashboard', () => {
  it('renders the four metric cards from the API', async () => {
    const { getByText } = render(DoraDashboard);
    await waitFor(() => expect(getByText(/Deployment Frequency/i)).toBeTruthy());
    expect(getByText(/Lead Time/i)).toBeTruthy();
    expect(getByText(/Change Failure Rate/i)).toBeTruthy();
    expect(getByText(/MTTR/i)).toBeTruthy();
  });

  it('labels Deployment Frequency honestly as merges to main', async () => {
    const { getByText } = render(DoraDashboard);
    await waitFor(() => expect(getByText(/Merges nach main/i)).toBeTruthy());
  });

  it('shows n/a for MTTR when median is null', async () => {
    const { getByText } = render(DoraDashboard);
    await waitFor(() => expect(getByText(/n\/a/i)).toBeTruthy());
  });

  it('flags Change Failure Rate as a proxy', async () => {
    const { getByText } = render(DoraDashboard);
    await waitFor(() => expect(getByText(/Proxy/i)).toBeTruthy());
  });
});
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd website && npx vitest run src/components/admin/DoraDashboard.test.ts`
Expected: FAIL — `Cannot find module './DoraDashboard.svelte'`.

- [x] **Step 3: Komponente schreiben**

Create `website/src/components/admin/DoraDashboard.svelte`:

```svelte
<script lang="ts">
  interface DoraMetrics {
    window: string;
    deploymentFrequency: { merges: number; perWeek: number };
    leadTimeHours: { median: number | null; mean: number | null };
    changeFailureRate: { rate: number | null; reverts: number; bugs: number; merges: number; isProxy: boolean };
    mttrHours: { median: number | null; closedBugs: number };
    driverBreakdown: { factory: number; devflow: number };
  }

  let windowSel = $state<'7d' | '30d' | '90d' | 'all'>('7d');
  let metrics = $state<DoraMetrics | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  function fmtH(v: number | null): string {
    return v == null ? 'n/a' : `${Math.round(v * 10) / 10} h`;
  }
  function fmtPct(v: number | null): string {
    return v == null ? 'n/a' : `${Math.round(v * 100)} %`;
  }

  async function load() {
    loading = true;
    try {
      const res = await fetch(`/api/admin/dora-metrics?window=${windowSel}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      metrics = body.metrics ?? null;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'load failed';
    } finally {
      loading = false;
    }
  }

  $effect(() => { void windowSel; load(); });
</script>

<div class="dora">
  <header>
    <h2>DORA — Delivery-Pipeline</h2>
    <label>
      Zeitfenster
      <select bind:value={windowSel}>
        <option value="7d">7 Tage</option>
        <option value="30d">30 Tage</option>
        <option value="90d">90 Tage</option>
        <option value="all">Gesamt</option>
      </select>
    </label>
  </header>

  {#if loading && !metrics}
    <p class="muted">Lädt…</p>
  {:else if error}
    <p class="muted">Fehler: {error}</p>
  {:else if metrics}
    <div class="cards">
      <article class="card">
        <h3>Deployment Frequency</h3>
        <p class="big">{metrics.deploymentFrequency.perWeek}/Woche</p>
        <p class="sub">{metrics.deploymentFrequency.merges} Merges nach main</p>
      </article>
      <article class="card">
        <h3>Lead Time for Changes</h3>
        <p class="big">{fmtH(metrics.leadTimeHours.median)}</p>
        <p class="sub">Median · Ø {fmtH(metrics.leadTimeHours.mean)}</p>
      </article>
      <article class="card">
        <h3>Change Failure Rate</h3>
        <p class="big">{fmtPct(metrics.changeFailureRate.rate)}</p>
        <p class="sub">(Proxy) {metrics.changeFailureRate.reverts} Reverts + {metrics.changeFailureRate.bugs} Bugs / {metrics.changeFailureRate.merges} Merges</p>
      </article>
      <article class="card">
        <h3>MTTR</h3>
        <p class="big">{fmtH(metrics.mttrHours.median)}</p>
        <p class="sub">Median Bug-Recovery · {metrics.mttrHours.closedBugs} Bugs</p>
      </article>
    </div>
    <p class="breakdown">
      Treiber: Factory {metrics.driverBreakdown.factory} · dev-flow {metrics.driverBreakdown.devflow}
    </p>
  {/if}
</div>

<style>
  .dora { color: #cdd6e4; display: flex; flex-direction: column; gap: 1rem; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.8rem; }
  .card { background: #111a29; border: 1px solid #243349; border-radius: 10px; padding: 0.9rem 1rem; }
  .card h3 { margin: 0 0 0.4rem; font-size: 0.9rem; color: #8aa0bd; font-weight: 600; }
  .big { margin: 0; font-size: 1.6rem; font-weight: 700; }
  .sub { margin: 0.3rem 0 0; font-size: 0.8rem; color: #7c8aa0; }
  .breakdown { font-size: 0.85rem; color: #8aa0bd; }
  .muted { color: #7c8aa0; }
  select { background: #0b111c; color: inherit; border: 1px solid #2a3a52; border-radius: 6px; padding: 0.2rem 0.5rem; }
</style>
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

Run: `cd website && npx vitest run src/components/admin/DoraDashboard.test.ts`
Expected: alle 4 Tests PASS. (Falls `@testing-library/svelte` fehlt, einen benachbarten `*.test.ts`, der eine Svelte-Komponente rendert, als Import-Vorlage prüfen.)

- [x] **Step 5: Budget-Check**

Run: `wc -l website/src/components/admin/DoraDashboard.svelte`
Expected: < 500 (≈ 130).

- [x] **Step 6: Commit**

```bash
git add website/src/components/admin/DoraDashboard.svelte website/src/components/admin/DoraDashboard.test.ts
git commit -m "feat(dora): DoraDashboard.svelte — 4 metric cards + driver breakdown [T001092]"
```

---

### Task 12: /admin/dora.astro + AdminLayout-Nav (admin-only Seite)

**Files:**
- Create: `website/src/pages/admin/dora.astro`
- Modify: `website/src/layouts/AdminLayout.astro` (1 Nav-Eintrag in der „Infrastruktur"-Gruppe; Budget ~43)

**Interfaces:**
- Consumes: `getSession`/`isAdmin` (SSR-Redirect-Muster bestehender `/admin/*.astro`); `DoraDashboard` (Task 11).
- Produces: SSR-Seite `/admin/dora`, admin-gated, die `<DoraDashboard client:load />` rendert; ein Nav-Eintrag, der die Seite erreichbar macht (S4: kein Orphan).

> Auth-/Layout-Muster aus einer bestehenden `/admin/*.astro` mit `AdminLayout` kopieren (z. B. `website/src/pages/admin/architektur.astro` als Vorlage öffnen). S3: keine Brand-Domains.

- [x] **Step 1: Vorlage-Seite ansehen**

Run: `sed -n '1,30p' website/src/pages/admin/architektur.astro`
Expected: das `getSession`/`isAdmin`-Redirect-Frontmatter + `<AdminLayout>`-Wrapper + `client:load`-Komponenten-Einbindung. Dieses Muster verbatim übernehmen.

- [x] **Step 2: dora.astro schreiben**

Create `website/src/pages/admin/dora.astro` (Auth-Frontmatter exakt an die Vorlage anpassen — die folgende Struktur spiegelt das übliche Muster):

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import DoraDashboard from '../../components/admin/DoraDashboard.svelte';
import { getSession, isAdmin } from '../../lib/auth';

export const prerender = false;

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session || !isAdmin(session)) {
  return Astro.redirect('/login');
}
---

<AdminLayout title="DORA — Delivery-Pipeline" active="/dev-status">
  <section class="dora-page">
    <DoraDashboard client:load />
  </section>
</AdminLayout>

<style>
  .dora-page { padding: 1.5rem; }
</style>
```

> Passe `import`-Tiefen, das `AdminLayout`-Prop-Set (`title`/`active`/o. Ä.) und das Redirect-Ziel exakt an die Vorlage `architektur.astro` an — nicht raten, kopieren.

- [x] **Step 3: Nav-Eintrag in AdminLayout (Infrastruktur-Gruppe)**

In `website/src/layouts/AdminLayout.astro`, in der `Infrastruktur`-Gruppe (um Zeile 105-112), füge nach dem `Dev Status`-Eintrag (Zeile ~106) hinzu:

```ts
      { href: '/admin/dora', label: 'DORA', icon: 'activity', matches: ['/admin/dora'] },
```

(Alternativ in die `matches`-Liste des bestehenden `Dev Status`-Eintrags `/admin/dora` aufnehmen, falls eine eigene Nav-Zeile das ~43-Budget gefährdet — dann ist es netto 0 Zeilen und trotzdem S4-erreichbar.)

- [x] **Step 4: Budget-Check + Build-Gate**

```bash
wc -l website/src/layouts/AdminLayout.astro
cd website && npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -iE "dora|AdminLayout" || echo "no dora/AdminLayout type errors"
```
Expected: `AdminLayout.astro` ≤ 400 (Budget gehalten); keine neuen Typfehler. Falls `svelte-check` nicht verfügbar: `cd website && npm run build` und auf erfolgreiche Kompilierung prüfen.

- [x] **Step 5: Commit**

```bash
git add website/src/pages/admin/dora.astro website/src/layouts/AdminLayout.astro
git commit -m "feat(dora): /admin/dora SSR page (admin-only) + nav entry [T001092]"
```

---

### Task 13: Finale Verifikation — CI-äquivalentes Gate

**Files:** keine (nur Verifikation).

**Interfaces:** konsumiert alle vorherigen Tasks.

> Pflicht-Schluss-Gate aus `plan-quality-gates`. Jeder Step muss erfolgreich sein, bevor der PR erstellt wird.

- [ ] **Step 1: Gezielte Tests für geänderte Domains**

```bash
task test:changed
```
Expected: PASS — vitest `--changed` greift die neuen Tests (`factory-floor-lanes`, `dora-metrics`, `dora-metrics` API, `DoraDashboard`), die BATS-Selection greift `tests/spec/software-factory.bats` (FA-SF-20 + FA-SF-22), plus `quality:check` (S1–S4-Ratchet).

- [ ] **Step 2: Voller BATS-Lauf der Factory-Spec (Contract-Invarianten)**

```bash
bats tests/spec/software-factory.bats
```
Expected: PASS — alle FA-SF-20 (Struktur-Invarianten von pipeline.js gewahrt) UND alle neuen FA-SF-22 (merge=done) grün.

- [ ] **Step 3: OpenSpec-Delta validieren (muss grün sein)**

```bash
bash scripts/openspec.sh validate
```
Expected: `openspec validate: OK` — die Delta-Dateien unter `openspec/changes/dora-delivery-pipeline/specs/` haben gültige `## ADDED|MODIFIED Requirements`-Header und `### Requirement: `-Einträge.

- [ ] **Step 4: Test-Inventar regenerieren (nach Test-Änderungen Pflicht)**

```bash
task test:inventory
```
Expected: aktualisiert `website/src/data/test-inventory.json` mit den neuen Tests.

- [ ] **Step 5: Freshness-Artefakte regenerieren**

```bash
task freshness:regenerate
```
Expected: aktualisiert generierte Artefakte (repo-index etc.). Was sich ändert, wird gestaged.

- [ ] **Step 6: Freshness + Quality-Ratchet (CI-Äquivalent: S1–S4 + Baseline-Assertion)**

```bash
task freshness:check
```
Expected: PASS — keine S1-Zeilenregression (insb. `factory-floor.ts` ≤ ~590, `FactoryFloor.svelte` ≤ 500, `AdminLayout.astro` ≤ 400), keine S2-Zyklen, keine S3-Brand-Literale, keine S4-Orphans (`/admin/dora` über Nav erreichbar; keine neuen Skripte ohne Anbindung), Baseline-Key-Count unverändert. Bei S1-Fehlschlag: echte Auslagerung statt Verdichtung (Task 6/7-Muster). Bei S4-Fehlschlag: Nav-Eintrag (Task 12) prüfen.

- [ ] **Step 7: Regenerierte Artefakte committen**

```bash
git add website/src/data/test-inventory.json docs/code-quality/ docs/generated/ 2>/dev/null || true
git status --short
git commit -m "chore: regenerate test-inventory + freshness artifacts [T001092]" || echo "nothing to regenerate"
```

(Falls eine Freshness-Regen beim Rebase auf generierten Artefakten kollidiert: `git checkout --ours <file>` je Datei — siehe CLAUDE.md.)

---

## Self-Review (gegen die Design-Spec)

**Spec-Coverage — jede Spec-Sektion ist abgedeckt:**
- §3 „Merge = Abschluss" Lifecycle → Task 2 (deploy-transition), Task 3 (pipeline.js), Task 4 (dev-flow-execute SKILL), Task 5 (CLAUDE.md). Failing-Test-zuerst: Task 1 (FA-SF-22).
- §4.1 Scheibe C, Gate-Outcome-Events (G6) → Task 3 (`verify`-Event in pipeline.js), Task 4 (`verify`-Event in SKILL) — reuse `factory_phase_events`, kein neues Schema (§6).
- §4.1 `update-status --resolution` durchreichen → bereits unterstützt (`scripts/vda/ticket/update-status.sh`); FA-SF-22 (Task 1) verifiziert die done/shipped-Nutzung. Watchdog bleibt (Global Constraints).
- §4.2 Scheibe B Floor → Task 6 (Lane-Modul, S1-Auslagerung), Task 7 (factory-floor.ts Delegation + `awaitingDeployVisible`), Task 8 (FactoryFloor.svelte leer-ausblenden). `getHall()`/`getShipped()` bleiben (Batch-Sichtbarkeit via bestehender devflow-Query — unverändert, keine Regression).
- §4.3 + §5 Scheibe A DORA → Task 9 (dora-metrics.ts, alle 4 Metriken + Median/Mean + Driver-Breakdown), Task 10 (API, vereint Factory+devflow G3), Task 11 (DoraDashboard.svelte), Task 12 (dora.astro + Nav, admin-only G1/G2).
- §5 Metrik-Definitionen → Task 9-Tests (DF=Merges, Lead Time Median+Mean, CFR Proxy, MTTR `type='bug'` Median, n/a). Datenmodell-Falle (`fixes` Self-Link) respektiert: CFR nutzt `pr_events.reverted` + `type='bug'`; MTTR nutzt `type='bug'` + `fixes`-Self-Link nur als PR-Anheftung (Task 10-Query-Kommentar).
- §6 Datenmodell → keine neue Tabelle, keine destruktive Migration, keine View (in-code). Enum-Retain via FA-SF-22 (Task 1).
- §9 Testing → BATS (Task 1), Vitest (Task 6/9/10/11), Failing-Test-zuerst (Task 1). E2E (Playwright) ist in der Spec als „erweitert vorhandene specs" markiert — als Folge in `dev-flow-e2e` nach Deploy (nicht in diesem Plan-Scope, da E2E gegen Live läuft; Plan liefert die UI + grünes CI-Gate).
- §10 Rollout → push-based; Website-Änderungen rollen via `build-website*.yml`; Skript-/SKILL-/Doku-Änderungen brauchen keinen Deploy. (Kein Plan-Task nötig.)

**Out-of-scope respektiert:** keine Scheibe D, keine öffentliche DORA-Ansicht, keine destruktive Enum-Migration, keine `v_dora`-View, kein Prod-Deploy-Closure-Gate.

**S1-Budgets respektiert:** Lane-Logik → neues Modul `factory-floor-lanes.ts` (nicht inline in factory-floor.ts 580/600); DORA-Berechnung → neues `dora-metrics.ts`; factory-floor.ts gewinnt nur Re-Export/Delegation; FactoryFloor.svelte netto ~0 (`{#if}`-Wrap); AdminLayout.astro +1 Nav-Zeile (Budget ~43). Alle neuen Dateien mit Reserve unter Limit.

**Type-Konsistenz:** `ShippedItem`/`AwaitingDeployItem` einmal in `factory-floor-lanes.ts` definiert, aus `factory-floor.ts` re-exportiert (Task 6/7). `DoraMetrics`/`DoraDeliveryRow` einmal in `dora-metrics.ts` (Task 9), in API (Task 10) und Dashboard-Komponente (Task 11, inline mirror) identisch verwendet. `awaitingDeployVisible: boolean` konsistent zwischen `FloorPayload` (Task 7) und FactoryFloor.svelte (Task 8). Fenster-Werte `7d|30d|90d|all` konsistent zwischen API `resolveWindow` (Task 10) und Dashboard-Switch (Task 11).
