---
title: "unterstuetzermodelle-limits-e4b — Implementation Plan"
ticket_id: T007033
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# unterstuetzermodelle-limits-e4b — Implementation Plan

_Ticket: T007033_

## File Structure

```
.opencode/agent-models.jsonc                             MODIFIED  — Limits 32768/4096 + Slot-Ersetzung gemma-4-12b@ud-iq3_xxs -> gemma-4-e4b@ud-q4_k_xl
tests/spec/local-llm-proxy/support-model-slots.bats      MODIFIED  — Guard P2.5: D1-Baseline-Skip, Limits-Pinning, bash-c-Quote-Fix
website/src/data/test-inventory.json                     REGEN     — task test:inventory (falls Guards das Inventar aendern)
```

## Partials

| Partial | Dateien | Rolle |
|---|---|---|
| p1-config | `.opencode/agent-models.jsonc` | Config: Limits + Slot-Ersetzung |
| p2-guard-tests | `tests/spec/local-llm-proxy/support-model-slots.bats`, `website/src/data/test-inventory.json` | Tests: Guard P2.5 (RED → GREEN) |

## Tasks

### Task 1 (p1-config): Limits pinnen und Tablet-Slot auf Gemma 4 E4B umstellen

Im `lmstudio`-Provider-Block von `.opencode/agent-models.jsonc`:

1. `qwen3.5-4b@q6_k`: `limit.output` von 8192 auf **4096** setzen (context bleibt 32768);
   Kommentar über dem Block auf die K3-Messung aktualisieren: Messlauf
   `k3-messung.sh qwen3.5-4b@q6_k 5` (2026-08-15, ~7,8–9,5 tok/s Decode, Thinking nicht
   abschaltbar, Repo-Stand 47c5abca6) — Konvention der Datei, vgl. Zeile 26.
2. Slot `gemma-4-12b@ud-iq3_xxs` **ersetzen** durch `gemma-4-e4b@ud-q4_k_xl`
   (Name „Gemma 4 E4B UD-Q4_K_XL (~2,7 GB, PK-Tablet)", limits `context 32768`,
   `output 4096`).
3. Keine Backend-Port-Literale einfuehren (Spec-Szenario).

Budget-Hinweis: `.opencode/agent-models.jsonc` Ist 594 Zeilen, nicht baselined —
Aenderung ist netto klein (Slots-Block), kein Split noetig.

### Task 2 (p2-guard-tests): Guard P2.5 in support-model-slots.bats

**Failing-Test-Step (RED):**

Die Assertions in `tests/spec/local-llm-proxy/support-model-slots.bats` zuerst auf die
neuen Werte umstellen — der Guard muss gegen den aktuellen Stand (8192 + 12B-Slot)
rot laufen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/support-model-slots.bats
# expected: FAIL (rot — agent-models.jsonc traegt noch 8192 und gemma-4-12b@ud-iq3_xxs)
```

**Fix-Step (GREEN):** Nach Task 1 muss derselbe Lauf gruen sein.

Guard-Inhalte (Reviewer-Findings P2.5 aus T006840):

1. **Test 3 (D1-Baseline):** Skip nur, wenn die Discovery exakt dem dokumentierten
   D1-Baseline-Stand entspricht (nur deepseek-IDs) — jede geaenderte, nicht matchende
   Modellliste bleibt rot (D1-Mismatch-Fall), statt zu skippen.
2. **Test 1 (Limits-Pinning):** `limit.output` auf 4096 pinnen und den E4B-Slot
   `gemma-4-e4b@ud-q4_k_xl` statt des 12B-Slots pruefen.
3. **Quote-Fix:** Das `bash -c`-Single-Quote-Einbettungskonstrukt auf direkte
   Argument-Uebergabe umstellen (kein Inline-`bash -c '…'` um einen Pruefbefehl).

Budget-Hinweis: `support-model-slots.bats` Ist 151 Zeilen, nicht baselined — Platz fuer
die P2.5-Ergaenzung vorhanden.

### Task 3 (p2-guard-tests): Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusaetzlich nach Test-Aenderungen: `task test:inventory` und
`website/src/data/test-inventory.json` mitcommitten (CI-Inventar-Check failt sonst).
