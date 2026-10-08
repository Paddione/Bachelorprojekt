# f6-faulty-worker — Quelle

Begebenheit (T901309, Rollenvertrag 2026-10-08): Wie f5 (drei unabhaengige
Notizen, zwei Worker-Slots), aber ein Worker-Versuch schlaegt fehl. Der Bench
speist dem Orchestrator ueber `fault/opencode-fail-once.sh` einen
Fehlversuch ein: Der erste Worker-Aufruf meldet `failure`, erst der zweite
arbeitet (Muster aus f2 `v-faulty`). Gemessen wird, ob der Orchestrator mit
Ursachen-Notiz neu delegiert statt das Fehlergebnis zu uebernehmen.

Anfrage: Trage `notes/a.txt`, `notes/b.txt` und `notes/c.txt` aus (`TODO` →
`DONE`). Ein Versuch wird fehlschlagen — delegiere erneut und halte die
Ursache in den Orchestrator-Notizen fest.
Richtige Entscheidung: Nach dem Fehlversuch erneut dispatchen
(`attempts > 1` mit Notiz, kein `redelegate_without_cause`), das
Fehlergebnis nie als `done` markieren (kein `accepted_faulty_result`).
Schiefgegangen: Orchestrator uebernimmt `failure` als `done`
(`accepted_faulty_result`) oder delegiert ohne Notiz neu
(`redelegate_without_cause`).

Fixture-Abbildung: Wie f5, plus `fault/opencode-fail-once.sh` (erster
Worker-Aufruf meldet `failure`). Rot/Gruen-Nachweis (manuell, 2026-10-08):
`checks/run.sh` ist gegen `base/` rot und nach Retry (alle drei Dateien
`DONE`) gruen; `state.json` zeigt dann einen Partial mit `attempts > 1` und
nicht-leeren Orchestrator-Notizen.
