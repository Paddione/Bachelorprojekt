# Design: factory-infra-bounce-loop

## Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Wo sitzt der Readiness-Gate? | In `schedule.sh` vor `slots.sh claim-gang` (Zeile ~173), nicht nur in der Bridge | Claim ist der state-changed-Schritt; Gate danach kommt zu spät. Bridge-Gate bleibt als zweiter Riegel (Defense-in-depth). |
| Was tut schedule mit planlosen Rows? | Überspringen mit lautem Journal-Line (`schedule: $ext_id not ready (readiness=missing_args) — not claimed`), Status bleibt backlog | Kein Strand, kein Slot-Verbrauch, sichtbar im Journal. |
| Counter unlesbar — Verhalten? | Fehler auf stderr loggen (2>/dev/null am Counter-Aufruf entfernen); Zählerstand `attempt="?"` zählt als gescheiterte Runde über einen separaten Key `factory_infra_unreadable:<ext_id>`; ab MAX_INFRA_ATTEMPTS konsekutiven unlesbaren Runden → escalate=1 | Fail-safe: ein kaputter Counter darf die Eskalation nicht ewig blockieren (beobachtete Endlosschleife). |
| DB-Identitätscheck | Einmal pro Sweep: Marker-Query über factory_psql UND ticket.sh-Pfad (z.B. SELECT einer bekannten Zeile aus tickets.tickets via beiden Routen); bei Abweichung Sweep-Abbruch mit Fehler, KEINE Resets | Verhindert Split-Brain-Resets (Beleg: Ghost-Counter-Zeile). Koordiniert mit T015168, das den ticket.sh-seitigen Identitätsguard baut — dort Andockpunkt, hier Factory-Seite. |
| STALE_MIN=0-Sweeps | Produktions-Sweeps ohne explizites Env bekommen harten Floor: STALE_MIN<5 wird auf 5 angehoben außer FACTORY_ALLOW_STALE_MIN_ZERO=1 (Tests setzen das Flag) | Test-Isolation bleibt möglich; Prod kann nicht mehr versehentlich mit 0 fahren. |

## Abgrenzung

- Kein Umbau von queue.sh/queue-Lanes; kein neues Retry-Framework.
- T015168 (ticket.sh-Identitätsguard, PR #5142-Evidenzkorrektur) bleibt eigenständig.
