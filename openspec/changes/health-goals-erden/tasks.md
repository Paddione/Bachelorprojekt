---
title: "health-goals-llm-fill erden — Implementation Plan"
ticket_id: T002402
domains: [scripts]
status: active
parent_feature: T002397
---

# health-goals-llm-fill erden

_Ticket: T002402_

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | health-goals-kontext | impl | `scripts/health-goals-llm-fill.sh` | — |
| p2 | tests | test | `tests/spec/health-goals-erden.bats` | p1 |

### p1 — health-goals-kontext

1. Goal-Registry des gleichen Präfix-Bereichs vor LLM-Aufruf laden
2. Als `[EXISTING_GOALS]`-Block in Prompt schreiben
3. Kontext-Budget prüfen: nicht CTX_MARGIN des llm-proxy sprengen

### p2 — tests

1. Test: Prompt enthält Nachbarziele des gleichen Präfix
2. Test: Kontext-Payload unter Budget-Grenze

**Files:** `scripts/health-goals-llm-fill.sh`, `tests/spec/health-goals-erden.bats`
