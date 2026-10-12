---
title: "p2-tests — Guards auf Live-Modell"
ticket_id: T016528
domains: [testing]
status: draft
---

# tailnet-policy-live — Implementation Plan

## File Structure

| Datei | Ist | Budget |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_check.py` | 177 | 623 |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_policy.py` | 67 | 733 |

## Task 1

Rot: `python3 -m pytest -q tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_check.py tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_policy.py` -> expected: FAIL; nach p1 -> expected: PASS.
