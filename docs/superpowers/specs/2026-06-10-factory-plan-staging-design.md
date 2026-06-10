---
title: "Kommissionierung — Zwischenspeicher für ausführbereite Pläne"
ticket_id: null
domains: [website, db, ops, test]
status: active
pr_number: null
---

# Kommissionierung — Zwischenspeicher für ausführbereite Pläne

## Problem

`dev-flow-plan` erzeugt einen fertigen Plan, pusht die Plan-Datei sauber auf den
`feature/`-Branch, legt ein Plan-Ticket an (`--type task` → Default `status=triage`)
und **stoppt**. Dieser Zustand — *„Plan steht, Branch steht, ausführbereit, aber noch
nicht ausgeführt"* — ist heute **nirgends sichtbar**:

- Kein Bereich der Fabrikhalle (`FactoryFloor.svelte`) liest `status=triage`. `getLoadingDock`
  liest `backlog`, `getHall` liest `in_progress`/`in_review`, `getShipped` liest `done`.
- Das Ticket ist in `/admin/tickets?status=triage` von jedem rohen Bug / jeder Idee
  ununterscheidbar — kein Marker „das ist ein fertig geplanter, ausführbereiter Branch".
- Die Branch↔Plan-Verknüpfung (`FACTORY-PLAN-REF`-Kommentar) entsteht erst bei `enqueue`,
  der `ticket_plans`-Eintrag erst bei Merge (`archive-plan`).

`scripts/datamodel/workflow-map.yaml:67-84` benennt die Lücke explizit:
*„ticket_plans table archived only on merge — in-flight execution state is invisible to the DB."*

## Ziel

Eine neue, sichtbare Fabrik-Station **„Kommissionierung"** zwischen Konstruktionsbüro
(Planungsbüro, `planning`) und Laderampe (`backlog`). Jeder fertige Plan erscheint dort
ab Sekunde eins — mit `external_id`, Titel, **Branch- und Plan-Verlinkung** im Stil des
**Versands** — und wartet auf die **manuelle Freigabe** des Menschen. Erst per Knopf
wandert er in die Laderampe (Factory baut) oder wird manuell via `dev-flow-execute`
ausgeführt. Die Factory rührt einen `plan_staged`-Plan **nicht** an.

```
triage → planning(Büro) → plan_staged(KOMMISSIONIERUNG) → backlog(Laderampe)
       → in_progress(Halle) → done(Versand) → archived
```

