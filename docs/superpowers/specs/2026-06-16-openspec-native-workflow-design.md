---
ticket_id: null
plan_ref: null
status: active
date: 2026-06-16
---

# Design: OpenSpec-kompatibler nativer Spec-Workflow + `awaiting_deploy` State

**Datum:** 2026-06-16
**Status:** Entwurf (brainstorming → review-Gate)
**Domains:** factory, pm, infra
**Themen-Threads:** State-Modell + PM-Flow (1) · Software-Factory-Gaps (2). Coaching T000737 wird separat als Content-Injection behandelt (kein Code).

## Problem

Drei gekoppelte Lücken im aktuellen Projektmanagement- und Factory-Flow:

1. **Kein kumulatives Spec-SSOT.** Wir haben 211 Specs + 35 Pläne unter `docs/superpowers/`, aber jeder Plan wird nach Merge nach Postgres archiviert und ist „weg". Es existiert kein lebendes Soll-Bild des Systems, gegen das neue Changes als Delta beschrieben werden.
2. **Tote Pipeline-States.** `factory-floor.ts` definiert 10 States, aber `plan_staged`, `in_review`, `qa_review` sind in der Live-DB bei 0 Tickets — die Pipeline durchläuft ihre eigenen Zwischenstufen nicht. Gleichzeitig fehlt der teuerste State ganz: **„gemerged ≠ in Prod"**. Fleet ist push-based (kein GitOps-Reconciler), `done` wird in `pipeline.js:597` direkt nach der Deploy-Phase gesetzt, aber für alles außer Website ist Deploy ein manueller `task workspace:deploy` — der Zustand „auf main, noch nicht auf Fleet" ist unsichtbar.
3. **Factory-Input ist ad-hoc.** Der Autopilot hat kein standardisiertes, an einem festen Ort liegendes Task-Format als Eingang.

## Ziel

Ein **nativer, OpenSpec-format-kompatibler** Spec-Workflow: wir behalten Ticket-DB, Factory und die `dev-flow-*`-Skills, gewinnen aber (a) ein kumulatives Spec-SSOT, (b) den fehlenden State `awaiting_deploy`, (c) standardkonformen Factory-Input, (d) einen billigen Off-Ramp zur Upstream-OpenSpec-CLI.

**Nicht-Ziel:** Migration der 211 Alt-Specs. Die bleiben als historisches Archiv unter `docs/superpowers/`. Cutover gilt nur für neue Arbeit.

## Ansatz A — „Layout adoptieren, native Tooling"

Wir übernehmen OpenSpecs Verzeichnis, Delta-Format und Lifecycle **verbatim**, implementieren die Verben aber selbst (verdrahtet mit `ticket.sh` + Factory) statt die `openspec`-npm-CLI zu installieren. Switch-Pfad: `npm i -g openspec` läuft als Drop-in, weil die Dateien bereits konform sind.

Verworfen: **B** (Exporter/Adapter über bestehende Specs — driftet) und **C** (volle OpenSpec-Adoption — vom User verworfen).

## Architektur

### Verzeichnislayout (`openspec/` im Repo-Root, verbatim)

```
openspec/
├── project.md                       # Projekt-Konventionen (OpenSpec-Konvention)
├── specs/<capability>.md            # SSOT — eine Capability pro Datei
└── changes/
    ├── <kebab-slug>/                # aktiver Change == 1 Ticket
    │   ├── proposal.md              # WARUM + WAS (= brainstorming-Output)
    │   ├── design.md                # technischer Ansatz (optional)
    │   ├── tasks.md                 # Implementierungs-Checkliste (= writing-plans-Output, Factory-Input)
    │   └── specs/<capability>.md    # Spec-DELTA gegen das SSOT
    └── archive/<YYYY-MM-DD>-<slug>/ # nach `done` hierher; Delta ins SSOT gemerged
```

