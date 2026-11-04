---
title: "fix/e2e-mentolder-nightly-11 — Nightly E2E (mentolder) 11 Failures: Live-Drift + totes SPA-Artefakt"
domains: [website, e2e]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix/e2e-mentolder-nightly-11 — Implementation Plan

Zweck: Nightly `e2e.yml` / `mentolder` 14/14 rot (27.10.–04.11.) auf 0 Failures bringen. Befundlage (Run 41815883961,
Live-Probes 04.11.): Suite 404/415 grün, Site UP — 11 rote Specs in 3 Clustern, davon 2× Live-Drift (Prod-Code nicht
auf `main`) und 1× totes Test-Artefakt (SPA-Quelle seit #7055 gelöscht). Kein Produkt-Fix auf `main` nötig.
Details: `proposal.md` (Symptom/Evidenz), `design.md` (D1–D6), `discovery.md` (p1, Feldnamen-Belege).

## File Structure

| Datei | Ist-Zeilen | Status |
|---|---|---|
| `.agents/plans/fix-e2e-mentolder-nightly-11/discovery.md` | 0 (neu) | neu (`.md` ungated) |
| `tests/e2e/specs/fa-21-billing.spec.ts` | 104 | ändern (Payloads + 401-Ordering, nicht-baselined, Budget groß) |
| `tests/e2e/helpers/billing.ts` | 53 | ändern (`klientId?` optional, kein `any`, nicht-baselined, Budget groß) |
| `tests/e2e/specs/fa-16-booking.spec.ts` | 73 | ändern (nur T6-Payload, nicht-baselined, Budget groß) |
| `tests/e2e/specs/mentolder-web-smoke.spec.ts` | 68 | LÖSCHEN (D4) |
| `tests/e2e/playwright.config.ts` | 259 | ändern (1 `testMatch`-Zeile raus, schrumpft, nicht-baselined) |
| `tests/e2e/specs/fa-24-whiteboard.spec.ts` | 73 | ändern (nur T-axe skip, nicht-baselined, Budget groß) |
| `.agents/plans/fix-e2e-mentolder-nightly-11/phase-events.log` | 0 (neu) | neu (Plan-Events, `.md` ungated) |
| `.agents/plans/fix-e2e-mentolder-nightly-11/verify.log` | 0 (neu) | neu (RED-/Grün-Nachweis, p6) |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-discovery.md | impl | `.agents/plans/fix-e2e-mentolder-nightly-11/discovery.md` |  |
| p2 | tasks.d/p2-billing.md | impl | `tests/e2e/specs/fa-21-billing.spec.ts`, `tests/e2e/helpers/billing.ts` | p1 |
| p3 | tasks.d/p3-booking.md | impl | `tests/e2e/specs/fa-16-booking.spec.ts` | p1 |
| p4 | tasks.d/p4-smoke-retire.md | impl | `tests/e2e/specs/mentolder-web-smoke.spec.ts`, `tests/e2e/playwright.config.ts` |  |
| p5 | tasks.d/p5-whiteboard.md | impl | `tests/e2e/specs/fa-24-whiteboard.spec.ts` |  |
| p6 | tasks.d/p6-verify.md | tests | `.agents/plans/fix-e2e-mentolder-nightly-11/verify.log` | p2, p3, p4, p5 |

Partials sind disjunkt (keine Datei in zwei impl-Partials). p4/p5 hängen nicht von p1 ab (keine Feldnamen nötig).
p2/p3 starten nicht ohne vollständige `discovery.md` (Fail-Closed, keine geratenen Feldnamen).

## RED-Baseline (vor p2/p3, belegt rot)
- `npx playwright test fa-21-billing` → `expected: FAIL` (3 rote Tests: T3 + 2× PR-A, Stand Nightly 04.11.).
- `npx playwright test fa-16-booking -g "T6"` → `expected: FAIL` (400 statt 409, Stand Nightly 04.11.).
- p4/p5 brauchen keinen lokalen RED-Lauf: ihre Specs sind nightly-rot belegt und werden retiren/ausgenommen, nicht repariert.

## Verify (p6, letzter Task)
1. Gezielte Grün-Läufe je Partial sind in p2/p3/p5 belegt (Logs in `phase-events.log`).
2. `task test:changed` — Repo-Suites zum Diff grün.
3. `task freshness:regenerate` + `task freshness:check` (`generated_artifacts: true`).
4. `plan done $(date -u +%FT%TZ) plan-gestagt` in `phase-events.log` — danach STOPP, Übergabe an `dev-flow-execute`.
5. Gate-Kontrolle außerhalb des Plans: nächste Nightly muss G-E2E01 heben (Eigentümer: CI-Watchdog, nicht dieser Plan).
