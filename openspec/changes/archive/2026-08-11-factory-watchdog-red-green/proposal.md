# Proposal: Factory-Watchdog RED-GREEN Gap

## Problem

Zehn `plan_staged`-Tickets (T003182, T003180, T003143, T003139, T003142, T003109, T002930, T003141, T003215, T002934) hängen seit Tagen in einer Endlosschleife: Der Watchdog erkennt den Stillstand, setzt die Tickets zurück, die Factory dispatcht sie erneut — aber die Implementierung (GREEN) wird nie erreicht. Die Branches tragen exakt zwei Commits: den Anker-Commit und den RED-Commit mit dem failing test. Die Implementierung fehlt.

Die Watchdog-Kommentare zeigen das Muster: "Watchdog: pipeline stale > 30min (no phase progress write, class=MODEL). Plan already staged — resuming via plan_staged".

## Root Cause

Der Watchdog-Attempt-Counter (`factory_attempt:<external_id>` in `tickets.factory_control`) wird durch JEDEN `factory_phase_events`-Eintrag zurückgesetzt — auch durch `state='entered'`-Ereignisse. Wenn die Pipeline die Implement-Phase betritt (`phase_event implement entered`), sieht der Watchdog dies als "Fortschritt" und setzt den Zähler auf 1 zurück. Die lokale Modellstufe (flash tier) scheitert reproduzierbar an der Implementierung, aber der Zähler erreicht nie den Schwellwert für die Eskalation (MAX_ATTEMPTS=3).

**Betroffener Code:** `scripts/factory/watchdog.sh` Zeilen 134-157 — die `prog`-CTE im Attempt-Counter-UPSERT zählt ALLE `factory_phase_events`-Einträge, ohne nach `state` zu filtern.

**Spezifikations-Lücke:** `openspec/specs/software-factory.md` Zeilen 202-204 definieren "echten Fortschritt" als "existiert ein factory_phase_events-Eintrag, dessen at neuer ist als das updated_at des Zählers". Der Begriff "echter Fortschritt" impliziert abgeschlossene Arbeit, aber die Implementierung behandelt auch `entered`-Ereignisse als Fortschritt.

## Fix

**Watchdog:** Die `prog`-CTE so ändern, dass sie nur Phase-Events mit `state IN ('done', 'partial-done', 'blocked')` zählt. `entered`-Ereignisse ohne korrespondierendes `done`/`blocked` gelten nicht als Fortschritt.

**Spezifikation:** Die Anforderung in `software-factory.md` präzisieren: "echter Fortschritt" definiert als Phase-Event mit `state IN ('done', 'partial-done', 'blocked')`.

## Auswirkung

Nach dem Fix läuft der Zähler für die 10 betroffenen Tickets ungehindert hoch und erreicht nach 3 Watchdog-Runden (90 Minuten) den Schwellwert. Dann greift die bestehende Eskalation (`ticket.sh unfactory` → `blocked` + `needs_human`). Die Tickets werden sichtbar als blockiert markiert, statt unsichtbar zu loopen.

Langfristig: Die Modell-Eskalationsleiter (flash → haiku → sonnet) wird nach dem ersten Fehlschlag tatsächlich durchlaufen, weil der Zähler nicht mehr zurückgesetzt wird. Ein stärkeres Modell kann die Implementierung möglicherweise erfolgreich abschließen.
