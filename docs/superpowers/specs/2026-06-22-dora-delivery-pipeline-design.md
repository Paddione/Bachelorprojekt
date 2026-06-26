---
ticket_id: T001092
plan_ref: openspec/changes/dora-delivery-pipeline/tasks.md
status: active
date: 2026-06-22
---

# Design: Messbare Delivery-Pipeline + DORA-Dashboard

> Software Factory → messbare Delivery-Pipeline. OpenSpec→Ticket→PR→Merge-Kette schließen,
> die entfernte Tracking-Pipeline durch ein echtes DORA-Dashboard ersetzen, und sicherstellen,
> dass von `dev-flow-execute` (skillbasiert, inkl. Batches) ausgeführte Tickets **sichtbar**
> durch die Pipeline wandern.

## 1. Kontext & Problem

Die Software Factory läuft live (systemd-Timer, `factory-tick` ~alle 5 min). Vieles für „messbare
Delivery" existiert bereits — die Lücken sind chirurgisch, nicht fundamental:

**Schon vorhanden (verifiziert):**
- `/admin/factory-floor` — Live-Pipeline mit Lanes (LoadingDock → Hall → Shipped → AwaitingDeploy → Staged), liest `tickets.factory_phase_events`. `getHall()` zeigt devflow-Tickets bereits (Slot **oder** `driver='devflow'`-Phase-Event; FA-48).
- `delivery-metrics.ts` / `/api/admin/delivery-metrics` — berechnet 3 von 4 DORA-Metriken (Deployment Frequency via throughput/week, Lead Time in 4 Teilzeiten, Change Failure Rate via mishapRate). **Aber nur für devflow-Tickets, MTTR fehlt.**
- Daten-Backbone DORA-tauglich: `tickets.ticket_activity` (Audit-Trail jeder Statusänderung), `tickets.factory_phase_events` (phase × state × driver), `tickets.pr_events` (Ersatz für `v_timeline`), Lifecycle-Timestamps (`triaged/started/done/archived_at`).

**Verifizierte Lücken:**

| # | Lücke | Evidenz |
|---|-------|---------|
| G1 | Kein konsolidiertes DORA-Dashboard | keine `/admin/dora`-Seite |
| G2 | MTTR (4. DORA-Metrik) nicht berechnet | `summarize()` ohne recovery-time |
| G3 | DORA nur für devflow, nicht Factory-Tickets | `delivery-metrics.ts` zieht nur devflow-PRs |
| G4 | devflow-Ticket verschwindet bei `qa_review` | `dev-flow-execute/SKILL.md:408` setzt `qa_review`; Floor hat keine `qa_review`-Lane |
| G5 | Post-Merge-Status inkonsistent | Factory→`awaiting_deploy` (`pipeline.js:700`) · devflow→`qa_review` (`SKILL.md:408`) |
| G6 | Quality-Gate-Ergebnisse nicht als Ticket-Metrik erfasst | plan-lint/CI schreiben kein DB-Event |
| G7 | scout-quality / scout-drift / plan-drift berechnet, aber kein CI-Gate | bats berechnet Distanz, blockiert nie |

## 2. Goals / Non-Goals

**Goals:**
1. **Vereinheitlichtes „Merge = Abschluss"-Lifecycle** für Factory + dev-flow-execute (inkl. Batches): Ticket wandert `plan→implement→verify→deploy`, und bei grünem Auto-Merge nach CI wird es **direkt geschlossen** (`done · resolution=shipped`). (Schließt G4, G5)
2. **Quality-Gate-Ergebnisse als Ticket-Events** erfassen, damit die Kette messbar ist. (Schließt G6)
3. **Konsolidiertes DORA-Dashboard** `/admin/dora` mit allen 4 kanonischen Metriken inkl. neu berechnetem MTTR, vereint über Factory + devflow. (Schließt G1, G2, G3)
4. **Pipeline-Sichtbarkeit bis „Shipped"** für beide Driver inkl. Batches — keine Tickets, die mittendrin „abreißen". (Schließt G4)

