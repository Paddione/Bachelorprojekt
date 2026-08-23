# Proposal: kubeconfig-drift-guard

## Why

Der Context `k3d-mentolder-dev` löste am 2026-08-23 nach einem WSL/Docker-Restart
auf den lokalen k3d zurück auf (127.0.0.1:6446 statt LAN 10.0.33.1:6446) — bei
gleichem Context-Namen. ~35 min schrieb das Ticket-Tooling in die falsche DB;
beide Instanzen vergaben dieselben external_ids an unterschiedliche Tickets
(Incident T015008; Folge-Schaden T015005: gelöschte Zeile + ID-Reuse + falsche
Closure).

`ticket.sh` vertraut dem Context-Namen blind; `_exec_sql` feuert `kubectl exec
--context "$CTX"` gegen den zuerst besten Cluster. Der Context-Name beweist
nichts über die Server-Adresse.

## What

Neuer Guard `scripts/vda/ticket/_ctx-guard.sh`: vor jedem schreibenden
Ticket-Kommando wird der aufgelöste Server-Host des Contexts geprüft. Loopback
(127.0.0.0/8, ::1, localhost) → harter Abbruch mit drift-diagnostischer Meldung.
Escape-Hatch `TICKET_ALLOW_LOCAL_CTX=1` (Warnung statt Abbruch) für bewusste
Local-Dev-Sessions; `TICKET_OFFLINE=1` überspringt den Guard (kein Clusterzugriff).
Eingehängt in `scripts/ticket.sh` direkt nach der CTX-Auflösung, nur für das
Write-Kommando-Set.

Ein Struktur-/Output-Guard (`tests/spec/db-guard/`, 5 Tests) hält die Zusicherung
fest — RED bei Auslieferung dieses Plans.

Operator-Freigabe vom 2026-08-23 (auf dem Ticket protokolliert): zusätzlich zum
Repo-Guard wird der lokale k3d-Cluster endgültig gelöscht (`k3d cluster delete`),
um die Resurrect-Klasse zu eliminieren — operativer Halbteil außerhalb des Repos,
kein Code-Artefakt.

_Ticket: T015008_
