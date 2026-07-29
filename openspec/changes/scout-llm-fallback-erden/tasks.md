---
title: "scout-llm-fallback erden — Implementation Plan"
ticket_id: T002400
domains: [scripts, factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002397
depends_on_plans: []
---

# scout-llm-fallback erden — Implementation Plan

_Ticket: T002400_

## File Structure

```
CHANGED:
  scripts/factory/scout-llm-fallback.sh   — Kontext-Retrieval vor LLM-Aufruf
NEW:
  tests/spec/scout-llm-fallback-erden.bats — Tests für Kontext-Retrieval + Tool-Fallback
```

## Partial Plan

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | scout-llm-retrieval | impl | `scripts/factory/scout-llm-fallback.sh` | — |
| p2 | tests | test | `tests/spec/scout-llm-fallback-erden.bats` | p1 |

### p1 — scout-llm-retrieval

**Rolle:** impl — Kontext-Retrieval in scout-llm-fallback.sh einbauen

1. `find_similar` aus `scout.sh` in `scout-llm-fallback.sh` integrieren (oder als shared lib auslagern)
2. Prompt-Template um `[CONTEXT]`-Block erweitern: ähnliche Tickets + Spec-Chunks
3. Timeout-Handling (5s): bei Timeout leerer Kontext + WARN statt Abbruch
4. Stufe 2: optionalen Tool-Call über `POST /tools` an lokalen llama.cpp
5. Tool-Runden-Limit: max 1 Runde, dann Fallback auf Antwort ohne Tool

**Files:** `scripts/factory/scout-llm-fallback.sh`

### p2 — tests

**Rolle:** test — BATS-Tests für Stufe 1 + 2

1. Test: Ticket ohne ähnliche Vorgänger → leerer Kontextblock, kein Fehler
2. Test: `find_similar`-Timeout → WARN + leerer Kontext
3. Test: LLM-Prompt enthält `[CONTEXT]`-Abschnitt
4. Test: Stufe 2 — Tool-Call wird gesendet, max 1 Runde, dann Fallback

**Files:** `tests/spec/scout-llm-fallback-erden.bats`
