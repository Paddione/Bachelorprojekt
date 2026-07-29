---
title: "release-notes erden: Ticket-Kontext zu gemergten PRs"
domains: [scripts]
ticket_id: T002403
status: active
parent_feature: T002397
---

# release-notes erden

**Ticket:** T002403

## Problem

`scripts/vda/release-notes.sh` formuliert Release Notes aus PR-Titeln ohne das
Warum — Ticket-Beschreibung, Typ und Areas fehlen.

## Lösung

Stufe 1: Zu jeder gemergten PR das Ticket laden (ID via `[T00XXXX]` im Titel),
Typ/Areas/Beschreibung als Prompt-Kontext mitgeben → Notes gruppieren nach Bereich.

## Fallback

Deterministischer Pfad muss erhalten bleiben: fällt Ticket-Abfrage aus, werden
Notes weiterhin erzeugt, nur ohne Kontext.
