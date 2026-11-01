---
title: "gui-audits-plan-b — K6 reduziert für mentolder-web (Smoke + axe, D4) (Goal-Kriterium 6, Staffel B)"
domains: [website]
status: active
goal: frontend-domain-ssot
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gui-audits-plan-b — Implementation Plan

Zweck (Deutsch): Kriterium 6 des Goals `frontend-domain-ssot`, Staffel B —
reduzierte GUI-Abdeckung für `react.mentolder.de` (Smoke Kernrouten + axe,
kein serious/critical). Volle Suite entfällt per Eigner-Entscheidung (D1:
sekundär); Docs waren Staffel A; Website/sdlc/brett sind belegt.

 Lage (2026-11-01, verifiziert): `react.mentolder.de` liefert live **200 +
 Voll-SPA** (nginx/Vite), steht in KEINEM Manifest und fehlt in der Registry —
 D1-Aussage („sekundär/Redirect") ist überholt. Als Issue [#7051](
 https://github.com/Paddione/Bachelorprojekt/issues/7051) erfasst
 (Infra-Entscheidung Redirect-vs-Registrieren = Folge-Arbeit, NICHT dieser
 Plan). **D4** (dieser Plan, dokumentiert in `gui-audit-evidence-b.md`):
 Bis zur #7051-Entscheidung gilt reduzierte K6-Suite gegen den live Host.
 Messumgebung live folgt Plan-A-Präzedenz B2 (öffentliche Routen, kein Auth).

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `tests/e2e/specs/mentolder-web-smoke.spec.ts` | 0 (neu) | 900 (.ts-Limit 900, Plan ≈ 90) |
| `docs/agent-guide/gui-audit-evidence-b.md` | 0 (neu) | n/a (`.md` ungated, D4 + Mess-Beleg) |

Verbraucht: `tests/e2e/specs/docs-smoke.spec.ts` (51, Muster: Render-200 +
Platzhalter-Smoke + Link-Deckel), `tests/e2e/specs/a11y-axe.spec.ts`
(Axe-Muster, Tags, 0-critical/serious-Filter), `App.tsx`-Routen
(`/`, `/leistungen`, `/kontakt`, `/impressum`, `/barrierefreiheit`).
S4: `npx playwright test mentolder-web-smoke` (Nightly-`playwright.config.ts`,
neues Spec-Match ggf. nötig — siehe p1).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-smoke-axe.md | impl | `tests/e2e/specs/mentolder-web-smoke.spec.ts` |  |
| p2 | tasks.d/p2-evidence.md | tests | `docs/agent-guide/gui-audit-evidence-a.md`, `docs/agent-guide/gui-audit-evidence-b.md` | p1 |

Hinweis zu p2-Targets: `gui-audit-evidence-a.md` (Staffel A, gemergt) wird
nur um einen Verweis-Absatz auf Staffel B ergänzt (Ein-Zeilen-Anhang, kein
Rewrite) — Alternative (nur evidence-b) wurde verworfen, weil K6 einen
geschlossenen Belegstand je Staffel verlangt und A ohne Rückverweis offen
wirkte. Disjunkt zu allen anderen Partials (D1 ok).

## Tasks

- [ ] **1. Partial p1** (`tasks.d/p1-smoke-axe.md`): Smoke + axe Spec bauen.
- [ ] **2. Partial p2** (`tasks.d/p2-evidence.md`): D4 + Beleg-Tabellen +
  Golden/Inventory-Hygiene.
- [ ] **3. Finaler Verifikations-Task.** `task test:changed`,
  `task freshness:regenerate`, `task freshness:check`.
