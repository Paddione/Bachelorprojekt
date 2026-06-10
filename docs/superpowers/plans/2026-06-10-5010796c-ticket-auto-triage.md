---
title: Plan: Ticket-Auto-Triage (Severity-Erkennung)
ticket_id: 5010796c-c8d8-4a15-a4d8-bd894d2fc536
domains: [factory, db, website]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: batch-2026-06-10
parent_feature: null
depends_on_plans: []
---

# Plan: Ticket-Auto-Triage (Severity-Erkennung)

**Ticket:** 5010796c
**Branch:** feature/5010796c-ticket-auto-triage
**Datum:** 2026-06-10
**Status:** staged

---

## Ziel

Nach jeder Ticket-Erstellung (feature, bug, task, project) analysiert ein LLM-Agent
(Claude Haiku) Titel + Beschreibung und schreibt einen System-Kommentar mit Vorschlägen
für Priority, Severity und Component. Der Vorschlag ist nicht auto-gesetzt — ein Admin
sieht ihn im Timeline-Feed und kann ihn manuell übernehmen.

## Architektur

### Neue Dateien

| Datei | Verantwortung |
|-------|---------------|
| `website/src/lib/ticket-triage.ts` | Kern-Logik: LLM-Prompt, Parse, Kommentar schreiben. Exportiert `autoTriage()` (fire-and-forget) und `runTriage()` (synchron, für API). |
| `website/src/pages/api/admin/tickets/[id]/triage.ts` | API-Endpunkt `POST` — manueller Trigger für Admins. Auth-gated wie classify.ts. |
| `tests/unit/ticket-triage.bats` | Offline-Tests: Prompt-Format, JSON-Parse, Fehlerbehandlung. |

### Geaenderte Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/pages/api/admin/tickets/index.ts` | Nach `createAdminTicket()` → `void autoTriage(id, BRAND()).catch(…)` |
| `website/src/pages/api/admin/bugs/create.ts` | Nach `insertBugTicket()` → `void autoTriage(ticketInternalId, BRAND()).catch(…)` |
| `website/src/pages/api/tickets/comment.ts` | Im else-Zweig (Portal-Feedback create) → `void autoTriage(id, BRAND()).catch(…)` |

### Nicht geaendert

- `website/src/lib/tickets-db.ts` — kein Schema-Change nötig (severity, priority, ticket_comments.kind existieren)
- `website/src/pages/api/admin/tickets/[id]/classify.ts` — bleibt unverändert (manual re-classify)
- `website/src/lib/factory-floor.ts` — Factory-Pipeline wird nicht berührt

## Tech-Stack

- **Runtime:** Astro 5 API-Route (TypeScript)
- **LLM:** `@anthropic-ai/sdk` via `getProviderConfig(source, 'haiku')` aus `provider-config.ts`
- **DB:** `tickets.ticket_comments` (kind='system', visibility='internal') via `addComment()` aus `lib/tickets/admin.ts`
- **Test:** BATS (offline, mockt LLM-Antwort)

---

## Tasks

- [ ] **T1 — ticket-triage.ts erstellen (Kern-Logik):**

  Neue Datei `website/src/lib/ticket-triage.ts` mit zwei Exports:

  ```ts
  export async function autoTriage(ticketId: string, brand: string): Promise<void>
  export async function runTriage(ticketId: string, brand: string): Promise<TriageResult | null>
  ```

  `runTriage()`:
  1. `getTicketDetail(brand, ticketId)` aufrufen (aus `lib/tickets/admin.ts`)
  2. Wenn title leer UND description leer → return null (skip)
  3. `getProviderConfig('ticket-triage', 'haiku')` aufrufen
  4. `Anthropic`-Client instanziieren (mit apiKey + optional baseUrl aus provider-config)
  5. Prompt bauen (siehe Spec §3) — title, description, type aus Ticket-Detail
  6. `client.messages.create({ model: cfg.modelId, max_tokens: 200, messages: [...] })`
  7. JSON aus Response extrahieren (regex `/\{[\s\S]*\}/` + `JSON.parse`)
  8. Bei Parse-Fehler: 1 Retry. Bei erneutem Fehler: log + return null
  9. Priority mappen: `{high:'hoch', critical:'hoch', medium:'mittel', low:'niedrig'}` (analog classify.ts PRIORITY_MAP)
  10. Severity validieren: muss in `['critical','major','minor','trivial']` sein, sonst default 'minor'
  11. `addComment()` aufrufen mit `kind='system'`, `visibility='internal'`, `actor={label:'Auto-Triage'}`
  12. Kommentar-Body als Markdown (siehe Spec §4)
  13. Return `{ priority, severity, component, reasoning }`

  `autoTriage()`:
  - Ruft `runTriage()` auf, catcht alle Errors mit `console.error('[ticket-triage]', err)`
  - Kein Re-throw — fire-and-forget

  Dependencies: `@anthropic-ai/sdk`, `lib/provider-config.ts`, `lib/tickets/admin.ts` (getTicketDetail, addComment)

