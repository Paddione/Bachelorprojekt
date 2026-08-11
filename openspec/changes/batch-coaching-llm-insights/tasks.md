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

### P2: Guard-Tests

**Datei:** `tests/spec/coaching/`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/coaching/
# expected: FAIL (rot — Features noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).**

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
