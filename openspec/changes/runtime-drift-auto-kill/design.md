---
ticket_id: T004897
plan_ref: null
status: active
date: 2026-08-14
---

# Design: runtime-drift-auto-kill (T004897)

## Kontext

runtime-drift-check.sh (T003825) meldet Drift-Befunde für Prozesse mit ersetzter Binary
((deleted)-Inode bzw. sha256-Mismatch) und nennt die Abhilfe, beendet aber nichts selbst.
Der User entschied 2026-08-14: Auto-Heilung per opt-in `--auto-kill`-Flag.

## Design-Entscheidungen

1. **Flag statt Default-Änderung:** `--auto-kill` ist opt-in; ohne Flag bleibt das Verhalten
   identisch (meldend, read-only, Exit 1 bei Drift). Bestehender Test „Guard beendet den
   driftenden Prozess NICHT" bleibt grün.
2. **Sicherheitsgrenze:** Nur Prozesse, die gegen eine registrierte stdio-Binary der eigenen
   Registry matchen (`/proc/<pid>/exe`-Prüfung in `_check_binary`), sind Kill-Kandidaten.
   Fremdprozesse nie — strukturell erzwungen, da nur registrierte Binaries iteriert werden.
3. **Heil-Signale:** deleted-Inode UND sha256-Mismatch — beides ist „läuft mit ersetzter
   Binary"; der Auto-Kill führt die im Report dokumentierte Operator-Aktion aus.
4. **Kill-Mechanik:** SIGTERM (sanft), danach Poll auf Prozessende (`kill -0`); überlebt der
   Prozess, wird das als ungeheilter Befund gemeldet (residualer Drift, Exit 1).
5. **Exit-Semantik mit --auto-kill:** erfolgreich beendete Prozesse sind geheilt → zählen
   nicht als residualer Drift; Exit 0 wenn nichts Residuales bleibt. DB-Drift bleibt Befund
   (Exit 1) — Migrationen werden nie automatisch angewendet. Grund: der Guard läuft im
   lokalen Testloop; nach Heilung soll der Lauf grün sein.
6. **Arg-Parsing:** unbekannte Argumente → Usage auf stderr + Exit 2 (heute wird `$@` still
   ignoriert).
7. **Neustart-Semantik:** beendete stdio-Server starten beim nächsten Tool-Aufruf neu —
   dokumentiert, kein Selbst-Neustart durch den Guard.

## Umsetzungs-Skizze (scripts/runtime-drift-check.sh)

- Arg-Loop vor dem Hauptlauf: `--auto-kill` → `AUTO_KILL=1`; `-h|--help` → Usage + Exit 0;
  alles andere → Usage + Exit 2.
- In `_check_binary`: nach `report` (Drift-Signal für registrierte Binary) bei `AUTO_KILL=1`:
  `kill "$pid"`; Poll-Schleife (bis ~1s): `kill -0 "$pid"` solange wahr → warten; danach:
  lebt er noch → `report "Prozess $pid konnte nicht beendet werden"` und Befund zählt
  (DRIFT_COUNT bleibt); ist er weg → `DRIFT_COUNT=$((DRIFT_COUNT-1))` (geheilt) und
  Meldung „automatisch beendet (--auto-kill)".
- DB-Prüfer unverändert — DB-Befunde bleiben Befunde.
