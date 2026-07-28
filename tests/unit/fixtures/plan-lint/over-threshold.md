---
title: Over Threshold Plan
ticket_id: T000910
domains: [infra]
status: active
---

# Over Threshold Implementation Plan

**Goal:** Demonstrate a B1b warning (still exit 0).

Die Zieldatei ist bewusst eine **baselined** Datei [T002452]. Bei einer solchen gilt
`effective_threshold = max(limit, baseline.metric) = metric`, das Restbudget ist also
strukturell 0 — unabhaengig davon, wie die Limits in `docs/code-quality/gates.yaml`
stehen. Vorher zeigte diese Fixture auf `k3d/talk-transcriber/app.py` (648 Zeilen gegen
das statische `.py`-Limit 600); sie wurde rot, sobald jemand dieses Limit anhob. Ein
Anker, der von einer Konfigurationszahl abhaengt, prueft die Konfiguration statt B1b.

## File Structure

| File | Ist | Budget |
|------|-----|--------|
| `website/src/components/inbox/InboxApp.svelte` | 954 | 0 |

## Task 1: Edit

- [ ] **Step 1: Write the failing test**

```bash
@test "x" { run true; }
```

- [ ] **Step 2: Run to verify it fails**

Run: `bats x`
Expected: FAIL

## Task 2: Verify

- [ ] **Step 1**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