## Architektur-Entscheidungen (vom Nutzer bestätigt)

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Status | **Neuer Status `plan_staged`** (zwischen `planning` und `backlog`) | `planning` (Planungsbüro) hat klar andere Semantik (Idee + DoR vor Planerstellung); `triage` = ungesichtet. Dedizierter Status macht „geplant, ausführbereit" eindeutig abfragbar. |
| Gate | **Rein über den Status** | Dispatcher pollt hart nur `status=backlog` → `plan_staged` ist per Konstruktion factory-unsichtbar. Kein Lock/Permission nötig. |
| UI-Ort | **Neue Spalte in der Fabrikhalle**, links vor der Laderampe | Nutzer beschrieb den Fluss fabrikörtlich („in der Laderampe in der Fabrikhalle … wie im Versand"). Die Halle ist der eine Live-Ort des Bandlaufs. |
| UI-Typ | **Read-only Spalte + 2 Aktionsknöpfe** (wie Versand/Laderampe), KEIN Editor | Nutzer sagte „wie im Versand". DoR/Editor ist Planungsbüro-Sache. YAGNI. |
| Branch/Plan-Quelle | **`FACTORY-PLAN-REF`-Kommentar**, geschrieben beim Staging | DDL-frei; derselbe Datenpfad, den der Factory-Plan-Reuse ohnehin liest. Keine neue Spalte. |
| Staging-Auslöser | **Automatisch in `dev-flow-plan`** Schritt 4.5/5 | Einziger Ort, an dem Branch+Plan-Pfad garantiert bekannt sind. Keine manuelle Nachpflege. |
| Übergang zur Ausführung | **Zwei Knöpfe pro Item**, kein Auto-Run | Spiegelt den heutigen `dev-flow-plan`-STOPP (Factory ODER manuell). Auto-enqueue wäre riskant (DeepSeek-Autopilot-Build-Qualität unverifiziert). |
| Plan-content-Persistenz | **Erst bei Merge** (`archive-plan`), wie heute | Git ist SSOT für aktive Arbeit; MB-Markdown früh in die DB zu duplizieren ist unnötig. |
| Benennung | UI-Label **„Kommissionierung"**, Status `plan_staged`, `data-testid="floor-kommissionierung"` | Nutzer-Wahl. |

## Komponenten

### 1 · Datenmodell — `website/src/lib/tickets-db.ts`

- Status-CHECK-Constraint erweitern um `'plan_staged'` zwischen `'planning'` und `'backlog'`
  (`tickets-db.ts:44-45` Typdefinition, `:161-165` `DROP CONSTRAINT IF EXISTS tickets_status_check`
  + `ADD CONSTRAINT`). **Idempotent**, exakt nach dem Muster, mit dem `planning` hinzugefügt wurde.
- TypeScript-`TicketStatus`-Union ergänzen.
- **Keine neuen Spalten.** Migration läuft beim nächsten Deploy via `ensureTicketsSchema()`-artigem
  Init; muss auf **beiden Brands** (DB `website` in `workspace` und `workspace-korczewski`) wirken.
- Audit/Lifecycle-Trigger (`fn_lifecycle_ts`, `tickets-db.ts:490-515`): `plan_staged` braucht keinen
  eigenen Timestamp (kein `staged_at` — YAGNI); prüfen, dass der Trigger bei `plan_staged` nicht crasht.

### 2 · `scripts/ticket.sh stage-plan` (neuer Befehl)

Analog zu `enqueue` (`ticket.sh:328-350`):

```
ticket.sh stage-plan --id <ext_id> --branch <branch> --plan <plan-pfad>
```

- `UPDATE tickets.tickets SET type='feature', status='plan_staged' WHERE external_id = :id`
- `INSERT INTO tickets.ticket_comments (body='FACTORY-PLAN-REF branch=<branch> plan=<pfad>', author_label='dev-flow-plan', visibility='internal')`
- **Validate-before-`_pgpod`** (FA-SF-35-Muster): fehlende Args deterministisch ohne Cluster melden.
- Dispatch-Eintrag in `ticket.sh` (`stage-plan)  cmd_stage_plan "$@" ;;`).
- `enqueue` (`ticket.sh:328-350`) muss weiterhin von `plan_staged` **und** `triage` aus funktionieren
  (idempotent: schreibt FACTORY-PLAN-REF nur falls nicht vorhanden, um Duplikate beim Staging→Enqueue zu vermeiden).

### 3 · `dev-flow-plan`-Integration — `.claude/skills/dev-flow-plan/SKILL.md`

- Schritt 4.5 (Ticket anlegen, Zeile ~133-146): nach `create` zusätzlich `ticket.sh stage-plan
  --id $TICKET_EXT_ID --branch feature/<slug> --plan docs/superpowers/plans/<date>-<slug>.md`
  aufrufen. Der `create`-Aufruf bleibt (`--type task`), `stage-plan` flippt auf `type=feature`/`plan_staged`.
- Schritt 5 (Commit/Push/STOPP, Zeile ~150-165): Hinweistext ergänzen — „Der Plan liegt jetzt in der
  **Kommissionierung** (`/dev-status`). Von dort: **→ Factory** (Knopf, = `enqueue`) oder **→ Manuell** (`dev-flow-execute`)."

### 4 · DAL — `website/src/lib/factory-floor.ts`

- Neues Interface `StagedItem { extId: string; title: string; priority: string; branch: string | null; planPath: string | null; createdAt: string | null }` (analog `ShippedItem`, `:29`).
- `getStaged(limit = 12)`: `SELECT external_id, title, priority, created_at FROM tickets.tickets
  WHERE type='feature' AND status='plan_staged'`, `LEFT JOIN DISTINCT ON (ticket_id)` auf
  `ticket_comments WHERE body LIKE 'FACTORY-PLAN-REF%'` (jüngster), Branch/Plan via Regex/`split`
  aus `body` parsen. `ORDER BY` Prioritäts-Rang + `created_at`. (Vorbild: `getShipped()` `:141-166`.)
- `FloorPayload`-Interface (`:28-35`) um `staged: StagedItem[]` + `stagedWaiting: number` erweitern.
- `getFloor()` (`:166-175`): `getStaged()` als weiteres Glied im `Promise.all`, `stagedWaiting` zählen.

### 5 · UI — `website/src/components/FactoryFloor.svelte`

- Neue Spalte **„Kommissionierung"** als erste (linkeste) Zone. Layout: aus `1/5 + 3/5 + 1/5`
  wird `1/5(Komm.) + 1/5(Laderampe) + 2/5…3/5(Halle) + 1/5(Versand)` (Halle schrumpft leicht;
  responsives Stacking auf schmal). `data-testid="floor-kommissionierung"`.
- Kachel im **Versand-Stil** (`:199-225`): `external_id` gold/monospace → `ticketUrl(extId)` =
  `/admin/tickets?q=…` (`:81`); Titel klickbar → `openDetail()` (`:40-46`); **Branch-Badge** (statt
  PR-Badge `:213-219`) → `https://github.com/Paddione/Bachelorprojekt/blob/<branch>/<planPath>`
  (target=_blank); `relTime(createdAt)` (`:84-93`); `prioDot()`.
- Zwei Knöpfe pro Kachel:
  - **„→ Factory"**: `POST /api/factory-floor/{extId}/release` → Item verschwindet aus Kommissionierung,
    erscheint in der Laderampe (nächster 4s-Poll oder optimistisches Re-Fetch).
  - **„→ Manuell"**: öffnet einen kleinen Hinweis/Tooltip („Lokal `dev-flow-execute` auf
    `feature/<branch>` aufrufen") — **kein** serverseitiger Run.
- Leitstand-Kachel **„Kommissionierung"** mit `{data.stagedWaiting ?? 0}` (Muster der „Büro"-Kachel
  `:139`), verlinkt auf einen Anker/Scroll zur Spalte. `data-testid="floor-komm-count"`.