**Format-Konformität (die zwei Stellen, die Switch-Kompatibilität garantieren):**
- SSOT/Spec: `### Requirement: <Name>` (H3, „SHALL"-Stil) → `#### Scenario: <Name>` (H4) mit `- **GIVEN/WHEN/THEN/AND**`-Bullets.
- Delta: H2-Operationsheader `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements`, darunter dieselbe Requirement/Scenario-Struktur.

### Lifecycle ↔ Ticket-State-Mapping

OpenSpec kennt `proposed → active → archived`. Wir mappen das auf unser (erweitertes) 11-State-Modell:

| OpenSpec-Phase | Ticket-State | Bedeutung im `openspec/`-Layout |
|---|---|---|
| proposed | `triage` / `planning` | Change-Ordner existiert, `proposal.md` wird geschrieben |
| approved (ready) | `plan_staged` | `tasks.md` committed, implementierbar |
| queued | `backlog` | freigegeben, in Warteschlange |
| active | `in_progress` | Factory/Mensch arbeitet `tasks.md` ab |
| active | `in_review` | PR offen |
| active | `qa_review` | QA-Gate |
| active | **`awaiting_deploy`** | **NEU** — auf `main` gemerged, noch nicht auf Fleet |
| archived | `done` | auf Fleet deployed + in Prod verifiziert → triggert Archivierung + SSOT-Merge |
| — | `blocked` / `archived` | Seitenzustände |

**Kernregel:** Change-Archivierung ist an `done` gebunden, und **`done` heißt jetzt „in Prod verifiziert", nicht „gemerged"**. Beim Archivieren wird das Delta in `openspec/specs/` gemerged (ADDED/MODIFIED/REMOVED angewandt).

### Der neue State: `awaiting_deploy`

Sitzt zwischen `qa_review`/`in_review` und `done`.

- **Definition:** PR ist squash-gemerged auf `main`, aber der Change ist noch nicht via `task workspace:deploy ENV=<brand>` auf Fleet (beide Brands) ausgerollt.
- **Eintritt:** Beim Merge setzt der Post-Merge-Pfad den Ticket-Status auf `awaiting_deploy` statt `done`. In `pipeline.js` wird das `return { status: 'done', … }` (Zeile ~597) zu `awaiting_deploy`, gefolgt von einem expliziten Deploy-Schritt, der erst bei Erfolg `done` setzt.
- **Austritt → `done`:** Nach erfolgreichem `task workspace:deploy` + Smoke-Gate (oder, für Website, nach erfolgreichem `build-website*.yml`-Rollout) advanced der Status auf `done`.
- **Auto-Advance-Ausnahme Website:** Website rollt via GitHub Action automatisch aus → diese Tickets dürfen direkt `awaiting_deploy → done` nach bestätigtem Rollout. Alles andere (push-based) bleibt sichtbar in `awaiting_deploy`, bis explizit deployed — **genau das macht die „merge≠prod"-Blindstelle auf dem Cockpit sichtbar.**

**Code-Anker (alle anzufassen):**
- `website/src/lib/factory-floor.ts`: `ALL_TICKET_STATUSES` += `'awaiting_deploy'`; `STATUS_BUCKETS` += neuer Bucket `awaiting_deploy: 'awaitingDeploy'`.
- `website/src/lib/factory-floor.test.ts`: Bucket-Test erweitern.
- `website/src/components/FactoryFloor.svelte`: neue Bucket-Spalte/-Lane „Wartet auf Deploy".
- `scripts/migrations/2026-06-15-cockpit-rollup-view.sql` (neue Migration, View ersetzen): `awaiting_deploy` als eigener Zähler `awaiting_deploy_leaves` ODER in `in_progress_leaves` — Entscheidung: **eigener Zähler**, damit der Stau messbar ist.
- `scripts/factory/pipeline.js:597`: Rückgabe-Status + expliziter Deploy-Übergang.
- `scripts/factory/schedule.sh:50`: `awaiting_deploy` zählt nicht als „offen für neue Pipeline-Arbeit", aber als „deploy-pending" — Filter prüfen.

### Native Verben: `scripts/openspec.sh`

Spiegelt die `opsx`-CLI, backed von `ticket.sh`:

- `openspec propose <slug> --ticket <ext-id>` — legt `changes/<slug>/` mit Skeleton (`proposal.md`, `tasks.md`, `specs/`) an, verknüpft Ticket, setzt Status `planning`.
- `openspec apply <slug>` — markiert implementierbar (Status `plan_staged`/`backlog`); Factory/dev-flow-execute liest `tasks.md`.
- `openspec archive <slug>` — verlangt Ticket-Status `done`; wendet Delta auf `openspec/specs/` an; verschiebt Ordner nach `changes/archive/<YYYY-MM-DD>-<slug>/`.
- `openspec validate` — prüft Verzeichnisstruktur, Heading-Level-Konformität (H2-Delta / H3-Requirement / H4-Scenario), und dass jeder aktive Change-Ordner ein lebendes Ticket hat. **Fail-closed.**

`dev-flow-plan` schreibt seinen Output künftig in `changes/<slug>/proposal.md` + `tasks.md` statt nach `docs/superpowers/specs|plans`.

### Factory-Integration (Thread 2)

Der Autopilot liest `openspec/changes/<slug>/tasks.md` (Standardformat, fester Ort) als Task-Liste. Scout-/Plan-Phasen schreiben `proposal.md`/`design.md`. Damit wird der Factory-I/O standardkonform — und das `validate`-Gate schützt ihn vor malformiertem Input.

### CI-Konformitäts-Gate

`openspec validate` wird in `task test:all` aufgenommen (neue Subtask `test:openspec`). Das ist der Mechanismus, der den Switch dauerhaft billig hält: solange CI grün ist, sind die Dateien CLI-kompatibel.

## Fehlerbehandlung

- `validate` schlägt fehl (Exit≠0) bei malformiertem Delta, fehlender Ticket-Verknüpfung oder falschem Heading-Level.
- `archive` verweigert, wenn das Ticket nicht `done` ist (verhindert SSOT-Merge halbfertiger Changes).
- `awaiting_deploy` kann nicht ohne Deploy-Evidenz nach `done` springen (Übergang nur über den Deploy-Erfolgs-Pfad).

## Testing

- **BATS** (`tests/unit/openspec/`): `propose`/`apply`/`archive`/`validate` gegen Fixture-Change-Ordner; `validate` fängt manipulierte Heading-Level; `archive` verweigert bei non-done.
- **Vitest** (`factory-floor.test.ts`): neuer `awaiting_deploy`-Bucket korrekt zugeordnet.
- **SQL**: cockpit-rollup-view zählt `awaiting_deploy_leaves` (Migrations-Test/Fixture).
- **E2E** (optional, Folge-Ticket): FactoryFloor zeigt „Wartet auf Deploy"-Lane.

## Migration / Koexistenz

- Bestehende `docs/superpowers/specs` (211) + `plans` (35) bleiben unangetastet als historisches Archiv.
- Neue Arbeit ab Cutover-Datum nutzt `openspec/`.
- Ein kurzer ADR (`openspec/project.md` + Notiz in `CLAUDE.md` „Default Workflow") dokumentiert den Cutover.

## Offene Punkte (in den Plan, nicht blockierend)

- Genaue Stelle des Post-Merge-Hooks, der `awaiting_deploy` setzt (GitHub Action vs. `ticket.sh`-Aufruf im Merge-Pfad).
- Ob `feature:promote`/`workspace:deploy` den `done`-Übergang selbst schreiben oder ein separater Verifikations-Schritt.
- Slicing: A) `openspec/`-Layout + `openspec.sh` + validate + CI · B) `awaiting_deploy` State end-to-end · C) Factory-Input-Umstellung · D) dev-flow-plan-Output-Umstellung.
