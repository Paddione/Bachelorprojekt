# Proposal: get-timeline-error-visibility

## Why

`bash scripts/ticket.sh get-timeline --id <id>` bricht reproduzierbar mit Exit 3
ab, stdout UND stderr leer (siehe T900239, Reproduktion gegen T900083 u.a.).
Ein stiller Exit 3 ist von "Ticket hat keine Historie" nicht unterscheidbar.

Root Cause (verifiziert per `bash -x`-Trace, nicht geraten): `scripts/ticket.sh`
läuft unter `set -euo pipefail` (Zeile 22). In `_exec_sql`
(`scripts/vda/ticket/_ticket-core.sh`) ist der `kubectl exec ... psql ...`-
Aufruf ein blanker Befehl, gefolgt von `local rc=$?`. Schlägt psql fehl (im
konkreten Fall: die get-timeline-Query referenziert `tp.brand`, das auf
`tickets.ticket_plans` nicht existiert — richtig wäre `tp.branch` — psql bricht
unter `ON_ERROR_STOP` mit Exit 3 ab), beendet `errexit` die Funktion GENAU an
dieser Stelle — vor `local rc=$?`, vor dem stderr-Ausgabeblock und vor dem
`rm -f "$stderr_tmp"`-Cleanup. Die Fehlermeldung existiert (liegt in
`stderr_tmp`), wird aber nie gedruckt. Der `bash -x`-Trace endet exakt an der
`kubectl exec`-Zeile ohne weitere `+`-Zeile — das belegt den Abbruchpunkt.

## What

Minimalfix in `_exec_sql`: `local rc=0; kubectl exec ... <<<"$sql" || rc=$?`
statt bloßem Befehl + `local rc=$?`. Damit läuft die Funktion nach einem
fehlschlagenden `kubectl exec`/psql weiter bis zum stderr-Ausgabeblock — die
echte Fehlerursache landet auf stderr, der (bereits vorher nonzero) Exit-Code
bleibt von einem erfolgreichen "leere Historie"-Fall (Exit 0) unterscheidbar.

Abgrenzung (aus T900239 übernommen): der Inhalt der Timeline-Query
(`tp.brand` vs. `tp.branch`) und das Nachtragen fehlender Phase-Events sind
NICHT Teil dieser Änderung — das ist T900103. Dieser Change macht den
bestehenden SQL-Fehler nur sichtbar, er behebt ihn nicht.

_Ticket: T900239_
