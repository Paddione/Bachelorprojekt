# llm-proxy-group-readiness — Proposal

## Zweck

Fix für T003202: `/health` meldet dauerhaft `ready=false`, weil die
Readiness-Definition ("enabled backends with priority = 1") mit der
exclusiveGroup-Semantik (nur EIN Loadout der Gruppe läuft gleichzeitig)
unvereinbar ist. Acht GPU-Loadouts teilen sich 16 GB VRAM — per Definition
können nie alle gleichzeitig healthy sein.

## Lösungsrichtung (User-Entscheid: a)

exclusiveGroup-Geschwister gelten als **Gruppe**: die Gruppe ist healthy,
wenn mindestens ein Mitglied healthy ist. `ready=true` wird damit erreichbar.

## Nicht im Scope

- Port-8093-Kollision (brain-ingest vs llm-gateway-rerank) — eigener Vorgang
- bge-Aufnahme in den Proxy — eigener Vorgang
- Loadout-Umbau aus T003460-Folge — eigene Tickets
