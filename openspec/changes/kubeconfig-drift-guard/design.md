---
ticket_id: null
plan_ref: null
status: active
date: 2026-08-23
---

# Design: kubeconfig-drift-guard

## Why

Am 2026-08-23 sprang der Context `k3d-mentolder-dev` nach einem WSL/Docker-Restart
auf den lokalen k3d zurück (127.0.0.1:6446 statt LAN 10.0.33.1:6446) — bei
GLEICHEM Context-Namen. ~35 min lang schrieb das Ticket-Tooling via `kubectl exec`
in die ALTE lokale DB, während der LAN-Cluster die Wahrheit hielt; beide DBs
vergaben dieselben external_ids an unterschiedliche Tickets (Incident T015008,
Folge-Incident T015005).

Root Cause der Schadensklasse: `ticket.sh`/`_ticket-core.sh` vertrauen dem
Context-Namen (`CTX`) blind. Der Name sagt nichts über die Server-Adresse — genau
das dokumentiert auch die bestehende Anmerkung in scripts/ticket.sh:106 („wie ein
Cluster heisst, sagt nichts darüber, in welchem Namespace er seine Datenbank betreibt").

## What

Ein Guard, der vor schreibenden Ticket-Kommandos den **aufgelösten Server-Host**
des Contexts prüft und bei Loopback hart abbricht.

## Decisions

| Frage | Entscheidung | Begründung |
|---|---|---|
| Was wird geprüft? | Server-Host des Contexts aus `kubectl config view`, nicht der Context-Name | Der Vorfall hatte identischen Namen bei abweichendem Host |
| Fail-Kriterium | Loopback (127.0.0.0/8, ::1, localhost) | Die Shared-DBs der Brands liegen auf dem LAN-Cluster; ein lokaler k3d ist für Writes niemals korrekt |
| Escape-Hatch | `TICKET_ALLOW_LOCAL_CTX=1` → Warnung statt Abbruch | Bewusste Local-Dev-Sessions bleiben möglich; Warnung hält die Sichtbarkeit |
| Einhängepunkt | ticket.sh nach CTX-Auflösung, nur im Write-Kommando-Set; `TICKET_OFFLINE=1` überspringt den Guard (kein Clusterzugriff) | Single choke point vor `_exec_sql`; Offline-Pfad berührt die DB gar nicht |
| Reads | nicht guardiert (Non-Goal) | Split-Brain-Schaden entstand durch Writes; Read-Guard würde jeden Diagnosepfad triggern |

## Non-Goals

- Kein automatisches Zurückbiegen des Contexts — nur fail-loud.
- Keine Prüfung weiterer Write-Pfade (Factory-Lanes nutzen denselben ticket.sh-Choke-Point).
