---
title: "p4-tests — Render- und Task-Tests"
ticket_id: T016515
domains: [testing]
status: draft
---

# lan-dns-adguard — Implementation Plan

Partial-Plan `p4-tests` fuer T016515. Zieldatei exklusiv:
`tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py`.

## File Structure

| Datei | Ist | Budget |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py` | 0 | 800 |

## Task 1 — Tests (Ausgabe-Verifikation)

Pruefmodus: gerenderte Manifeste (`kubectl kustomize`, skip ohne kubectl)
und Skript-/Task-Ausgabe, kein Quelltext-grep.

1. Deployment `adguard`: 2 Replicas, required Anti-Affinity auf hostname,
   Image-Tag nicht `latest`, `dnsPolicy: None`.
2. Service `adguard-dns`: `LoadBalancer` mit 53/UDP und 53/TCP;
   Positiv-Anker: Service existiert. Kein Service/Ingress exponiert 3000
   ausser `adguard-ui` als ClusterIP.
3. Schleifen-Guard: alle `upstream_dns`- und `bootstrap_dns`-Eintraege der
   gerenderten ConfigMap enthalten eine IP, keinen Hostnamen
   (Positiv-Anker: Liste nicht leer).
4. `DRY_RUN=1 lan-dns-firewall.sh` mit Test-Inventar: je k3s-Host beide
   Port-53-Regeln, Client-Peers nicht enthalten.
5. `k3s-install.sh` DRY_RUN bleibt gruen (bestehende Tests).

Rot-Nachweis vor p1/p2: `python3 -m pytest -q tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py`
-> expected: FAIL. Nach p1/p2 -> expected: PASS.
