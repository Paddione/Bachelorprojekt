# Proposal: auto-triage-grounding-T002399

## Why

`scripts/factory/auto-triage.sh` klassifiziert Typ, Severity, Priorität und Areas allein aus Titel und Beschreibung — ohne Kontext und ohne Werkzeuge. Die Triage ist die erste Station jedes Tickets, ein Fehlurteil pflanzt sich durch die ganze Pipeline fort.

## What

STUFE 1 (Boden, immer): Vor dem LLM-Aufruf die Top-N ähnlichen Tickets via `find_similar` holen und als Prompt-Block "Ähnliche Vorgänge" anhängen.

STUFE 2 (optional): Tool-Definitionen aus `GET /tools` an den Prompt anhängen; bei Bedarf eine Nachfassrunde via `POST /tools`. Fail-Soft: fällt Tool-Calling aus, bleibt Stufe 1 aktiv.

_Ticket: T002399_
