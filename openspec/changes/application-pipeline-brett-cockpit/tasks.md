---
title: "application-pipeline-brett-cockpit — Implementation Plan (Phase 4: Cockpit Kanban)"
ticket_id: T900233
domains: [website, brett]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T900228
depends_on_plans: [application-pipeline]
---

# application-pipeline-brett-cockpit — Implementation Plan

_Ticket: T900233_

**Voraussetzung:** Phase 1 (T900228) muss gemergt sein — dieser Plan liest/schreibt
`applications.jobs`/`applications.dossiers`/`applications.timeline`, die dort angelegt werden.
Unabhängig von Phase 2 (Matching) und Phase 3 (Typst-Dossiers).

Scope: Requirement "Internal Cross-Service API for Application Pipeline Data" aus
`openspec/changes/application-pipeline-brett-cockpit/specs/application-pipeline.md`, plus die
Brett-seitige Umsetzung der bereits in Phase 1 gespecten Kanban-/Timeline-Szenarien
("Application Funnel and Audit Trail in Brett Cockpit").

**Architektur-Entscheidung (Prior-Art, T002829):** Brett läuft als eigener Service mit eigener DB
(`components/brett/src/server/db.ts`, `DATABASE_URL`) — direkte Cross-Database-Query auf die
`website`-DB ist nicht vorgesehen. Präzedenzfall im Repo:
`components/website/src/pages/api/internal/tickets/notify-close.ts` verwendet bereits das Muster
"`INTERNAL_API_TOKEN`-gated interner Endpoint statt zweiter DB-Verbindung" für genau diese Art von
Service-Grenze. Dieser Plan übernimmt dasselbe Muster 1:1, statt eine neue Lösung zu entwerfen.

## File Structure

```
components/website/src/pages/api/internal/applications/list.ts            (neu)
components/website/src/pages/api/internal/applications/list.test.ts       (neu)
components/website/src/pages/api/internal/applications/timeline.ts        (neu)
components/website/src/pages/api/internal/applications/timeline.test.ts   (neu)
components/brett/src/server/routes/applications.ts                        (neu)
components/brett/src/client/ui/applications-board.ts                      (neu)
components/brett/test/applications-board.test.ts                          (neu)
```

Budget: alle Dateien neu, nicht gebaselined. `.ts`-Limit laut `docs/code-quality/gates.yaml`
`s1.limits` ist 900 Zeilen — jede der neuen Dateien bleibt mit dem unten skizzierten Umfang
deutlich darunter (~60-150 Zeilen geschätzt). CQ02-`any`-Zähler in
`components/website/src` ist aktuell 0 (`grep -rn ': any\|<any>\|as any' components/website/src
--include='*.ts' --include='*.svelte' --include='*.astro' | wc -l`) — dieser Plan führt keine
neuen `any`-Typen ein (Limit bleibt 0/200 nach der Änderung).

## Task 1: Interne Read-API `GET /api/internal/applications/list` (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

```bash
cd components/website && npx vitest run src/pages/api/internal/applications/list.test.ts
# expected: FAIL (Datei existiert noch nicht)
```

Test-Szenarien (Vorbild: bestehende Tests unter `src/pages/api/auth/me.test.ts` für
Astro-`APIRoute`-Testing-Muster):
- Request ohne/mit falschem `x-internal-token` → HTTP 403, keine Daten im Body
  (Spec-Szenario "Unauthorized request is rejected").
- Request mit korrektem Token → 200, Body gruppiert nach Status (`found`, `drafting`, `applied`,
  `interviewing`, `offered`), je Eintrag `{id, company, role_title, dossier_count}`
  (Spec-Szenario "Authorized internal request lists applications grouped by status").

**GREEN — Fix-Step:**

