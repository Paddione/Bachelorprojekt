---
title: "p3-runbook — Betrieb und Cutover"
ticket_id: T016515
domains: [infra]
status: draft
---

# lan-dns-adguard — Implementation Plan

Partial-Plan `p3-runbook` fuer T016515. Zieldatei exklusiv:
`docs/runbooks/devmesh-lan-dns.md`.

## File Structure

| Datei | Ist | Budget |
| `docs/runbooks/devmesh-lan-dns.md` | 0 | n/a |

## Task 1 — Runbook schreiben

Abschnitte:

1. Zweck und Aufbau (Fritzbox -> 10.10.10.2 -> AdGuard, Ausweich 9.9.9.9;
   DHCP bleibt auf der Fritzbox).
2. Deploy: `task devmesh:dns:deploy`, `task devmesh:dns:check`.
3. Ausfalltest vor dem Cutover: Replica loeschen, `dns:check`; dann
   `kubectl -n lan-dns scale deploy/adguard --replicas=0`, pruefen dass
   `dig @10.10.10.2` scheitert, wieder hochskalieren.
4. Fritzbox-Umstellung: Internet -> Zugangsdaten -> DNS-Server ->
   "Andere DNSv4-Server verwenden", bevorzugt 10.10.10.2, alternativ 9.9.9.9.
   Danach von einem LAN-Client `dig @10.0.0.1 <name>` und Query-Log in der UI.
5. Ausfalltest nach dem Cutover: AdGuard auf 0 skalieren, `dig @10.0.0.1`
   muss weiter antworten (Fritzbox nutzt 9.9.9.9). Ergebnis festhalten.
6. Rueckweg: Fritzbox auf "DNSv4-Server des Internetanbieters".
7. Web-UI per `kubectl -n lan-dns port-forward svc/adguard-ui 3000`;
   Aenderungen dort sind fluechtig, Quelle ist `dev-local/lan-dns/AdGuardHome.yaml`.
8. Optional IPv6 (DNSv6) und Abbau des Pi-AdGuard nach Cutover.

Akzeptanzkriterien:

- Jeder Operator-Schritt hat einen ausfuehrbaren Pruefbefehl.
