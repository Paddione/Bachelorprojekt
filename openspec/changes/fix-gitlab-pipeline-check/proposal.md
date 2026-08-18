# Proposal: fix-gitlab-pipeline-check

## Why

Der GitLab-Spiegel läuft als Zweitverifikation (Etappe 1, T011790), aber kein
Werkzeug liest seinen Pipeline-Status. Pipelines ohne Runner stehen auf
`pending` statt `failed` und sehen nicht aus wie ein Fehler; ob die Pipeline
überhaupt startete, ist für Agents unbeantwortbar. „Does even run" fehlt auf
der GitLab-Seite — dieselbe Fehlerklasse wie T012239 auf der GitHub-Seite.
Sekundärbefund 4 aus T012239.

## What

Neues read-only Skript `scripts/gitlab-pipeline-check.sh`: fragt die
öffentliche GitLab-API (Projekt 85496968, letzte Pipeline auf `main`) ab und
klassifiziert: `success` → exit 0; `failed`/`canceled` → exit 1;
`pending`/`running` → exit 2 mit explizitem „kein Runner, kein Urteil";
leere/ungültige Antwort → exit 3 (Nichtleere-Guard, T003109-Semantik). Kein
Token, keine Schreiboperation, kein CI-Gate — Diagnose-Werkzeug für Agents
und Runbooks.

_Ticket: T012267_
