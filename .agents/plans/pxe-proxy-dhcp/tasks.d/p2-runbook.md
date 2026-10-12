---
title: "p2-runbook — ufw-Regel fuer DHCP-Broadcasts"
ticket_id: T016505
domains: [infra]
status: draft
---

# pxe-proxy-dhcp — Implementation Plan

Partial-Plan `p2-runbook` fuer T016505. Zieldatei exklusiv:
`docs/runbooks/workstation-cluster-pxe.md`.

## File Structure

| Datei | Ist | Budget |
| `docs/runbooks/workstation-cluster-pxe.md` | 179 | n/a |

## Task 1 — Firewall-Abschnitt ergaenzen

Steps:

1. Unter **Firewall auf dem Server** festhalten: ein PXE-DISCOVER hat die
   Quelladresse 0.0.0.0, eine Regel `from 10.0.0.0/8` laesst ihn nicht
   durch. Benoetigte Regel als Codeblock:
   `sudo ufw allow in on <iface> to any port 67 proto udp`.
2. Beobachtung von 2026-10-12 (gpu-metal) als Beleg in einem Satz nennen.
3. In **Was wo liegt** `--print-dnsmasq-conf` als Diagnoseweg erwaehnen.

Akzeptanzkriterien:

- Eine Zeile enthaelt `ufw allow in on` und `port 67`; `0.0.0.0` ist erwaehnt.
