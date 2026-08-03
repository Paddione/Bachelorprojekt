---
title: "auto-triage-grounding-T002399 — Implementation Plan"
ticket_id: T002399
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# auto-triage-grounding-T002399 — Implementation Plan

_Ticket: T002399_

## File Structure

```
CHANGED:
  scripts/factory/auto-triage.sh    — add retrieval context block + optional tool block
NEW:
  tests/spec/auto-triage-grounding-T002399.bats — test that grounding context appears in prompt
```

## Tasks

### 1. STUFE 1 — Retrieval-Kontext vor LLM-Aufruf

Nutze `scripts/factory/scout.sh`'s `find_similar`, um vor dem LLM-Aufruf die Top-5 ähnlichen Tickets zu holen. Hänge sie als Prompt-Block "Ähnliche Vorgänge" an den Baustein-Prompt in `auto-triage.sh` Zeile 184-188 an.

```bash
tests/spec/auto-triage-grounding-T002399.bats
# expected: FAIL — Test prüft, ob Prompt "Ähnliche Vorgänge" enthält
```

### 2. STUFE 2 — Optionale Tool-Runde

Tool-Definitionen aus `GET /tools` (llama.cpp) an den Prompt anhängen. Nach dem ersten LLM-Resultat optional eine Nachfassrunde via `POST /tools`. Fail-Soft: bei Fehlschlag → Stufe 1 ohne Tool-Runde.

### 3. Tests & CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
