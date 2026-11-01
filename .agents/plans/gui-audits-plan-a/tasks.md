---
title: "gui-audits-plan-a — K6-Baseline Website-Beleg + sdlc/brett-axe + docs-Smoke (Goal-Kriterium 6, Staffel A)"
domains: [website]
status: active
goal: frontend-domain-ssot
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gui-audits-plan-a — Implementation Plan

Zweck (Deutsch): Kriterium 6 des Goals `frontend-domain-ssot`, Staffel A —
für website den GUI-Standard per Beleglauf nachweisen (Suite existiert),
sdlc-console und brett/whiteboard um axe-Assertions erweitern (kein
serious/critical), docs per Minimal-Suite (Render-Smoke + interne Links)
abdecken. Mentolder-web (reduziert, D1-sekundär) und Voll-Fixes folgen in
Staffel B bzw. Folge-PRs — Befunde über Triviales hinaus werden NICHT hier
gefixt, sondern mit Beleg in den PR-Body geschrieben.

Brainstorming-Entscheidungen (2026-11-01, mit Eigner abgestimmt):
- **B1 Gestaffelt**: Plan A = website-Beleg + sdlc/brett-axe + docs-Smoke.
  Plan B (danach) = mentolder-web reduzierte Suite (Redirect + Smoke + axe, D4).
- **B2 Messumgebung**: website-Belege gegen live (`https://web.mentolder.de`,
  öffentliche Routen, kein Auth nötig — wie Nightly `e2e.yml`); sdlc/brett/docs
  gegen lokale Dev-Server (bestehende Skip-Pattern `SDLC_E2E_URL`/`BOARD_URL`
  wiederverwenden).
- **B3 Fix-Grenze**: axe-Befunde, die mehr als Triviales (eindeutige
  Ein-Zeilen-Fixes im getesteten Template) brauchen, → Folge-PR mit Befund +
  Screenshot im PR-Body. Kein Scope-Creep in diesem Plan.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `tests/e2e/specs/fa-66-sdlc-frontend-sweep.spec.ts` | 96 | 900 (.ts-Limit 900, Plan ≈ +40 axe je Route) |
| `tests/e2e/specs/fa-24-whiteboard.spec.ts` | 49 | 900 (.ts-Limit 900, Plan ≈ +25 axe-Test) |
| `tests/e2e/specs/docs-smoke.spec.ts` | 0 (neu) | 900 (.ts-Limit 900, Plan ≈ 60) |
| `tests/e2e/playwright.local.config.ts` | 148 | 900 (.ts-Limit 900, Plan +1 Match-Zeile) |
| `docs/agent-guide/gui-audit-evidence-a.md` | 0 (neu) | n/a (`.md` ungated, Mess-Beleg wie `agent-board/messung.md`) |

Verbraucht: `tests/e2e/specs/a11y-axe.spec.ts` (unverändert lesen — wcag2aa,
0 critical/serious), `tests/e2e/lib/public-routes.json` (Routenquelle),
`lighthouserc.json` (Perf ≥ 90 Assertion). Produziert: grüne Läufe + Evidenz-Doc.
S4: jede Spec läuft einzeln per `npx playwright test <datei> --config ...`.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-sdlc-axe.md | impl | `tests/e2e/specs/fa-66-sdlc-frontend-sweep.spec.ts` |  |
| p2 | tasks.d/p2-brett-axe.md | impl | `tests/e2e/specs/fa-24-whiteboard.spec.ts` |  |
| p3 | tasks.d/p3-docs-smoke.md | impl | `tests/e2e/specs/docs-smoke.spec.ts`, `tests/e2e/playwright.local.config.ts` |  |
| p4 | tasks.d/p4-evidence.md | tests | `docs/agent-guide/gui-audit-evidence-a.md` | p1, p2, p3 |

## Tasks

- [ ] **1. Partial p1** (`tasks.d/p1-sdlc-axe.md`): axe je `/sdlc/*`-Route.
- [ ] **2. Partial p2** (`tasks.d/p2-brett-axe.md`): axe-Test fürs Whiteboard.
- [ ] **3. Partial p3** (`tasks.d/p3-docs-smoke.md`): docs Render-Smoke + Link-Check.
- [ ] **4. Partial p4** (`tasks.d/p4-evidence.md`): Website-Belegläufe
  (Playwright + axe + Lighthouse) + Evidenz-Doc + PR-Body-Belege.
- [ ] **5. Finaler Verifikations-Task.** `task test:changed`,
  `task freshness:regenerate`, `task freshness:check`.
