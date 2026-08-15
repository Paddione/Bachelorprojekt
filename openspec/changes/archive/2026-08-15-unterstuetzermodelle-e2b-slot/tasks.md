---
title: "unterstuetzermodelle-e2b-slot — Implementation Plan"
ticket_id: T007055
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# unterstuetzermodelle-e2b-slot — Implementation Plan

_Ticket: T007055_

## File Structure

```
.opencode/agent-models.jsonc                             MODIFIED  — Tablet-Slot gemma-4-e4b@ud-q4_k_xl -> gemma-4-e2b@ud-q4_k_xl (2,97 GiB, ctx 16384)
tests/spec/local-llm-proxy/support-model-slots.bats      MODIFIED  — Test 1: E2B-Slot + Limits 16384/4096 nachziehen
website/src/data/test-inventory.json                     REGEN     — nur falls test:inventory Differenzen meldet
```

## Tasks

### Task 1 (Config): Tablet-Slot auf Gemma 4 E2B umstellen

In `.opencode/agent-models.jsonc` den Slot `gemma-4-e4b@ud-q4_k_xl` ersetzen durch
`gemma-4-e2b@ud-q4_k_xl` — Name „Gemma 4 E2B UD-Q4_K_XL (~2,97 GiB, PK-Tablet)",
limits `context 16384` (8-GB-RAM-Budget des Iris-Plus-Tablets) und `output 4096`.
Kommentar: Groesse mit HF-Beleg (3.184.496.736 Bytes), Verweis auf ausstehende
Tablet-K3-Messung. Keine Backend-Port-Literale.

### Task 2 (Guard-Tests): support-model-slots.bats nachziehen

**Failing-Test-Step (RED):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/support-model-slots.bats
# expected: FAIL (rot — Test 1 erwartet nach der Umstellung E2B-Slot + 16384/4096, Config traegt noch E4B)
```

**Fix-Step (GREEN):** Nach Task 1 muss derselbe Lauf gruen sein.

Test 1 auf `gemma-4-e2b@ud-q4_k_xl` mit `limit.context` 16384 und `limit.output` 4096
umstellen (gezielt je Slot-Eintrag, bestehendes slot_entry-Muster beibehalten).

### Task 3: Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Nach Test-Aenderungen: `task test:inventory` und `website/src/data/test-inventory.json`
mitcommitten (CI-Inventar-Check failt sonst).