### 6 · API — `website/src/pages/api/factory-floor/[extId]/release.ts`

- `POST`, `isAdmin`-gated (Muster: `api/planning-office/[extId]/promote.ts`).
- Ruft `ticket.sh enqueue --id <extId> --branch <branch> --plan <plan>` (Branch/Plan aus dem
  vorhandenen FACTORY-PLAN-REF; enqueue ist idempotent) → `status=backlog`.
- Antwort `{ ok: true }` bzw. `401`/`409`. Implementiert als DB-Update über die DAL (kein Shell-Out
  aus der Web-App, falls `ticket.sh` serverseitig nicht verfügbar — dann äquivalentes
  `UPDATE … SET status='backlog'` in `factory-floor.ts`/`tickets-db.ts`). **Designentscheidung im Plan
  klären:** Shell-Out vs. direkte DAL — Default: direkte DAL-Funktion `releaseToBacklog(extId)`.

### 7 · `/admin/tickets`-Quick-Filter (optional, klein)

- `admin/tickets.astro` (`:17-41`, `:80-86`) liest `sp.get('status')`. Einen Filter-Chip
  „Kommissionierung" (`?status=plan_staged`) ergänzen, damit der `extId`-Link aus der Floor-Kachel
  einen sinnvollen Kontext-Filter hat. (Niedrige Prio; im Plan als eigener Task.)

## Tests

- **vitest** (`website/src/lib/factory-floor.test.ts`, Vorbild `:81-85`): `getStaged()` liest nur
  `plan_staged`; FACTORY-PLAN-REF-Parsing (branch/plan, fehlend → null); `releaseToBacklog()`
  Übergang `plan_staged → backlog`. pg-mem.
- **BATS** (`tests/unit/*stage-plan*.bats`): `ticket.sh stage-plan` Arg-Validierung **offline-safe**
  (validate-before-`_pgpod`), in `task test:all`/`test:factory` verdrahtet (Coverage-Guard).
- **Playwright** (`tests/e2e/specs/fa-kommissionierung.spec.ts`, Vorbild `fa-planning-office.spec.ts`):
  Kommissionierung-Spalte rendert, `data-testid`-Marker, „→ Factory"-Knopf verschiebt Item in die
  Laderampe. **Playwright-Projekt-Gate** im Plan zuordnen (admin/dev-status-Projekt).
- **Enum-Migration** idempotent (zweimaliges Init bricht nicht).
- `test-inventory.json` nach Teständerungen regenerieren (CI-Gate).

## Edge Cases & Konsistenz

- `enqueue` von `plan_staged` UND `triage` aus (rückwärtskompatibel); FACTORY-PLAN-REF nicht doppelt schreiben.
- Kein Code-Pfad darf `plan_staged` fälschlich als aktiv/done behandeln — alle `status`-`CASE`/`WHERE`
  in `factory-floor.ts` und `tickets-db.ts` prüfen (`v_factory_metrics` `:592-603` zählt nur `done` → ok).
- Beide Brands: Enum-Migration + Deploy auf `workspace` **und** `workspace-korczewski`.
- Dispatcher (`scripts/factory/dispatcher.js`) bleibt unverändert (pollt nur `backlog`) → Gate gilt automatisch.
- `officeCount()`/`stagedWaiting` dürfen sich nicht überschneiden (`planning` vs. `plan_staged` disjunkt).

## Bewusst NICHT im Scope (YAGNI)

- Kein DoR/readiness/Editor in der Kommissionierung (read-only + 2 Aktionen).
- Keine frühe `ticket_plans`-content-Persistenz beim Staging.
- Kein Auto-enqueue / keine autonome Ausführung aus der Web-App.
- Kein `staged_at`-Timestamp (created_at genügt).

## Offene Detail-Punkte (im Plan zu entscheiden)

1. Release-Mechanik: direkte DAL-Funktion `releaseToBacklog()` (Default) vs. `ticket.sh enqueue`-Shell-Out.
2. Exakte Spaltenbreiten/Responsive-Verhalten bei 4 Zonen (Mockup im Plan finalisieren).
