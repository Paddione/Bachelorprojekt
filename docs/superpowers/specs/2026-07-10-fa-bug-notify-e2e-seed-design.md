---
title: fa-bug-notify-e2e-seed — Root-Cause & Fix Design
ticket_id: T001754
plan_ref: openspec/changes/fa-bug-notify-e2e-seed/tasks.md
---

# fa-bug-notify-e2e-seed — Root-Cause-Analyse & Fix-Design

## Root-Cause

`tests/e2e/specs/fa-bugs-notifications.spec.ts` (FA-bug-notify, Teil des nightly
`e2e.yml`-Laufs gegen **beide Brands** auf `fleet`) seedet sein Test-Ticket über
`createTestBugReport()` (`tests/e2e/lib/e2e-marker.ts`), das öffentlich
`POST /api/bug-report` aufruft. Dieser Pfad:

1. ist fragil (Rate-Limit, `X-Cron-Secret`-Gate, `BR-`→`T`-External-ID-Migration),
2. hat **kein sofortiges Cleanup** — das Ticket bleibt bis zum nächsten
   Purge-Sweep-Bracket (`tickets.fn_purge_test_data()` /
   `admin/systemtest/cleanup-fixtures.ts`) live in der DB,
3. verwendet einen fix verdrahteten, nichtssagenden Titel
   (`"E2E notification test — Playwright FA-bug-notify"`), der bei jedem
   nächtlichen Lauf identisch neu entsteht.

**Symptom, das den User störte:** Im Zeitfenster zwischen Ticket-Erzeugung und
Purge-Sweep ist das Ticket ein normal aussehendes, aktionables Ticket im
`triage`-Status — genau das ist bei T001751 passiert (von einer Session
entdeckt und fälschlich als echtes Feature/Bug-Ticket behandelt, bevor der
Purge-Sweep es entfernte). T001751/T001752 (45s auseinander) sind zwei
unabhängige nightly Brand-Runs derselben Test-Suite, keine Agenten- oder
Dedupe-Guard-Fehlfunktion.

**Warum die frühere Behebung (T001210, Title-Dedupe-Guard in
`dev-flow-chore-ticket-ops-mishaps`) das Problem nicht löste:** Sie
bekämpft das Symptom (mehrere Tickets mit identischem Titel) auf
Agenten-Ebene, verhindert aber nicht, dass E2E-Fixture-Daten überhaupt erst
im echten, aktionablen Triage-Queue sichtbar werden.

## Bereits etabliertes Korrekt-Muster (Referenz)

Das Schwester-Test-File `tests/e2e/specs/fa-fragebogen.spec.ts` (T000703) und
ein zweiter, noch nicht gemergter Fix (uncommitted WIP für
`fa-admin-tickets.spec.ts`, T001749, gefunden während der Untersuchung —
nicht Teil dieses Change, da eine andere Session daran aktiv arbeitet)
zeigen das Ziel-Muster: direktes `INSERT` via `pg.Pool` (`SESSIONS_DATABASE_URL`)
mit `is_test_data = true`, plus ein `afterEach`, das die Zeile sofort wieder
löscht. Der serverseitige Purge-Sweep bleibt nur noch Backstop (Crash-Fall),
nicht der primäre Cleanup-Mechanismus.

## Fix-Ansatz für FA-bug-notify (dieses Ticket)

`fa-bugs-notifications.spec.ts` bekommt denselben Direct-DB-Seed +
`afterEach`-Cleanup, **eigenständig implementiert** (kein Import aus dem noch
nicht committeten `e2e-seed.ts` einer parallelen Session — Kopplung an
unfertigen fremden Code vermeiden):

1. Ticket wird per direktem `INSERT INTO tickets.tickets (...) is_test_data=true`
   erzeugt statt per `POST /api/bug-report`.
2. `afterEach` löscht die Zeile per `external_id` sofort nach Testende
   (Erfolg wie Fehlschlag — `test.afterEach` läuft immer).
3. Gate bleibt `CRON_SECRET`- und jetzt zusätzlich `SESSIONS_DATABASE_URL`-
   abhängig (`test.skip`), analog zum bereits etablierten `fa-fragebogen.spec.ts`-
   Muster — kein neuer Kopplungspunkt zu parallelen WIP-Dateien.
4. Der Resolve-Flow (Admin-Login → `/api/admin/bugs/resolve` → Mailpit) bleibt
   inhaltlich unverändert; nur der Seed-/Cleanup-Teil wird ausgetauscht.

## Edge Cases

- Testlauf schlägt **vor** dem Resolve-Schritt fehl → `afterEach` muss die
  Zeile trotzdem löschen (kein verwaistes Ticket).
- `SESSIONS_DATABASE_URL` fehlt (z. B. Kontributor-PR ohne Prod-Secrets) →
  Test skippt sauber, wie bisher.
- Zwei Brand-Runs parallel (mentolder + korczewski) dürfen sich nicht
  gegenseitig löschen — Cleanup filtert strikt auf die im Testlauf erzeugte
  `external_id`, nicht auf Titel-Pattern.

## Betroffene Dateien

- `tests/e2e/specs/fa-bugs-notifications.spec.ts` (Seed-/Cleanup-Austausch)
- `tests/spec/software-factory.bats` oder passendes Spec-File (failing Test
  für den Cleanup-Vertrag, siehe Plan)
