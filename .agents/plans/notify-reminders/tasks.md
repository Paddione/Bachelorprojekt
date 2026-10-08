---
title: "notify-reminders — Transaktionsmails, Erinnerungen, Versandstatus"
ticket_id: T901025
domains: [website, notifications, owner-workspace]
status: active
---

# notify-reminders — Implementation Plan

## File Structure

- `components/website/src/lib/appointment-notify.ts`: neu, Templates, Dedupe, Retry, Protokoll.
- `components/website/src/db/migrations/20261008_appointment_notify.sql`: neu, Versandprotokoll oder begründeter Verzicht.
- `components/website/src/pages/api/booking.ts`: Umstellung auf Notify-Lib.
- `components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts`: Umstellung auf Notify-Lib.
- `components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts`: Umstellung auf Notify-Lib.
- `components/website/src/pages/api/anfrage/[token]/storno.ts`: Umstellung auf Notify-Lib.
- `components/website/src/pages/api/anfrage/[token]/umbuchung.ts`: Umstellung auf Notify-Lib.
- `components/website/src/pages/api/cron/appointment-reminders.ts`: neu, 24h-Erinnerungslauf.
- `k3d/appointment-reminders-cronjob.yaml`: neu, CronJob-Manifest.
- `k3d/kustomization.yaml`: Ressource eintragen.
- `components/website/src/pages/owner/anfragen.astro`: Versandstatus-Spalte.
- `components/website/src/pages/api/owner/anfragen/[id]/resend.ts`: neu, erneut senden.
- `tests/spec/notify-reminders.bats`: neu, Spec-Guards.
- `components/website/src/lib/__tests__/appointment-notify.test.ts`: neu, Vitest.

## Zweck

Einheitliche transaktionale E-Mails für Anfragen und Buchungen: Bestätigung,
Erinnerung 24 Stunden vorher, Storno- und Umbuchungs-Mitteilungen. Jede
Nachricht geht genau einmal raus (Dedupe), Fehlversand wird dreimal wiederholt
und bleibt danach für die Inhaberin sichtbar und erneut sendbar. Alle Texte
sind werbefreie deutsche Service-Nachrichten ohne Gesundheitsinformationen.

## Scope and evidence

Work only in `.worktrees/notify-reminders` on `feature/notify-reminders-T901025`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.
Decisions aus Brainstorming 2026-10-08: Erinnerung 24h vorher, Retry 3
Versuche mit Backoff, Versandstatus in /owner/anfragen, Texte als Entwürfe.
Paid SMS/WhatsApp ist explizit kein Scope.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-notify-core.md | Notify-Core | `components/website/src/lib/appointment-notify.ts`, `components/website/src/db/migrations/20261008_appointment_notify.sql` |  |
| p2 | tasks.d/p2-resend-existing.md | Resend-Existing | `components/website/src/pages/api/booking.ts`, `components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts`, `components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts`, `components/website/src/pages/api/anfrage/[token]/storno.ts`, `components/website/src/pages/api/anfrage/[token]/umbuchung.ts` | p1 |
| p3 | tasks.d/p3-reminders.md | Reminders | `components/website/src/pages/api/cron/appointment-reminders.ts`, `k3d/appointment-reminders-cronjob.yaml`, `k3d/kustomization.yaml` | p1 |
| p4 | tasks.d/p4-owner-visibility.md | Owner-Visibility | `components/website/src/pages/owner/anfragen.astro`, `components/website/src/pages/api/owner/anfragen/[id]/resend.ts` | p1 |
| p5 | tasks.d/p5-tests.md | tests | `tests/spec/notify-reminders.bats`, `components/website/src/lib/__tests__/appointment-notify.test.ts` | p1, p2, p3, p4 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst.** Lege die BATS-Guards aus p5 als
  Skelett an und lasse sie gegen den unimplementierten Stand laufen,
  expected: FAIL. Befehl:
  `tests/unit/lib/bats-core/bin/bats tests/spec/notify-reminders.bats`.
  Erst danach beginnt die Implementierung der Partials p1 bis p4.
- [ ] **1. Partial p1 ausführen** (`tasks.d/p1-notify-core.md`): Lib, Protokoll.
  Verify pro Partial-Plan.
- [ ] **2. Partial p2 ausführen** (`tasks.d/p2-resend-existing.md`): fünf
  Versandstellen umstellen, Verhalten äquivalent. Verify pro Partial-Plan.
- [ ] **3. Partial p3 ausführen** (`tasks.d/p3-reminders.md`): Cron-Route,
  Manifest, Kustomization. Verify pro Partial-Plan.
- [ ] **4. Partial p4 ausführen** (`tasks.d/p4-owner-visibility.md`):
  Status-Spalte, Resend-Endpoint. Verify pro Partial-Plan.
- [ ] **5. Partial p5 ausführen** (`tasks.d/p5-tests.md`): BATS-Guards und Vitest
  vervollständigen, alle grün. Danach `task test:inventory` regenerieren und
  `components/website/src/data/test-inventory.json` mitcommitten.
- [ ] **6. Finaler Verify-Task.** Alle Partials gemergt, keine Baseline-Einträge
  hinzugefügt, keine Brand-Domain-Literale in Code-Snippets. Kustomize-Manifeste
  berührt, daher zusätzlich `task workspace:validate`:

```bash
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
