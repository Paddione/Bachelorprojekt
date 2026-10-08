---
title: "basic-invoices — Basis-Rechnungen, Zahlungsstatus, Export"
ticket_id: T901027
domains: [website, billing, owner-workspace]
status: active
---

# basic-invoices — Implementation Plan

## File Structure

- `components/website/src/lib/invoices.ts`: neu, Snapshot, Nummern, Status.
- `components/website/src/db/migrations/20261008_invoices.sql`: neu, Rechnungs-Tabelle.
- `components/website/src/pages/owner/rechnungen.astro`: neu, Owner-Liste.
- `components/website/src/pages/owner/rechnungen/[id].astro`: neu, Detail und Druck.
- `components/website/src/pages/api/owner/rechnungen/erstellen.ts`: neu, Erstellung.
- `components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts`: neu, Status.
- `components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts`: neu, Korrektur.
- `components/website/src/pages/api/owner/rechnungen/export.ts`: neu, CSV-Export.
- `tests/spec/basic-invoices.bats`: neu, Spec-Guards.
- `components/website/src/lib/__tests__/invoices.test.ts`: neu, Vitest.

## Zweck

Basis-Rechnungen für die Praxis: Erstellung aus bestätigten Terminen mit
Service- und Preis-Snapshot, Nummern fortlaufend pro Jahr, manueller
Zahlungsstatus (bezahlt oder offen, Methode bar oder Überweisung und weitere),
Korrektur per Storno und Neuausstellung, CSV-Export für die Buchhaltung und
Druckansicht. Kein Online-Payment. Pflichtangaben nach §14 UStG,
Kleinunternehmer-Hinweis konfigurierbar.

## Scope and evidence

Work only in `.worktrees/basic-invoices` on `feature/basic-invoices-T901027`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.
Decisions aus Brainstorming 2026-10-08: T901020-Reuse behalten
(Transaktions- und Lock-Muster), Steuer-Hinweis konfigurierbar, CSV-Export,
Nummern pro Jahr, Druckansicht. Steuer-Details folgen T901019 §5.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-invoice-core.md | Invoice-Core | `components/website/src/lib/invoices.ts`, `components/website/src/db/migrations/20261008_invoices.sql` |  |
| p2 | tasks.d/p2-owner-pages.md | Owner-Pages | `components/website/src/pages/owner/rechnungen.astro`, `components/website/src/pages/owner/rechnungen/[id].astro` | p1 |
| p3 | tasks.d/p3-owner-actions.md | Owner-Actions | `components/website/src/pages/api/owner/rechnungen/erstellen.ts`, `components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts`, `components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts`, `components/website/src/pages/api/owner/rechnungen/export.ts` | p1 |
| p4 | tasks.d/p4-tests.md | tests | `tests/spec/basic-invoices.bats`, `components/website/src/lib/__tests__/invoices.test.ts` | p1, p2, p3 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst.** Lege die BATS-Guards aus p4 als
  Skelett an und lasse sie gegen den unimplementierten Stand laufen,
  expected: FAIL. Befehl:
  `tests/unit/lib/bats-core/bin/bats tests/spec/basic-invoices.bats`.
  Erst danach beginnt die Implementierung der Partials p1 bis p3.
- [ ] **1. Partial p1 ausführen** (`tasks.d/p1-invoice-core.md`): Lib, Migration.
  Verify pro Partial-Plan.
- [ ] **2. Partial p2 ausführen** (`tasks.d/p2-owner-pages.md`): Liste, Detail
  mit Druckansicht. Verify pro Partial-Plan.
- [ ] **3. Partial p3 ausführen** (`tasks.d/p3-owner-actions.md`): Erstellen,
  Zahlungsstatus, Korrektur, Export. Verify pro Partial-Plan.
- [ ] **4. Partial p4 ausführen** (`tasks.d/p4-tests.md`): BATS-Guards und Vitest
  vervollständigen, alle grün. Danach `task test:inventory` regenerieren und
  `components/website/src/data/test-inventory.json` mitcommitten.
- [ ] **5. Finaler Verify-Task.** Alle Partials gemergt, keine Baseline-Einträge
  hinzugefügt, keine Brand-Domain-Literale in Code-Snippets:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
