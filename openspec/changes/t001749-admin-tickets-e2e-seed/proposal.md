---
title: "t001749-admin-tickets-e2e-seed — DB-Level E2E Seed Helper"
ticket_id: T001749
domains: [e2e, tests, database]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Proposal: t001749-admin-tickets-e2e-seed

## Purpose

`tests/e2e/specs/fa-admin-tickets.spec.ts` rief bisher zur Laufzeit
`createTestBugReport()` auf, das die Bug-Report-Schnittstelle
(`POST /api/bug-report`) mit dem Cron-Secret-Header benutzte. Das hat drei
konkrete Klassen von Folgen:

1. **Prod-Tracker-Verschmutzung** — wenn `X-Cron-Secret` aus dem CI-Set
   herausgesickert ist oder die Markierung an der Server-Seite verloren
   ging, landete der Test-Ticket im echten Tracker.
2. **Race-Conditions / Rate-Limit** — der Bug-Report-Endpoint ist auf
   10 req/min/IP limitiert; in PR-Wellen mit mehreren parallelen
   `fa-admin-tickets`-Runs kam es zu 429s und Folgefehlern.
3. **Schema-Drift** — neue Spalten wie `is_test_data` (T000862) oder der
   Wechsel `BR-*` → `T*` für `external_id` mussten am Endpoint und am
   Test synchron gepflegt werden.

Der Plan ersetzt den Runtime-POST durch einen direkten DB-Insert in
`tickets.tickets` mit explizitem `is_test_data=true`-Marker und einem
`try { … } finally { cleanupSeedTicket(uuid) }` im Test, sodass
flakey Runs keine `is_test_data=true`-Tickets im Schema hinterlassen.

## Why

- **T000862** hat `is_test_data` und den Server-Side-Purge
  (`tickets.fn_purge_test_data()`) eingeführt — der Mechanismus ist
  bereits da, nur die E2E-Tests nutzen ihn nicht.
- **T001754** ist der direkte Vorfall, der das Problem sichtbar gemacht
  hat: ein `createTestBugReport`-Run ist im Production-Tracker gelandet
  und musste manuell aufgeräumt werden. Der Fix in T001749 ist die
  strukturelle Remediation, die T001754 ersetzt.
- Der bisherige Pfad durch `POST /api/bug-report` ist weiterhin nötig
  (für die manuell-on-the-road Smoke-Tests), aber für **CI** ist er
  falsch — der Test sollte die DB nicht über einen HTTP-Pfad
  verschmutzen, wenn er einen direkten Insert machen kann.

## What

Neues Helper-Modul `tests/e2e/lib/e2e-seed.ts` neben dem bestehenden
`e2e-marker.ts`. Vier Public-Funktionen:

- `seedAvailable()` — `true` gdw. `CRON_SECRET` UND
  `SESSIONS_DATABASE_URL` gesetzt sind (Prod-Pollution-Wächter +
  DB-URL). Spiegelt 1:1 `markerAvailable()` aus `e2e-marker.ts`.
- `seedAdminTicket({ testId, status?, description?, url?, reporterEmail?, isTestData? })`
  — direkter `INSERT INTO tickets.tickets (type='bug', brand, title, …) RETURNING id, external_id`,
  stempelt `is_test_data=true`. Liefert `{ id, externalId, reporterEmail }`.
- `seedTicketComment({ ticketId, authorLabel, body, visibility?, kind? })`
  — `INSERT INTO tickets.ticket_comments` für Timeline-Fixture-Szenarien.
- `cleanupSeedTicket(id)` und `cleanupSeedTickets(ids[])` — hartes
  `DELETE` mit `is_test_data=true`-Guard, CASCADE wischt
  `ticket_comments` / `ticket_activity` / `ticket_links` mit.

`tests/e2e/specs/fa-admin-tickets.spec.ts` wird refaktoriert:

- Imports `createTestBugReport` und `markerAvailable` raus, dafür
  `seedAdminTicket`, `cleanupSeedTicket`, `seedAvailable` rein.
- Skip-Bedingung: `test.skip(!seedAvailable(), 'CRON_SECRET oder SESSIONS_DATABASE_URL fehlt — DB-Seed würde Prod-Tracker verschmutzen oder scheitern')`
  plus das bestehende `test.skip(!ADMIN_PASS, …)`.
- Body in `try { … } finally { await cleanupSeedTicket(ticketUuid) }`
  eingewickelt, damit selbst bei Assertion-Fail kein
  `is_test_data=true`-Datensatz liegen bleibt.

Die Implementation lebt bereits auf `main` (Commit `ac44039f0`,
gemerged als Teil des T001748-Hydration-Fix). Dieser Plan
**dokumentiert** das Vorgehen als formales OpenSpec-Change, damit
spätere `archive`-Läufe und `git blame` auf eine kanonische Spec
zurückgreifen können.

## Why now

T001754 wartet im Status `plan_staged` mit der Empfehlung, es nach
T001749 als `fixed_by T001749` zu schließen. Solange T001749 keinen
formalen Plan hat, kann T001754 nicht abgeschlossen werden und das
Pair bleibt im Cockpit hängen.

## Non-Goals

- **CI-Workflow-Verdrahtung von `SESSIONS_DATABASE_URL`** — separates
  Follow-up. Aktuell ist `CRON_SECRET` im `e2e-pr.yml` gesetzt,
  `SESSIONS_DATABASE_URL` nicht. Der Test skippt also in CI, bis das
  ergänzt ist; das ist gewollt (kein Test ohne das Wächter-Paar).
- **T001738 (db-backup CronJob)**, **T000862 (Schema-Spalten)** — die
  Tickets, die die Voraussetzungen liefern, sind bereits geschlossen.
- **Generalisierung des Patterns** — `e2e-seed.ts` ist eng auf
  `tickets.tickets` zugeschnitten. Andere Test-Domänen (Fragebogen,
  CRM) folgen etablierten eigenen Mustern (`fa-fragebogen.spec.ts`
  z.B. nutzt schon ein direktes `pg.Pool`); eine Vereinheitlichung
  wäre verfrüht.
- **Bug-Report-Endpoint ändern** — der Runtime-POST bleibt
  unangetastet; nur die E2E-Tests umgehen ihn.

_Ticket: T001749 · verwandt: T001754 (Prod-Pollution-Vorfall), T000862 (`is_test_data`-Schema), T001748 (Hydration-Fix, unter dessen Dach das Code-Diff bereits auf `main` gemerged wurde)._