**Non-Goals (bewusst aufgeschoben):**
- **Scheibe D** (scout-quality/drift/plan-drift als fail-closed CI-Gates) — eigenes Folge-Ticket (Risiko: kann Factory-Durchsatz bremsen).
- Öffentliche Read-only-DORA-Ansicht (Bachelorarbeit-Demo) — optionales Folge-Ticket; erste Lieferung ist **admin-only**.
- Echte Prod-Deploy-Frequenz als Closure-Gate. Prod-Deploy bleibt **entkoppelt** („wir deployen wann wir wollen", push-based).
- Destruktive DB-Migration (Enum-Werte `awaiting_deploy`/`qa_review` werden **nicht** gelöscht — siehe §6).

## 3. Das vereinheitlichte Lifecycle-Modell („Merge = Abschluss")

```
plan_staged
   │  (Factory schedule ODER dev-flow-execute Schritt 1.5)
   ▼
in_progress ── phase-events: plan → implement → verify → deploy  (driver = factory | devflow)
   │
   ├── PR geöffnet + Auto-Merge aktiviert (gh pr merge --squash --auto)
   │
   ▼
[ CI grün? ]──nein──▶ zurück nach in_progress (Build-Loop / Self-Heal)
   │ ja → Auto-Merge nach main
   ▼
done · resolution = shipped     ← Ticket geschlossen IM SELBEN Schritt wie der Merge
   ┆
   ┆ (Prod-Deploy entkoppelt, push-based, ändert den Ticket-Status NICHT)
```

**Retired aus dem Happy-Path:** `awaiting_deploy`, `qa_review` werden nicht mehr als Ruhestände
geschrieben. Enum-Werte bleiben gültig (Backward-Compat für historische Zeilen + manuelle Sonderfälle).

**Trade-off (bewusst akzeptiert):** Keine separate „gemergt-aber-noch-nicht-live"-Sicht mehr.
Closure trackt **Merge**, nicht Prod-Live. Begründung: Trunk-based, Merge ist deploy-fähig; Deploy
ist ohnehin entkoppelt und manuell. CLAUDE.md (`awaiting_deploy`-Doku, „merge ≠ prod"-Lane) wird im
selben Change angepasst.

## 4. Architektur — drei gekoppelte Scheiben, Build-Reihenfolge C → B → A

Die Scheiben sind **nicht** unabhängig: C ist das Fundament (Status-Modell), B (Floor) und A
(Dashboard) hängen daran. Eine Spec, ein Plan, gestufte Tasks.

```
Scheibe C (Fundament)          Scheibe B (Sichtbarkeit)        Scheibe A (Messung)
─────────────────────          ─────────────────────────       ──────────────────────
transition.ts (merge=done)  →  factory-floor.ts Lanes      →   /api/admin/dora-metrics
pipeline.js (status)           (Shipped=done, kein limbo)       dora-metrics.ts (4 Metriken)
dev-flow-execute SKILL                                          /admin/dora + DoraDashboard.svelte
gate-outcome events            FactoryFloor-Lanes-Update        MTTR-Berechnung
CLAUDE.md docs
```

### 4.1 Scheibe C — Vereinheitlichter Abschluss + Gate-Events

**Komponenten & Verantwortung:**

- **`scripts/factory/pipeline.js`** (Factory Deploy-Phase): Ersetze die `awaiting_deploy`/`qa_review`-Übergänge
  durch einen einzigen Abschluss-Übergang. Nach bestätigtem Auto-Merge (PR `merged`):
  `ticket.sh update-status --status done --resolution shipped --pr <n>` + `phase deploy done`.
  Entferne die `awaiting_deploy`-Schreibstelle (`pipeline.js:700`) und `qa_review` (`:647`).
- **`.claude/skills/dev-flow-execute/SKILL.md`** (Schritt 6.5): Ersetze `--status qa_review` (`:408`)
  durch `--status done --resolution shipped`. Behalte die `phase deploy done`-Emission. AUSSTIEG-Text
  („Ticket `qa_review`") auf „Ticket `done/shipped`" aktualisieren.
- **`scripts/ticket.sh` (`update-status`)**: muss `--resolution` durchreichen, damit `done` mit
  `resolution=shipped` in einem Aufruf gesetzt wird (Constraint `resolution_only_when_closed`). Falls
  bereits unterstützt: nur verifizieren; sonst ergänzen.
- **Gate-Outcome-Events (G6):** Quality-Gate-Ergebnisse als Phase-/Audit-Event persistieren. Wir
  **wiederverwenden `factory_phase_events`** mit `phase='verify'` und `state ∈ {done, blocked}` plus
  strukturiertem `detail` (z. B. `gate=plan-lint result=pass` / `gate=ci result=fail step=freshness`).
  Quelle: `scripts/plan-lint.sh` (plan-time) und der CI-/Build-Loop in `pipeline.js`/`dev-flow-execute`
  schreiben je ein `verify`-Event mit Gate-Resultat. Kein neues Schema nötig.
- **`CLAUDE.md`**: Abschnitt „awaiting_deploy status" + „merge ≠ prod"-Erwähnungen auf das neue Modell
  umschreiben; Staging-Doku-Referenzen prüfen.

**Watchdog-Anpassung:** `scripts/factory/watchdog.sh` eskaliert aktuell `awaiting_deploy > 24h`.
Da der Happy-Path diesen Stand nicht mehr erzeugt, bleibt die Eskalation als Sicherheitsnetz für
manuell gesetzte Sonderfälle bestehen (no-op im Normalbetrieb) — nicht entfernen.

### 4.2 Scheibe B — Floor zeigt die volle Reise bis „Shipped"

**`website/src/lib/factory-floor.ts` + `FactoryFloor`-Komponente:**

- `getShipped()` (Lane „Shipped") = `status='done'` — bleibt, ist jetzt das **einheitliche** Pipeline-Ende
  für beide Driver. Verifizieren, dass devflow-Tickets (geschlossen via §4.1) hier auftauchen
  (PR-Nummer aus `ticket_links kind='pr'|'fixes'` ableiten).
- `getAwaitingDeploy()` Lane: da der Happy-Path `awaiting_deploy` nicht mehr erzeugt, wird die Lane
  **leer im Normalbetrieb**. Option (zu entscheiden im Plan): Lane ausblenden wenn leer, ODER in eine
  optionale „Manuell zurückgehalten"-Lane umbenennen. Default: **ausblenden wenn leer**, additiv,
  kein Bruch.
- `getHall()`: bleibt — zeigt `in_progress` mit `phaseProgress[]` für Factory **und** devflow (Slot oder
  `driver='devflow'`). **Batch-Sichtbarkeit:** ein dev-flow-execute-Batch verarbeitet mehrere Tickets;
  jedes setzt `in_progress` + emittiert eigene `driver='devflow'`-Phase-Events → alle erscheinen parallel
  im Hall. Verifizieren, dass die `getHall()`-Query mehrere gleichzeitige devflow-Tickets korrekt listet
  (kein Slot-Limit für devflow, da Slot NULL).
- **Phase-Progress bis „Shipped":** Der Hall-Eintrag zeigt `plan→implement→verify→deploy`. Beim
  Abschluss (status→done) wandert die Karte in die Shipped-Lane. Damit ist die Reise lückenlos sichtbar.

### 4.3 Scheibe A — Konsolidiertes DORA-Dashboard

**Neue Dateien:**
- `website/src/lib/dora-metrics.ts` — reine Berechnungs-/Query-Funktionen (testbar, keine Astro-Abhängigkeit).
- `website/src/pages/api/admin/dora-metrics.ts` — `GET ?window=7d|30d|90d|all` (+ optional `brand`), `isAdmin`-Gate.
- `website/src/pages/admin/dora.astro` — SSR-Seite, `getSession`/`isAdmin`-Redirect.
- `website/src/components/admin/DoraDashboard.svelte` — Darstellung (4 Metrik-Karten + Trend + Drill-down).

**Wiederverwendung:** `delivery-metrics.ts` (`calcDurationH`, `summarize`, `modelMixPercent`) wird
verallgemeinert ODER `dora-metrics.ts` nutzt dieselben Helfer. `summarize()` bekommt MTTR-Felder.

**Vereinheitlichung Factory + devflow (G3):** Die zugrundeliegende Query zieht **alle** geschlossenen
Tickets (`status='done'`, beliebiger Driver) + ihre PR-Verknüpfung aus `ticket_links` + `pr_events`,
nicht nur devflow. Ein `driver`-Breakdown (factory vs. devflow) wird zusätzlich ausgewiesen.

## 5. DORA-Metrik-Definitionen (präzise)

| Metrik | Definition in diesem System | Quelle |
|--------|------------------------------|--------|
| **Deployment Frequency** | Merges-nach-`main` pro Zeitfenster (Tickets `done` mit verknüpftem gemergten PR). Label im UI explizit: „Deployment Frequency = Merges nach main". | `tickets` (done) + `ticket_links kind='pr'`/`pr_events.merged_at` |
| **Lead Time for Changes** | `merged_at − ticket.created_at` (Median **und** Mittel). Sub-Zeiten (`created→pr_open`, `pr_open→merged`) als Drill-down erhalten. | `ticket_activity` / `pr_events` |
| **Change Failure Rate** | `(# revertierte Merges + # Bug-Tickets im Fenster) / # Merges im Fenster`. Ehrlich als **Proxy** deklariert: das Datenmodell verknüpft einen Bug nicht automatisch mit dem auslösenden Merge, daher Revert-Rate + Bug-Incidence statt exakter Blame-Zuordnung. | `pr_events.status='reverted'` + `tickets type='bug'` (created im Fenster) + Merges |
| **MTTR** | **`type='bug'`-Tickets: `merged_at`(des schließenden PR) − `created_at`** (Median). Der schließende PR wird über den beim Abschluss erzeugten `fixes`-Self-Link gefunden (`ticket_links from_id=to_id`, `pr_number`). „n/a" wenn keine geschlossenen Bugs im Fenster. | `tickets type='bug'` + `ticket_links` (Self-Link `pr_number`) + `pr_events.merged_at` |

**⚠ Datenmodell-Falle (für den Plan):** `ticket_links kind='fixes'` ist ein **Self-Link** (`from_id=to_id`),
den `transition.ts` bei JEDEM Abschluss mit PR anlegt — es ist die PR-Anheftung, **kein** „behebt-Bug"-Signal.
Failure-Signale daher ausschließlich über `type='bug'` (MTTR) bzw. `pr_events.status='reverted'` (CFR), nicht über die `fixes`-Link-Existenz.

**Zusätzlich (nicht-gatende Kontextspalten):** optionaler echter Deploy-Zeitstempel
(`merged→live` aus build-*.yml Actions, wie heute in `delivery-metrics`), Model-Mix (claude/deepseek %).

**Median vs. Mittel:** DORA-Lead-Time/MTTR werden als **Median** ausgewiesen (robuster gegen Ausreißer),
Mittelwert als Sekundärangabe. (Heutiges `avg()` ergänzen um Median.)

## 6. Datenmodell-Änderungen

**Minimal — primär Wiederverwendung.**

- **Keine** neue Tabelle: Gate-Events nutzen `factory_phase_events` (`phase='verify'`, strukturiertes `detail`).
- **Keine** destruktive Migration: `awaiting_deploy`/`qa_review` bleiben im `CHECK`-Constraint
  (`tickets-db.ts:169-171`) und im TS-Enum (`transition.ts:7-14`) — historische Zeilen + Watchdog-Sicherheitsnetz.
- **Evtl. neue View** `tickets.v_dora` (optional, im Plan zu entscheiden): kapselt die DORA-Aggregation
  serverseitig, analog zu `v_factory_metrics`. Alternativ vollständig in `dora-metrics.ts`. Default:
  **Berechnung in `dora-metrics.ts`** (testbar mit Vitest, kein DB-Migrations-Overhead), View nur falls
  Performance es verlangt.

## 7. Quality-Gates in der Kette (Übersicht)

| Phase | Gate | bleibt/neu | Event |
|-------|------|-----------|-------|
| plan-time | `plan-lint.sh` (F1/F2/STRUCT/P1) | bleibt (hard) | neu: `verify`-Event `gate=plan-lint result=…` |
| PR-time | CI (`task test:changed`, freshness/S1, Security, Vitest, Conventional Commits) | bleibt | neu: `verify`-Event `gate=ci result=…` |
| merge | Auto-Merge nach grüner CI → `done/shipped` | neu (vereinheitlicht) | `phase deploy done` + status-change |
| post-merge | Prod-Deploy (push-based, entkoppelt) | bleibt | — (kein Status-Effekt) |

(Scheibe D — scout-quality/drift/plan-drift als fail-closed Gates — **nicht** in diesem Change.)

## 8. Fehlerbehandlung

- **CI rot:** kein Auto-Merge → Ticket bleibt `in_progress`, Build-Loop/Self-Heal greift (bestehend).
  Kein Übergang nach `done`. Watchdog eskaliert `in_progress > 30 min` (bestehend).
- **Auto-Merge bestätigt, aber Statuswechsel scheitert:** `update-status` ist idempotent; Retry im
  selben Step. Phase-Event `deploy done` ist fire-and-forget (`|| true`), blockiert nie den Merge.
- **DORA-Query ohne Daten im Fenster:** Metriken liefern `null`/„n/a", Dashboard rendert leere States
  statt zu crashen. MTTR ohne Fix-Links = „n/a".
- **Mixed-Driver-Tickets:** ein Ticket mit beiden Treibern (selten) wird einmal gezählt (distinct ticket_id).

## 9. Testing-Strategie

- **BATS** (`tests/spec/software-factory.bats`): neue `@test`s für (a) `update-status --status done --resolution shipped`
  setzt Status+Resolution atomar, (b) kein `awaiting_deploy`/`qa_review` im Happy-Path-Pfad von pipeline.js
  (grep-Assertion auf die Skript-Logik / dry-run), (c) Gate-Outcome-Event-Format.
- **Vitest** (`website`): `dora-metrics.ts` — Deployment Frequency, Lead Time (Median+Mittel), CFR, MTTR
  mit Fixture-Daten inkl. Leerfenster/`n/a`-Fällen; Factory+devflow-Vereinigung; Driver-Breakdown.
- **Playwright** (E2E): `/admin/dora` rendert die 4 Metrik-Karten (admin-authentifiziert); Floor zeigt ein
  devflow-Ticket bis Shipped (erweitert vorhandene `fa-48-factory-devflow.spec.ts` / `fa-factory-floor.spec.ts`).
- **Failing-Test-zuerst** für den Lifecycle-Kernpunkt (merge=done) gemäß TDD.
- `task test:inventory` nach Test-Änderungen regenerieren + committen.

## 10. Rollout

- Push-based, kein GitOps. Website-Änderungen rollen via `build-website*.yml` automatisch aus; Skript-/SKILL-/
  Doku-Änderungen brauchen keinen Deploy.
- **Staging zuerst** (`ENV=staging`, ns `workspace-staging`) für den Lifecycle-Wechsel verifizierbar, bevor
  beide Prod-Brands betroffen sind. Schema bleibt unverändert → kein Migrations-Risiko.

## 11. Erfasste Entscheidungen (Brainstorming)

- **Q1 Scope:** A + B + C (volle Kette), gestuft C→B→A. D aufgeschoben.
- **Q2 Audience:** Admin-only (erste Lieferung). Öffentliche Read-only-Ansicht = Folge-Ticket.
- **Q3 MTTR:** `type='bug'`-Tickets, `merged_at`(Abschluss-PR) − `created_at` (Median). Abschluss-PR via Self-Link; **nicht** über `fixes`-Link-Semantik (siehe §5-Falle). „n/a" bei fehlenden Daten.
- **Q4/Q5 Lifecycle:** `qa_review`+`awaiting_deploy` aus Happy-Path retiren, Merge=Abschluss, einheitlich für
  Factory + dev-flow-execute + Batches. Enum-Werte **nicht-destruktiv** behalten; CLAUDE.md anpassen.

## 12. Offene Punkte / Folge-Tickets

- Scheibe D (CI-Gates für scout-quality/drift/plan-drift).
- Öffentliche DORA-Read-only-Ansicht (Bachelorarbeit-Demo).
- Optionaler Revert-basierter MTTR-Proxy zusätzlich zum Fix-Link-MTTR.
- Entscheidung View vs. in-code-Berechnung final im Plan (Default: in-code).
