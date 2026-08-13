---
title: "batch-coaching-llm-insights — Implementation Plan"
ticket_id: T003814
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# batch-coaching-llm-insights — Implementation Plan

_Ticket: T003814 — Batch: Coaching+LLM Insight-Features_

## File Structure

```
website/src/lib/coaching/              # Coaching-Logik
website/src/pages/admin/coaching/      # Admin-UI
scripts/coaching/                      # LLM-Integration
tests/spec/coaching/                   # Guards
<!-- vitest: kein neuer Vitest-Test noetig — Coaching-Features werden durch BATS-Guards abgesichert -->
```

## Child Tickets

| Ticket | Titel |
|--------|-------|
| T002652 | Questionnaire-Antworten semantisch analysieren |
| T002653 | Session-Zusammenfassungen per LLM |
| T002656 | Dev-Env: task dev:up |
| T002658 | S1: Retrieval-Schicht |

## Tasks

### P1: Coaching-LLM-Integration

**Dateien:** `scripts/coaching/`, `website/src/lib/coaching/`

- [x] T002652: Questionnaire-Insights — `coaching-questionnaire-insights.ts` (embed/cluster/label/generate), Endpoint, Cache-Migration, Svelte-Komponente
- [x] T002653: Session-Summaries — `coaching-summary.ts` (buildSummaryInput/generateSessionSummary), Endpoint, Migration, Svelte-Komponente
- [x] DSGVO-Pflicht: createSessionAgent + getActiveProvider, DataResidencyError VOR Request, `x-llm-local-only` Header, kein Remote-Fallback (ADR-004)
- [x] Guard-Tests: `tests/spec/coaching/questionnaire-insights.bats` (8) + `session-summaries.bats` (7)
- [x] Vitest: `coaching-questionnaire-insights.test.ts` (11) + `coaching-summary.test.ts` (6) — 17/17 gruen
- [x] Migrationen: `20260813_coaching_questionnaire_insights_cache.sql`, `20260813_coaching_session_summary.sql` + k3d/website-schema.yaml
- [x] UI: QuestionnaireInsights.svelte (settings.astro), SessionSummary.svelte (sessions/[id].astro)

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/coaching/
# expected: FAIL (rot — Features noch nicht implementiert)
```

> RED-Nachweis: BATS zunaechst rot (Features fehlten; zusaetzlich REPO_ROOT-Pfadbug in
> tests/spec/<spec>/ — `$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)` zeigt auf tests/ statt
> Repo-Root, Fix auf `git rev-parse --show-toplevel`; mit korrigiertem Setup waehren die
> Datei-Guards ebenfalls rot gewesen). Vitest-RED: `Cannot find module './coaching-summary'`
> (Module existierten nicht). Beide RED-Lauefe vor der Implementierung dokumentiert.

- [x] **Fix-Step (GREEN).**

> BATS 15/15 gruen, Vitest 17/17 gruen, ESLint clean (`pnpm lint` exit 0), `astro check`
> 0 errors / 0 warnings (75 pre-existing hints auf sdlc-Seiten).

- [x] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

> `task test:changed` exit 1 mit drei analysierten Fehlern: 235 test-inventory.json
> (erwartet — wird durch freshness:regenerate repariert), 71 G-CQ03 ESLint
> (Kontext-Artefakt — direktes `pnpm lint` exit 0 beweist Clean), 616/620
> daemon-runtime-contract.bats (pre-existing/umgebungsbedingt, Branch diff beruehrt diese
> Dateien nicht). Restliche Tests gruen.
