---
title: "factory-parallel-status — Implementation Plan"
ticket_id: T002079
domains: [website, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-parallel-status — Implementation Plan

_Ticket: T002079 — E2E-Proof der parallelen Partialplan-Pipeline (T002074). Multi-Partial-Plan
(3 Partials → `--partials 3` → Gang-Claim von 3 Slots beim Execute)._

Dieser Plan ist zweistufig zerlegt (T002074 Partial-Modus). Der Orchestrator hält diesen Index
(File Structure, Partial-Manifest, finaler Verify-Task); die drei Partial-Task-Listen liegen in
`tasks.d/`. `plan-lint.sh` aktiviert den Partial-Modus über die Existenz von `tasks.d/`.

## File Structure

Union aller Partials (disjunkt — keine Datei in zwei Partials, D1):

```
website/src/lib/parallel-status.ts              (net-new)  P1  — pure Ableitungslogik
website/src/pages/api/factory/parallel-status.ts (net-new) P1  — GET (admin-guard), Gang-Aggregat
website/src/pages/api/factory/force-tick.ts     (net-new)  P1  — POST (admin-guard), force-tick-Flag
scripts/factory/wakeup.sh                        (edit)    P1  — Flag konsumieren + last-tick-at
website/src/components/DevStatusTabs.svelte      (edit)    P2  — Tab `parallel` + Panel + Timer + Button
website/src/pages/admin/pipeline.astro           (edit)    P2  — Tab/ALLOWED-Wiring
website/src/lib/parallel-status.test.ts          (net-new) P3  — vitest (pure Logik)
tests/spec/software-factory.bats                 (edit)    P3  — bats (slot_count/claim-gang + force-tick), STRUCT2
```

## Partials

Gang-Manifest (letzte Zeile ist die Tests-Rolle und trägt den STRUCT2-Failing-Test):

| id | file | role | target_files |
|----|------|------|--------------|
| P1 | tasks.d/p1-backend.md | impl | website/src/lib/parallel-status.ts, website/src/pages/api/factory/parallel-status.ts, website/src/pages/api/factory/force-tick.ts, scripts/factory/wakeup.sh |
| P2 | tasks.d/p2-ui.md | impl | website/src/components/DevStatusTabs.svelte, website/src/pages/admin/pipeline.astro |
| P3 | tasks.d/p3-tests.md | tests | website/src/lib/parallel-status.test.ts, tests/spec/software-factory.bats |

**Ausführungsreihenfolge beim Execute (Gang, 3 Slots):** P3 schreibt zuerst den roten Test
(`expected: FAIL`), P1 macht ihn grün (Backend/Trigger), P2 baut die UI dagegen. Die vitest-Suite
(`website/src/lib/parallel-status.test.ts`) prüft die pure Logik unabhängig. Details je Partial in
den `tasks.d/`-Dateien; jede Partial-Datei notiert ihre S1-Budgets (alle komfortabel: 3× net-new
`.ts` = 600 frei, `wakeup.sh` 195/500, `DevStatusTabs.svelte` 114/500, `pipeline.astro` 32/400;
Test-Dateien S1-exempt).

## Verify (final — STRUCT3)

Der abschließende Verifikations-Task nach allen drei Partials. Führt das CI-Äquivalent inkl.
S1–S4-Ratchet aus. Nach Test-Änderungen zusätzlich das Test-Inventar regenerieren und committen.

- [ ] **Rot→Grün-Nachweis (aus P3).** Der STRUCT2-Failing-Test in `tasks.d/p3-tests.md`
      (`tests/spec/software-factory.bats`, Force-Tick-Flag-Grep) ist vor P1 rot und nach P1 grün.
      vitest der puren Logik läuft grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
(cd website && pnpm vitest run src/lib/parallel-status.test.ts)
```

- [ ] **Test-Inventar (nach Test-Änderungen Pflicht).** Neue `@test`/vitest-Fälle ins Inventar
      aufnehmen und mitcommitten:

```bash
task test:inventory
```

- [ ] **Finale Verifikation — die drei mandatorischen CI-Gates:**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
