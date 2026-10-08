---
title: "appointment-requests — Besucher-Anfragen mit Owner-Bestätigung"
ticket_id: T901024
domains: [website, booking, owner-workspace]
status: active
---

# appointment-requests — Implementation Plan

## File Structure

- `components/website/src/lib/appointment-requests.ts`: neu, Request-State-Maschine, Token, Vorlauf, Idempotenz.
- `components/website/src/pages/api/booking.ts`: Idempotency-Key, Vorlauf-409, Token-Payload.
- `components/website/src/db/migrations/20261008_appointment_requests.sql`: neu, Request-Persistenz falls Inbox-Payload nicht reicht.
- `components/website/src/pages/anfrage/[token].astro`: neu, SSR-Statusseite per Token.
- `components/website/src/pages/api/anfrage/[token]/storno.ts`: neu, Besucher-Storno.
- `components/website/src/pages/api/anfrage/[token]/umbuchung.ts`: neu, Umbuchung als verknüpfte Neuanfrage.
- `components/website/src/pages/owner/anfragen.astro`: echte Anfrage-Liste mit Annehmen/Ablehnen.
- `components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts`: neu, Annahme mit atomarem Availability-Recheck.
- `components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts`: neu, Ablehnung mit Notiz.
- `components/website/src/components/ContactHub.svelte`: Journey Service zu Slot zu Daten zu Bestätigung.
- `components/website/src/pages/kontakt.astro`: Verdrahtung der Journey.
- `tests/spec/appointment-requests.bats`: neu, Spec-Guards.
- `components/website/src/lib/__tests__/appointment-requests.test.ts`: neu, Vitest für Vorlauf, States, Token.

## Zweck

Besucher stellen Terminanfragen mit Service, Slot und minimalen Kontaktdaten;
jede Anfrage bleibt bis zur Annahme durch die Inhaberin unbestätigt. Der Status
ist nur per Token-Link aus der Bestätigungsmail einsehbar, Storno und Umbuchung
laufen über denselben Link. Die Owner-Annahme prüft atomar Verfügbarkeit,
Ablauf und Mindestvorlauf (Vortag, Europe/Berlin).

## Scope and evidence

Work only in `.worktrees/appointment-requests` on `feature/appointment-requests-T901024`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.
Decisions aus Brainstorming 2026-10-08: Token-Link für Lookup, Storno und
Umbuchung; Idempotency-Key gegen Duplikate; keine Gleich-Tag-Anfragen;
kein öffentlicher Hausbesuch-Pfad; kein Uhrzeit-Annahmeschluss im MVP.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-request-core.md | Request-Core | `components/website/src/lib/appointment-requests.ts`, `components/website/src/pages/api/booking.ts`, `components/website/src/db/migrations/20261008_appointment_requests.sql` |  |
| p2 | tasks.d/p2-visitor-token.md | Besucher-Token | `components/website/src/pages/anfrage/[token].astro`, `components/website/src/pages/api/anfrage/[token]/storno.ts`, `components/website/src/pages/api/anfrage/[token]/umbuchung.ts` | p1 |
| p3 | tasks.d/p3-owner-confirm.md | Owner-Bestätigung | `components/website/src/pages/owner/anfragen.astro`, `components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts`, `components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts` | p1 |
| p4 | tasks.d/p4-form-journey.md | Formular-Journey | `components/website/src/components/ContactHub.svelte`, `components/website/src/pages/kontakt.astro` | p1 |
| p5 | tasks.d/p5-tests.md | tests | `tests/spec/appointment-requests.bats`, `components/website/src/lib/__tests__/appointment-requests.test.ts` | p1, p2, p3, p4 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst.** Lege die BATS-Guards aus p5 als
  Skelett an und lasse sie gegen den unimplementierten Stand laufen,
  expected: FAIL. Befehl:
  `tests/unit/lib/bats-core/bin/bats tests/spec/appointment-requests.bats`.
  Erst danach beginnt die Implementierung der Partials p1 bis p4.
- [ ] **1. Partial p1 ausführen** (`tasks.d/p1-request-core.md`): Lib, booking.ts,
  Migration. Verify pro Partial-Plan.
- [ ] **2. Partial p2 ausführen** (`tasks.d/p2-visitor-token.md`): Statusseite,
  Storno, Umbuchung. Verify pro Partial-Plan.
- [ ] **3. Partial p3 ausführen** (`tasks.d/p3-owner-confirm.md`): Owner-Liste,
  Annehmen mit claimSlot-Recheck, Ablehnen. Verify pro Partial-Plan.
- [ ] **4. Partial p4 ausführen** (`tasks.d/p4-form-journey.md`): ContactHub-Journey,
  kontakt-Verdrahtung, mobil und Tastatur prüfbar. Verify pro Partial-Plan.
- [ ] **5. Partial p5 ausführen** (`tasks.d/p5-tests.md`): BATS-Guards und Vitest
  vervollständigen, alle grün. Danach `task test:inventory` regenerieren und
  `components/website/src/data/test-inventory.json` mitcommitten.
- [ ] **6. Finaler Verify-Task.** Alle Partials gemergt, keine Baseline-Einträge
  hinzugefügt, keine Brand-Domain-Literale in Code-Snippets:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
