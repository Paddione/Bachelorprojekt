# Design: branch-reaper Netzausfall-Handling

## Problem

`scripts/branch-reaper.sh` (Zeilen 199-221) pipe `git ls-remote` durch `2>/dev/null` und `|| true`,
was sowohl die Fehlermeldung als auch den Exit-Code unterdrückt. Bei einem Netzfehler
(DNS-Ausfall, Timeout) gibt `git ls-remote` rc != 0 zurueck, aber der Reaper behandelt
das Ergebnis wie ein sauberes, leeres Repo — "Keine Remote-Branches gefunden" mit rc=0.

## Fix

1. `git ls-remote` in einem Subshell ausfuehren und Exit-Code getrennt auswerten
2. Bei rc != 0: Fehlermeldung auf stderr + Exit mit rc != 0
3. stderr nicht unterdruecken (Datei lesbar lassen)

## Betroffene Datei

`scripts/branch-reaper.sh`, Zeilen 199-221 (mapfile-Block + CANDIDATES-Check)
