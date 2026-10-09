---
title: brett-vision-training
ticket_id: T901676
domains: [e2e, brett]
status: propose
---
# brett-vision-training — Implementation Plan

Vision-Modelle üben Navigation am Brett: scripted Lückenschluss
(Replay-Flag, Whiteboard-funktional, Brett-Audit), 5 kuratierte
Brett-Flows in neuer SSOT, Bench-Läufe beider E4B-Varianten dev →
prod plus Report. Harness-Kern aus T901645 bleibt unverändert.
Details: `proposal.md`, `design.md`, Partials in `tasks.d/`.

## File Structure

| path | status | purpose |
|------|--------|---------|
| `tests/e2e/specs/brett-replay.spec.ts` | neu | Replay-Flag-Spec, flag-sensitiv |
| `tests/e2e/specs/fa-24-whiteboard.spec.ts` | erweitert | funktionale Whiteboard-Checks |
| `tests/e2e/specs/brett-*.spec.ts` | erweitert | Audit-Lücken in passenden Dateien |
| `tests/e2e/agent/curated-brett.json` | neu | SSOT der Brett-Vision-Flows |
| `docs/runbooks/e2e-vision-agents.md` | erweitert | Brett-Sektion mit Report |
| `components/website/src/data/test-inventory.json` | generiert | via `task test:inventory` |

Budgets: `tests/e2e/specs/fa-24-whiteboard.spec.ts` Ist 18,
nicht-baselined, `.ts`-Limit 900 → Budget 882. Neue Dateien mit
Wachstumsreserve unter Limit geschnitten. `.json`/`.md` stehen nicht
in `s1.limits`, generiertes Inventar ohne Claim. Audit-Edits nur nach
`residual_budget`-Prüfung mit positivem Rest.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-scripted-gaps.md | impl | `tests/e2e/specs/brett-replay.spec.ts`, `tests/e2e/specs/fa-24-whiteboard.spec.ts`, `tests/e2e/specs/brett-*.spec.ts`, `components/website/src/data/test-inventory.json` |  |
| p2 | tasks.d/p2-curated-flows.md | impl | `tests/e2e/agent/curated-brett.json` | p1 |
| p3 | tasks.d/p3-bench-devprod.md | tests | `docs/runbooks/e2e-vision-agents.md` | p1, p2 |

## Task 1: RED-Nachweis (failing test)

- `cd tests/e2e && BRETT_URL="$BRETT_URL" npx playwright test brett-replay` — expected: FAIL
- Erstfassung der Replay-Spec läuft rot vor der Finalisierung (p1,
  Task 1); der Grünlauf folgt in p1, Task 2.

## Task 2: Finale Verifikation

- `task test:changed` — gezielte Tests für geänderte Domains
- `task freshness:regenerate` — generierte Artefakte aktualisieren
- `task freshness:check` — CI-Äquivalent (Freshness + S1–S4-Ratchet + Baseline-Assertion)
