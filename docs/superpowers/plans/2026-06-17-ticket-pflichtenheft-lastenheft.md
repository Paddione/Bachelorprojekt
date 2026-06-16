---
ticket_id: T000928
status: done
domains: [website, factory, db]
spec_ref: docs/superpowers/specs/2026-06-17-ticket-pflichtenheft-lastenheft-design.md
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: Pflichtenheft → Lastenheft (Ticket-Anforderungsliste mit KI-Reife-Lock)

Spec: `docs/superpowers/specs/2026-06-17-ticket-pflichtenheft-lastenheft-design.md`

Umgesetzt in einem Durchgang (Ziel-getriebener autonomer Lauf). Alle Schritte verifiziert.

## Tasks

- [x] **T1 — DB-Spalte.** `requirements_list TEXT[]` idempotent in `initTicketsSchema()`
  (`website/src/lib/tickets-db.ts`), zeilenneutral auf die bestehende `readiness`-Zeile gesetzt
  (S1-Ratchet: die Datei ist baselined, Budget 0). Lock-Flag lebt im `readiness` JSONB unter
  `lastenheft_locked`.
- [x] **T2 — Pure Helper.** `website/src/lib/tickets/lastenheft.ts` — `canLock` (≥1 Anforderung),
  `nextStatusOnLock` (forward-only → `backlog`), `requirementsLabel`, `isLastenheftLocked`,
  `normalizeRequirements`. Vollständig unit-getestet (`lastenheft.test.ts`, 5 Tests).
- [x] **T3 — Planungsbüro-Logik.** `website/src/lib/planning-office.ts`: `OfficeItem` +
  `requirementsList`/`lastenheftLocked`; `listOffice` selektiert die Spalte; `patchItem` nimmt
  `requirements` + `lastenheftLocked` (Vorbedingung via `canLock`, readiness als **JSONB-Merge**
  statt Replace — verhindert das Löschen von `lastenheft_locked` beim DOR-Toggle — und
  forward-only Status-Transition).
- [x] **T4 — API.** `api/admin/planungsbuero/[extId].ts` reicht `requirements`/`lastenheftLocked`
  durch; `lastenheft_empty` → HTTP 422.
- [x] **T5 — Harter Factory-Gate.** `scripts/factory/queue.sh`: WHERE +
  `COALESCE((readiness->>'lastenheft_locked')::boolean,false)=true` — Autopilot zieht nur
  verriegelte Tickets (fail-closed).
- [x] **T6 — CLI.** `scripts/ticket.sh`: `plan-meta --requirements "a|b|c"` (pipe-getrennt,
  Kommas bleiben erhalten) + neuer `lastenheft lock|unlock --id` Subcommand (Vorbedingung +
  Status-Transition).
- [x] **T7 — UI.** `PlanningOfficeDetail.svelte`: Anforderungs-Editor + Lock-Toggle, Label-Flip
  Pflichtenheft↔Lastenheft, read-only wenn verriegelt. `PlanningOffice.svelte`: `saveRequirements`
  + `toggleLock` (422-Handling, Item verlässt das Büro nach Lock).
- [x] **T8 — Tests.** `tests/unit/ticket-lastenheft.bats` (8 Tests, in `test:all` verdrahtet);
  `lastenheft.test.ts` (5). Coverage-Guard grün.
- [x] **T9 — Verifikation.** `task test:all` (EXIT 0), `pnpm vitest run` (1167 pass), `astro check`
  (keine neuen Fehler in berührten Dateien), `task freshness:check` + `quality:check`
  (0 blocking), `task test:inventory`.