Erstelle `components/website/src/pages/api/internal/applications/list.ts` (Vorbild:
`components/website/src/pages/api/internal/tickets/notify-close.ts` für das Token-Auth-Muster).
`GET`-Handler: prüft `x-internal-token` gegen `process.env.INTERNAL_API_TOKEN`, sonst 403. Danach
`SELECT j.id, j.company, j.role_title, j.status, COUNT(d.id) AS dossier_count FROM
applications.jobs j LEFT JOIN applications.dossiers d ON d.job_id = j.id WHERE j.status <>
'withdrawn' GROUP BY j.id ORDER BY j.status, j.updated_at DESC` über `pool` aus
`../../../../lib/website-db`, Ergebnis clientseitig nach `status` gruppiert als JSON zurückgegeben.

Run des Vitest-Tests aus dem RED-Step muss jetzt GREEN sein.

## Task 2: Interne Write-API `POST /api/internal/applications/timeline` (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

```bash
cd components/website && npx vitest run src/pages/api/internal/applications/timeline.test.ts
# expected: FAIL (Datei existiert noch nicht)
```

Szenarien:
- Fehlender/falscher Token → 403, kein Insert (Spec-Szenario "Unauthorized request is rejected").
- Gültiger Token + `{job_id, event_type, notes}` → 200, neue Zeile in `applications.timeline`
  mit `created_at` gesetzt (Spec-Szenario "Timeline event logging on interview feedback" aus
  Phase 1).

**GREEN — Fix-Step:**

Erstelle `components/website/src/pages/api/internal/applications/timeline.ts` nach demselben
Token-Auth-Muster wie Task 1. `POST`-Handler: `INSERT INTO applications.timeline (job_id,
event_type, notes) VALUES ($1, $2, $3) RETURNING id, created_at`.

Run des Vitest-Tests aus dem RED-Step muss jetzt GREEN sein.

## Task 3: Brett-Server-Route + Kanban-UI (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

```bash
cd components/brett && MOCK_DB=true npx tsx --test test/applications-board.test.ts
# expected: FAIL (applications-board.ts existiert noch nicht)
```

Szenarien (Vorbild: `components/brett/test/appearance.test.ts` für UI-Modul-Testing-Muster):
- Server-Route `GET /api/applications` (Brett-intern) ruft die Website-API aus Task 1 per `fetch`
  mit `INTERNAL_API_TOKEN`-Header auf und reicht das gruppierte JSON unverändert an den Client
  durch.
- Client-UI-Funktion `renderApplicationsBoard(data)` rendert für jede der 5 Statusgruppen eine
  Spalte mit den zugehörigen Jobs (Spec-Szenario "Viewing applications Kanban board", Phase 1) —
  Test prüft die erzeugte DOM-/Datenstruktur, kein visueller Snapshot.

**GREEN — Fix-Step:**

Erstelle `components/brett/src/server/routes/applications.ts` (Vorbild:
`components/brett/src/server/routes/presets.ts` für Routing-Konventionen) — ruft
`process.env.WEBSITE_INTERNAL_URL + '/api/internal/applications/list'` mit
`x-internal-token: process.env.INTERNAL_API_TOKEN` auf. Erstelle
`components/brett/src/client/ui/applications-board.ts` (Vorbild: `src/client/ui/lobby.ts` für das
UI-Modul-Muster) mit `renderApplicationsBoard(data)` und einem einfachen Formular pro Karte, das
`POST /api/applications/:id/timeline` (leitet an Task-2-Endpoint weiter) für Interview-Notizen
aufruft.

Run des Test-Steps aus dem RED-Step muss jetzt GREEN sein.

## Task 4: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil neue Test-Dateien angelegt wurden:

```bash
task test:inventory   # components/website/src/data/test-inventory.json committen
```

**Env-Variablen dokumentieren:** `INTERNAL_API_TOKEN` (geteilt zwischen website und brett,
bereits als Secret-Pattern aus `internal/tickets/notify-close.ts` vorhanden — kein neues Secret
nötig, nur zusätzlicher Verbraucher) und `WEBSITE_INTERNAL_URL` (neu, Cluster-interner
Service-DNS-Name der website-Deployment, in `environments/<env>.yaml` ergänzen, keine
Brand-Domain-Literale im Code — S3-Gate).
