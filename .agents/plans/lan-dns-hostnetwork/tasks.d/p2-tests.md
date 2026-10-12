---
title: "p2-tests — Tests fuer hostNetwork-Design"
ticket_id: T016520
domains: [testing]
status: draft
---

# lan-dns-hostnetwork — Implementation Plan

Partial-Plan `p2-tests` fuer T016520.

## File Structure

| Datei | Ist | Budget |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py` | 185 | 615 |

## Task 1 — Rot (liegt vor) und Gruen

Rot: `python3 -m pytest -q tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py`
-> expected: FAIL. Nach p1 derselbe Befehl -> expected: PASS.
Abgedeckt: DaemonSet/hostNetwork/nodeSelector, kein LoadBalancer/NodePort/hostPort
auf 53, Init-Befehl lokal ausgefuehrt setzt bind_hosts, Deploy-Skript-Reihenfolge
mit Vor-/Nachpruefung und Rueckbau.
