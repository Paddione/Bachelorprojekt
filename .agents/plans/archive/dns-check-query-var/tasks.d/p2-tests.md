---
title: "p2-tests — Umgebungs-NAME darf dns:check nicht beeinflussen"
ticket_id: T016522
domains: [testing]
status: draft
---

# dns-check-query-var — Implementation Plan

## File Structure

| Datei | Ist | Budget |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py` | 212 | 588 |

## Task 1

Rot: `python3 -m pytest -q tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py -k umgebungsvariable` -> expected: FAIL; nach p1 -> expected: PASS.
