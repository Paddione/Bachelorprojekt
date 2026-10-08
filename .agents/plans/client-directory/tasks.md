---
title: "client-directory — Minimales Kundenverzeichnis mit Terminhistorie"
ticket_id: T901026
domains: [website, clients, owner-workspace]
status: active
---

# client-directory — Implementation Plan

## File Structure

- `components/website/src/lib/clients.ts`: neu, Ableitung, Suche, Dubletten.
- `components/website/src/db/migrations/20261008_clients.sql`: neu oder begründeter Verzicht.
- `components/website/src/pages/owner/kunden.astro`: neu, Owner-Liste mit Suche.
- `components/website/src/pages/owner/kunden/[id].astro`: neu, Detail mit Historie.
- `components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts`: neu, Korrektur.
- `components/website/src/pages/api/owner/kunden/[id]/export.ts`: neu, CSV-Export.
- `components/website/src/pages/api/owner/kunden/[id]/loeschen.ts`: neu, Löschung.
- `components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts`: neu, manueller Merge.
- `tests/spec/client-directory.bats`: neu, Spec-Guards.
- `components/website/src/lib/__tests__/clients.test.ts`: neu, Vitest.

## Zweck

Minimales Kundenverzeichnis für die Inhaberin: Kunden entstehen automatisch
aus Anfragen (E-Mail als Schlüssel), mit Kontakt und Terminhistorie. Suche per
Name oder E-Mail, Korrektur, CSV-Export, Löschung mit Steuerfristen-Hinweis
und manuelle Zusammenführung von Dubletten nach expliziter Bestätigung —
niemals still. Keine Behandlungsnotizen. Zugriff nur für Owner.

## Scope and evidence

Work only in `.worktrees/client-directory` on `feature/client-directory-T901026`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.
Decisions aus Brainstorming 2026-10-08: Quelle Anfragen, Dubletten-Vorschlag,
neue Seite /owner/kunden, Export plus Löschung. Mindestfelder und
Löschfristen folgen T901019 §5-6.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-client-core.md | Client-Core | `components/website/src/lib/clients.ts`, `components/website/src/db/migrations/20261008_clients.sql` |  |
| p2 | tasks.d/p2-owner-pages.md | Owner-Pages | `components/website/src/pages/owner/kunden.astro`, `components/website/src/pages/owner/kunden/[id].astro` | p1 |
| p3 | tasks.d/p3-owner-actions.md | Owner-Actions | `components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts`, `components/website/src/pages/api/owner/kunden/[id]/export.ts`, `components/website/src/pages/api/owner/kunden/[id]/loeschen.ts`, `components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts` | p1 |
| p4 | tasks.d/p4-tests.md | tests | `tests/spec/client-directory.bats`, `components/website/src/lib/__tests__/clients.test.ts` | p1, p2, p3 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst.** Lege die BATS-Guards aus p4 als
  Skelett an und lasse sie gegen den unimplementierten Stand laufen,
  expected: FAIL. Befehl:
  `tests/unit/lib/bats-core/bin/bats tests/spec/client-directory.bats`.
  Erst danach beginnt die Implementierung der Partials p1 bis p3.
- [ ] **1. Partial p1 ausführen** (`tasks.d/p1-client-core.md`): Lib, Migration
  oder begründeter Verzicht. Verify pro Partial-Plan.
- [ ] **2. Partial p2 ausführen** (`tasks.d/p2-owner-pages.md`): Liste mit
  Suche, Detail mit Historie. Verify pro Partial-Plan.
- [ ] **3. Partial p3 ausführen** (`tasks.d/p3-owner-actions.md`): Korrigieren,
  Export, Löschen, Zusammenführen. Verify pro Partial-Plan.
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
