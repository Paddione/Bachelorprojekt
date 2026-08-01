---
title: "release-notes-erden — Implementation"
ticket_id: T002403
status: completed
---

# release-notes-erden — Stufe 1 umgesetzt

**Was:** `scripts/vda/release-notes.sh` lädt jetzt pro PR das zugehörige Ticket aus der DB (via `[T00XXXX]`-Pattern im PR-Titel) und nutzt Typ und Areas für bessere Sektions-Gruppierung.

**Implementierung:** Neue `_ticket_context()`-Funktion mit deterministischem Fallback — bei DB-Ausfall wird wie bisher der konventionelle Commit-Typ aus dem PR-Titel erkannt.
