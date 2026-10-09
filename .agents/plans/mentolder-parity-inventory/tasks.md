---
title: "mentolder-parity-inventory — Mentolder capability and data parity inventory"
ticket_id: T901033
domains: [website, billing, docs]
status: active
---

# mentolder-parity-inventory — Implementation Plan

## File Structure

- `docs/parity/mentolder-flows-core.md`: neu, Kernpfade Buchung bis Rechnung.
- `docs/parity/mentolder-auth-isolation.md`: neu, Auth und Isolation.
- `docs/parity/mentolder-flows-remaining.md`: neu, übrige Flows und Jobs.
- `docs/parity/mentolder-parity-matrix.md`: neu, Matrix und Vergleich.
- `tests/spec/mentolder-parity-inventory.bats`: neu, Spec-Guards.

## Zweck

Belegte Inventur des Mentolder-Bestands: Kernpfade zuerst (Buchung bis
Rechnung inkl. Auth/Isolation), danach übrige Flows, Integrationen, Jobs,
Migrationen und Asset-Konsumenten. Jeder Eintrag mit exakter Quell-Evidenz
und Klassifikation retain, extract, replace oder defer, dazu Mom-MVP-Vergleich
und Staging-Baseline-Verfahren ohne Echtdaten.

## Scope and evidence

Work only in the worktree on `chore/mentolder-parity-inventory-T901033`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.
Decisions aus nicht-interaktivem Brainstorming 2026-10-09: Baseline ist ein
STAGING-Klon ohne Echtdaten, Prod wird nie berührt; Kernpfade zuerst;
Vor-Evidenz (Checkout 0ff76b4, K3-Graph) wiederverwenden und verifizieren;
Tenant-Befunde als Audit-Befunde kartieren; SDLC/LLM/Coaching per Default
außerhalb des Kerns. Alle Targets sind neue `.md`/`.bats`-Dateien ohne
S1-Limit.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-core-flows.md | impl | `docs/parity/mentolder-flows-core.md` |  |
| p2 | tasks.d/p2-auth-isolation.md | impl | `docs/parity/mentolder-auth-isolation.md` |  |
| p3 | tasks.d/p3-remaining-flows.md | impl | `docs/parity/mentolder-flows-remaining.md` |  |
| p4 | tasks.d/p4-parity-matrix.md | impl | `docs/parity/mentolder-parity-matrix.md` | p1, p2, p3 |
| p5 | tasks.d/p5-tests.md | tests | `tests/spec/mentolder-parity-inventory.bats` | p1, p2, p3, p4 |

## Tasks

- [x] **0. Rotphase: Failing-Test-Step zuerst.** Die BATS-Guards aus p5 als
  Skelett anlegen und gegen den leeren Stand laufen lassen,
  expected: FAIL. Befehl:
  `bats tests/spec/mentolder-parity-inventory.bats`.
  Erst danach beginnt die Inventur-Arbeit der Partials p1 bis p4.
- [x] **1. Partial p1 ausführen** (`tasks.d/p1-core-flows.md`): Kernpfade
  Buchung bis Rechnung. Verify pro Partial-Plan.
- [x] **2. Partial p2 ausführen** (`tasks.d/p2-auth-isolation.md`): Auth,
  Tenant-Identität, Isolation. Verify pro Partial-Plan.
- [x] **3. Partial p3 ausführen** (`tasks.d/p3-remaining-flows.md`): Übrige
  Flows, Integrationen, Jobs. Verify pro Partial-Plan.
- [x] **4. Partial p4 ausführen** (`tasks.d/p4-parity-matrix.md`):
  Migrationen, Assets, Klassifikation, Mom-MVP, Baseline. Verify pro
  Partial-Plan.
- [x] **5. Partial p5 ausführen** (`tasks.d/p5-tests.md`): Guards
  vervollständigen, alle grün.
- [x] **6. Finaler Verify-Task.** Alle Partials gemergt, keine
  Baseline-Einträge hinzugefügt, keine Prod-Berührung, alle Aussagen belegt:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