- [ ] **T2 — API-Endpunkt triage.ts erstellen:**

  Neue Datei `website/src/pages/api/admin/tickets/[id]/triage.ts`.

  - `export const POST: APIRoute` — analog classify.ts aufgebaut
  - Auth: `getSession(cookie)` + `isAdmin(session)` → 403 wenn nicht admin
  - `params.id` validieren (nicht leer)
  - `ANTHROPIC_API_KEY` prüfen → 503 wenn fehlt
  - `runTriage(id, BRAND())` aufrufen
  - Wenn null → 500 mit `{ error: 'Triage nicht möglich (leeres Ticket?)' }`
  - Sonst → 200 mit `{ ticket_id: id, priority, severity, component, reasoning }`

- [ ] **T3 — Auto-Hook in Ticket-Create-Endpoints einbauen:**

  Drei Dateien ändern:

  **a) `website/src/pages/api/admin/tickets/index.ts`:**
  - Import `autoTriage` aus `../../../../../lib/ticket-triage`
  - Nach Zeile 75 (`const id = await createAdminTicket({...})`), vor dem Response:
    `void autoTriage(id, BRAND()).catch(err => console.error('[tickets POST] triage failed:', err))`

  **b) `website/src/pages/api/admin/bugs/create.ts`:**
  - Import `autoTriage` aus `../../../../../lib/ticket-triage`
  - Nach Zeile 54 (`ticketId = inserted.ticketId`), vor dem Response:
    - `insertBugTicket` liefert `{id, ticketId}` — `id` ist die UUID, `ticketId` ist external_id
    - `void autoTriage(inserted.id, BRAND()).catch(err => console.error('[bugs/create] triage failed:', err))`

  **c) `website/src/pages/api/tickets/comment.ts`:**
  - Import `autoTriage` aus `../../../lib/ticket-triage`
  - Im else-Zweig (Zeile 50-57), nach `createAdminTicket()`:
    - `createAdminTicket` liefert die UUID als string
    - `void autoTriage(newTicketId, BRAND()).catch(err => console.error('[tickets/comment] triage failed:', err))`
    - Dafür muss der Rückgabewert von `createAdminTicket` in eine Variable

- [ ] **T4 — Unit-Tests (ticket-triage.bats):**

  Neue Datei `tests/unit/ticket-triage.bats`:

  - Test: Prompt enthält title + description + type
  - Test: JSON-Parse extrahiert priority/severity/component/reasoning korrekt
  - Test: Priority-Mapping: high→hoch, critical→hoch, medium→mittel, low→niedrig
  - Test: Severity-Validierung: ungültiger Wert → default 'minor'
  - Test: Leeres Ticket (kein title, kein description) → skip
  - Test: LLM-Fehler → kein Crash, log error
  - Test: Kommentar wird mit kind='system' und visibility='internal' geschrieben

- [ ] **T5 — E2E-Test (optional, gegen k3d):**

  In `tests/e2e/specs/`: neuer Test der ein Ticket via Admin-UI erstellt und prüft,
  dass innerhalb von 10 Sekunden ein System-Kommentar mit "Auto-Triage Vorschlag" im
  Timeline-Feed erscheint. Erfordert gültigen `ANTHROPIC_API_KEY` im Cluster.

---

## Verifikation

### Lokal

```bash
task test:unit                                    # BATS inkl. ticket-triage.bats
npm --prefix website run test:unit                # Vitest (bestehende Tests nicht brechen)
```

### CI

```bash
task test:all                                     # Voll-Suite (BATS + Factory + Manifests + Dry-Run)
npm --prefix website run build                    # Astro-Build muss durchlaufen
```

### Akzeptanzkriterien-Checkliste

- [ ] Nach Ticket-Erstellung (feature/bug/task/project) erscheint ein System-Kommentar
      mit Priority-, Severity- und Component-Vorschlag im Timeline-Feed
- [ ] Kommentar ist `visibility='internal'` (nicht öffentlich sichtbar)
- [ ] Kommentar ist `kind='system'` (als Auto-Triage erkennbar)
- [ ] Ticket-Erstellung wird nicht blockiert (fire-and-forget, <50ms Overhead)
- [ ] Manueller Trigger via `POST /api/admin/tickets/[id]/triage` funktioniert
- [ ] Fehlender `ANTHROPIC_API_KEY` → still no-op, kein Fehler im UI
- [ ] LLM-Ausfall → kein Crash, Error wird geloggt
- [ ] Severity-Skala: critical/major/minor/trivial (DB-Constraint-konform)
- [ ] Priority-Mapping: high/critical→hoch, medium→mittel, low→niedrig
- [ ] Alle Ticket-Typen unterstützt (feature, bug, task, project)
- [ ] Bestehende classify.ts unverändert
- [ ] Keine Schema-Änderungen (severity/priority/comments existieren bereits)
- [ ] `task test:all` grün
- [ ] Keine neuen Comments in Code (gemäß Projekt-Konvention)
