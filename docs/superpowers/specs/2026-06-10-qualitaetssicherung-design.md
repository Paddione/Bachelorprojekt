# Qualitätssicherungs-Stufe (Software Factory Part 3)

**Datum:** 2026-06-10
**Status:** spec
**Ticket:** T000581 (zu vergeben)

## Überblick

Tickets die die Factory-Pipeline vollständig durchlaufen (Phase `deploy` done) landen bisher direkt in `status = 'done'`. Diese Stufe schiebt einen menschlichen Abnahme-Schritt dazwischen: der Admin prüft anhand einer festen Checkliste ob das Feature korrekt implementiert wurde, und kann es entweder abnehmen (→ `done`) oder mit Feedback in die Pipeline zurückschicken (→ `in_progress` + Factory-Injection).

## Entscheidungen

| Frage | Entscheidung |
|-------|--------------|
| Wo im UI? | 5. Spalte im Factory Floor, nach dem Versand-Panel |
| Formular-Trigger | Modal-Overlay bei Klick auf QS-Chip |
| Formular-Felder | Globale Checkliste (5 Kriterien) + Kommentar + Phase-Selector |
| Chip-Zustand | Farbe + `n/5`-Badge |
| Re-Entry | Ticket reaktivieren: `status → in_progress`, QS-Feedback als `factory_injection` |
| Checklisten-Typ | Global (Ansatz A) — gleiche 5 Kriterien für alle Tickets |

## Datenbankschema

### Neuer Ticket-Status

`qa_review` wird in den CHECK-Constraint von `tickets.tickets.status` aufgenommen:

```sql
CHECK (status IN (
  'triage','planning','plan_staged','backlog',
  'in_progress','in_review','blocked',
  'qa_review',   -- NEU
  'done','archived'
))
```

`done_at` wird erst beim QS-Approve gesetzt (nicht beim Deploy).

### Neue Tabelle `tickets.qa_reviews`

```sql
CREATE TABLE tickets.qa_reviews (
  id             BIGSERIAL PRIMARY KEY,
  ticket_id      UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  criteria       JSONB NOT NULL,
  -- [{key: string, label: string, passed: boolean}]
  -- Snapshot der globalen Kriterien zum Zeitpunkt des Reviews
  notes          TEXT,
  verdict        TEXT NOT NULL CHECK (verdict IN ('approved','rejected')),
  re_entry_phase TEXT CHECK (re_entry_phase IN ('scout','implement','verify')),
  reviewed_by    TEXT NOT NULL DEFAULT 'admin',
  reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON tickets.qa_reviews (ticket_id);
```

### Globale Kriterien (hartcodiert in DAL, Ansatz A)

```ts
export const QA_CRITERIA = [
  { key: 'spec_match',   label: 'Feature verhält sich wie spezifiziert' },
  { key: 'no_regression', label: 'Keine sichtbaren Regressions' },
  { key: 'responsive',   label: 'Mobile / Responsive OK' },
  { key: 'performance',  label: 'Ladezeit akzeptabel' },
  { key: 'copy',         label: 'Texte / Übersetzungen korrekt' },
];
```

## API-Endpunkte

### `GET /api/admin/qa-queue`

Gibt alle Tickets mit `status = 'qa_review'` zurück, joined mit:
- letztem `qa_reviews`-Eintrag (für Re-Review: vorheriges Feedback sichtbar)
- PR-Nummer aus `ticket_links`
- `deploy`-Phase-Timestamp aus `factory_phase_events`

Response-Shape:
```ts
interface CriterionResult { key: string; label: string; passed: boolean; }

interface QaItem {
  extId: string;
  title: string;
  prNumber: number | null;
  deployedAt: string | null;
  lastReview: { criteria: CriterionResult[]; notes: string | null } | null;
}
```

### `POST /api/admin/qa-reviews`

```ts
interface QaReviewPayload {
  ticket_id: string;
  criteria: { key: string; passed: boolean }[];
  notes?: string;
  verdict: 'approved' | 'rejected';
  re_entry_phase?: 'scout' | 'implement' | 'verify';
}
```

**Bei `verdict = 'approved'`:**
1. `qa_reviews`-Eintrag anlegen
2. `tickets.status → 'done'`, `done_at = now()`

**Bei `verdict = 'rejected'`:**
1. `qa_reviews`-Eintrag anlegen
2. `tickets.status → 'in_progress'`
3. `factory_injections`-Eintrag anlegen:
   - `kind = 'note'`
   - `phase = re_entry_phase`
   - `title = 'QS-Feedback'`
   - `content` = generierte Zusammenfassung (fehlgeschlagene Kriterien + Notiz)
   - `injected_by = 'qa-admin'`
4. `pipeline_slot` bleibt erhalten

### `GET /api/admin/qa-criteria`

Gibt `QA_CRITERIA` zurück. Vorerst statisch — ermöglicht spätere Dynamisierung ohne Frontend-Änderung.

