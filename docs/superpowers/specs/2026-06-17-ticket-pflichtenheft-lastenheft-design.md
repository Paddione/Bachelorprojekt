---
ticket_id: T000928
plan_ref: null
domains: [website, factory, db]
status: draft
---

# Pflichtenheft → Lastenheft: Ticket-Anforderungsliste mit KI-Reife-Lock

## Problem / Warum

Tickets haben kein strukturiertes Feld für die fachlichen Anforderungen, die die Software
erfüllen soll. Es gibt keinen expliziten, maschinenlesbaren „ab jetzt darf die KI ran"-Schalter:
Die Reife eines Tickets zur autonomen Bearbeitung ist heute implizit über mehrere
`readiness`-Flags + Status verstreut.

Wir führen eine **Anforderungsliste** ein, die im Entwurf **„Pflichtenheft"** heißt und beim
Verriegeln zu **„Lastenheft"** wird. Dieser Übergang ist das **Reife-Signal**: ein verriegeltes
Lastenheft (mit ≥1 Anforderung) gibt das Ticket an die Software-Factory frei.

> **Begriffs-Hinweis (bewusste Domänen-Konvention):** Diese Richtung (Pflichtenheft = Entwurf →
> Lastenheft = verriegelt/KI-reif) kehrt die DIN-69901-Lehrbuch-Bedeutung um. Das ist die
> gewünschte Projektsprache und wird überall konsistent so verwendet.

## Verhalten (Entscheidungen)

1. **Harter Factory-Gate:** Der Autopilot-Dispatcher bearbeitet ein Feature nur, wenn das
   Lastenheft verriegelt ist (`readiness.lastenheft_locked = true`). Fail-closed.
2. **Lock-Semantik:** Verriegelt = read-only. Bearbeiten erfordert explizites Entriegeln →
   Liste heißt wieder „Pflichtenheft", KI-Reife erlischt.
3. **Lock-Vorbedingung:** Verriegeln nur möglich mit **≥1 nicht-leerer Anforderung**.
4. **Status-Kopplung:** Verriegeln transitioniert den Status automatisch **vorwärts → `backlog`**
   (die Autopilot-Lane), forward-only — Tickets ab `in_progress` werden nicht zurückgeworfen.
   Entriegeln setzt den Status **nicht** destruktiv zurück; der Gate allein verhindert das
   KI-Pickup.

## Architektur / Datenmodell

Minimal-invasiv, folgt der bestehenden `value_prop`/`areas`-Präzedenz-Kette
(DB → CLI → API → Types → UI).

- **DB:** neue Spalte `requirements_list TEXT[]` in `tickets.tickets` (idempotenter `ALTER` in
  `website/src/lib/tickets-db.ts`, neben `areas`/`depends_on`). Lock-Zustand lebt im bestehenden
  `readiness JSONB` unter dem Key `lastenheft_locked` (bool) — **kein neuer Status-Enum-Wert,
  kein zweites Feld**.
- **Label rein abgeleitet:** `lastenheft_locked=true` → „Lastenheft", sonst „Pflichtenheft".
  Nie persistiert.

### Komponenten / Schnittstellen

| Unit | Aufgabe | Abhängigkeiten |
|------|---------|----------------|
| `tickets-db.ts` (Schema) | Spalte `requirements_list` idempotent anlegen | pg pool |
| `ticket-readiness.ts` → `lastenheftLocked(id,pool)` | reine Lese-Prüfung des Lock-Flags | pg pool |
| `lib/tickets/lastenheft.ts` (neu) | reine Helfer: `canLock(list)` (≥1 req), `nextStatusOnLock(cur)` (forward-only → `backlog`) | keine (pures Modul, keine Import-Zyklen) |
| `patchItem` (planning-office.ts) | `requirements_list` schreiben, `readiness` **mergen** (DOR+Lock), bei Lock serverseitig Vorbedingung+forward-Transition | lastenheft.ts |
| API `PATCH /api/admin/planungsbuero/[extId]` | reicht `requirements`,`lastenheftLocked` durch; `lastenheft_empty`→422 | patchItem |
| `ticket.sh` | `plan-meta --requirements "a|b|c"`, `lastenheft lock|unlock --id` | psql |
| `factory/queue.sh` | Gate: WHERE … `AND COALESCE((readiness->>'lastenheft_locked')::boolean,false)=true` | — |
| `PlanningOfficeDetail.svelte` | Anforderungs-Editor + Lock-Toggle + Label-Flip | API |
| `PlanningOffice.svelte` | Badge `✓ Lastenheft` / `⚠ Pflichtenheft offen` | cockpit-types |

### Datenfluss (Lock)

UI Lock-Klick → `PATCH /api/admin/planungsbuero/[extId] {lastenheftLocked:true}` → `patchItem`:
`canLock` prüfen (≥1 req, sonst 422) → readiness als ein JSONB-Merge (DOR+Lock) →
`status = CASE … THEN 'backlog' …` (forward-only) → UPDATE.
Danach pollt `queue.sh` das Ticket; ohne Lock bleibt es unsichtbar für den Dispatcher.

## Fehlerbehandlung

- Lock ohne Anforderung → **422** `{error:"lastenheft_empty"}`, kein State-Change.
- readiness-Merge erhält **immer** andere Flags (`||`-Merge, nie überschreiben).
- Status-Transition forward-only: `nextStatusOnLock` lässt `in_progress`/`in_review`/`done`/… unangetastet.
- Gate fail-closed: fehlendes/ungültiges `readiness` → `false` (COALESCE).

## Tests

- **vitest** (`admin.ts`/`lastenheft.ts`): requirements round-trip; `canLock([])===false`;
  readiness-Merge erhält Fremd-Flags; `nextStatusOnLock('triage')==='backlog'`,
  `nextStatusOnLock('in_progress')==='in_progress'`.
- **bats** (`tests/unit/`): `queue.sh`-Gate (verriegeltes Feature erscheint, unverriegeltes nicht);
  `ticket.sh lastenheft lock` lehnt leere Liste ab und setzt Flag+Status bei gefüllter Liste.

## Out of Scope (YAGNI)

- Keine Versionierung/History der Anforderungsliste.
- Kein eigener neuer Status-Enum-Wert.
- Keine Migration bestehender Tickets (Default `'{}'` + Flag absent = „Pflichtenheft offen").
