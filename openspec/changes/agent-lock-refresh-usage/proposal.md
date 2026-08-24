# Proposal: agent-lock-refresh-usage

## Why

`bash scripts/agent-lock.sh refresh` ohne Argument crasht mit
`line 509: $1: unbound variable` (Skript läuft unter `set -u`), statt eine
brauchbare Usage/Meldung auszugeben [T016421, Incident „broken"]. Der
Dispatcher (`main()`) entfernt `cmd` via `shift` und ruft `cmd_refresh "$@"`
mit leerer Argumentliste; dort liest `SCOPE="$1"` das ungebundene `$1`.
Umwege über erneutes `claim` funktionieren als Heartbeat-Erneuerung — die
Ergonomie-Lücke ist aber genau die Fläche, die T016417 mit `claim --renew`
systematisch schließen will; der Crash verleitet zu falschen Aufrufformen.

## What

Guard in `cmd_refresh()` nach dem etablierten Muster von `cmd_claim`:
fehlender oder flag-artiger Scope wird über `_reject_arg refresh "$SCOPE"`
mit Scope/id-Hinweis abgelehnt und mit `return 2` beendet — kein Crash,
keine Lock-Seiteneffekte. BATS-Regressionstest
`tests/spec/agent-lock-refresh-usage.bats` (RED auf aktuellem Stand).

**Koordination:** T016417 (claim --renew, bereits plan_staged) toucht
dieselbe Datei `scripts/agent-lock.sh`. Dieser Fix ist bewusst minimal und
auf `cmd_refresh` lokal begrenzt; Merge-Reihenfolge egal, Rebase-freundlich.
Verlinkung `relates_to T016417` ist im Ticket gesetzt.

_Ticket: T016421_
