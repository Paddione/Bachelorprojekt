# Partial p4 — requirements_list Schreibweg dokumentieren

**Ticket:** T002471
**Rolle:** `docs`
**Ziel-Dateien:** `.agents/skills/references/ticket-ops-procedures.md`
**Mishap:** M3 (requirements_list Schreibweg nicht genannt)

## Mishap 3

Der Skill text nennt nur `ticket.sh lastenheft lock` aber nicht den vorgelagerten
Schreibbefehl `ticket.sh plan-meta set --requirements`. Das lock-Kommando scheitert
fail-closed wenn requirements_list leer ist.

## Fix

In `.agents/skills/references/ticket-ops-procedures.md`, den Invarianten-Block (ca. Step 3.4)
ergänzen:

```
**Wichtig [T002471-M3]:** Vor dem Lock muss `requirements_list` gefüllt sein:
  bash scripts/ticket.sh plan-meta set --id <id> --requirements "req1|req2|req3"
  Das Trennzeichen ist `|` (Pipe), nicht Komma.
  Danach: bash scripts/ticket.sh lastenheft lock --id <id>
```