## Frontend-Komponenten

### `FactoryFloor.svelte` — Änderungen

- `load()`-Aufruf erweitert um `/api/admin/qa-queue` (parallel zu bestehenden Requests)
- Neues Panel `<!-- ⑤ QS-Abnahme -->` nach dem Versand-Panel
- SSE-Refresh löst nach Approve/Reject einen Floor-Reload aus (bestehender Mechanismus)
- `qaModalTicket: QaItem | null` Store für das aktuell geöffnete Modal

### `QaChip.svelte` (neu)

Chip-Zustände via CSS-Klassen:

| Zustand | Farbe | Badge |
|---------|-------|-------|
| Wartet auf Prüfung | `#f0c040` (gold) | `0/5` |
| Modal offen | `#6366f1` (lila) | `n/5` |
| Abgenommen | `#22c55e` (grün) | `5/5` |
| Zurückgeschickt | `#ef4444` (rot) | `n/5` |

Draft-State (Checkbox-Fortschritt) lebt im Svelte-Store, nicht in der DB.

Props: `item: QaItem`, `isActive: boolean`
Events: `on:click` → öffnet Modal

### `QaModal.svelte` (neu)

**Header:** Ticket-ID · Titel · PR-Link · Zeit seit Deploy

**Checklisten-Sektion:**
- 5 Checkboxen mit `accent-color: #22c55e`
- Checkboxen aus `/api/admin/qa-criteria` geladen (gecacht)
- Checkbox-Semantik: **gecheckt = bestanden**, **ungecheckt = nicht bestanden**
- Startzustand: alle ungecheckt (Admin muss aktiv bestätigen)
- Bei Re-Review: vorherige `passed`-Werte vorausgefüllt, Notiz als Referenz grau hinterlegt

**Kommentar-Textarea:**
- Erscheint sobald mind. 1 Checkbox ungecheckt ist
- Pflichtfeld wenn `verdict = 'rejected'`

**Phase-Selector:**
- Erscheint sobald mind. 1 Checkbox ungecheckt ist
- Optionen: `implement` (Standard) · `verify` · `scout`
- `re_entry_phase` ist serverseitig Pflichtfeld wenn `verdict = 'rejected'`

**Footer-Buttons:**
- „✓ Abnehmen" — disabled solange irgendeine Checkbox ungecheckt ist
- „↺ Zurückschicken" — disabled solange kein Kommentar ausgefüllt ist (mind. 1 Zeichen)

## Pipeline-Integration

### Factory Dispatcher (`scripts/factory/dispatcher.js`)

```js
// Nach erfolgreichem deploy-Phase-Event:
// vorher: await setTicketStatus(ticketId, 'done');
await setTicketStatus(ticketId, 'qa_review');
// done_at wird NICHT gesetzt — das übernimmt der QS-Approve
```

### `dev-flow-execute` Skill

Am Ende des Deploy-Schritts wird `status → 'qa_review'` explizit gesetzt (statt `done`). Der Skill dokumentiert im PR-Kommentar dass das Ticket auf QS-Abnahme wartet.

## Tests

| ID | Typ | Beschreibung |
|----|-----|--------------|
| `FA-QS-01` | E2E | Ticket mit `status = qa_review` erscheint in der 5. Spalte |
| `FA-QS-02` | E2E | Modal öffnet sich beim Klick, zeigt 5 Checkboxen |
| `FA-QS-03` | E2E | „Abnehmen"-Button disabled solange nicht alle 5 gesetzt |
| `FA-QS-04` | E2E | Approve: Status → `done`, Chip verschwindet aus QS-Spalte |
| `FA-QS-05` | E2E | Reject: Status → `in_progress`, factory_injection angelegt, Ticket in Hall bei gewählter Phase |
| `FA-QS-06` | E2E | Badge zeigt `3/5` wenn 3 Checkboxen im Draft gesetzt |
| `FA-QS-07` | BATS | `qa-dal` Unit: `createQaReview` approve-Pfad (Status + done_at) |
| `FA-QS-08` | BATS | `qa-dal` Unit: `createQaReview` reject-Pfad (Status + injection) |

## Neue Dateien

```
website/src/lib/qa-dal.ts
website/src/pages/api/admin/qa-queue.ts
website/src/pages/api/admin/qa-reviews.ts
website/src/pages/api/admin/qa-criteria.ts
website/src/components/QaChip.svelte
website/src/components/QaModal.svelte
```

## Geänderte Dateien

```
website/src/lib/tickets-db.ts          — Status-Constraint + qa_reviews ensureTable
website/src/components/FactoryFloor.svelte — 5. Spalte + Modal-Host
scripts/factory/dispatcher.js          — deploy → qa_review statt done
.claude/skills/dev-flow-execute/SKILL.md — QS-Hinweis im Deploy-Schritt
```
