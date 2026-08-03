# Proposal: plan-qa-check-quoting

## Why

Die advisory LLM-Qualitätsprüfung für Implementierungspläne
(`scripts/plan-qa-check.sh`, aufgerufen in `dev-flow-plan` Schritt 3.8) ist seit ihrer
Einführung am 2026-06-14 funktionsunfähig. Zwei Defekte aus unkontrollierter
Shell-Interpolation: Backticks im doppelt gequoteten `SYSTEM_PROMPT` lösen eine Command
Substitution aus, und der Planinhalt wird ohne JSON-Escaping in das curl-Payload
interpoliert — schon ein Zeilenumbruch macht es ungültig.

Sieben Wochen fiel das niemandem auf, weil die Aufrufer `|| true` nutzen, das Skript auch
im Defektfall `exit 0` liefert und kein Test existiert. Ein Werkzeug, das nie rot werden
kann, wird auch nicht repariert — genau diese Blindstelle schließt der Change mit.

Zugleich wird der Anbieter auf das lokale Gateway umgestellt, passend zur lokal-first-Politik
des Repos.

## What

- `SYSTEM_PROMPT` über ein quoted Heredoc aufbauen, damit im Prompttext keine Substitution
  mehr stattfindet.
- Das curl-Payload mit `jq -n --arg` bauen statt per String-Interpolation.
- Anbieter auf das lokale Gateway umstellen: `127.0.0.1:18235`,
  `/v1/chat/completions`, Modell `gemma26-factory`, `enable_thinking: false` (ohne das Flag
  bleibt `content` leer, gemessen 2026-08-03).
- Die zwei Ausfallarten trennen: „Gateway nicht erreichbar" bleibt ein stilles Überspringen,
  „Payload ungültig" erzeugt eine sichtbare Warnung.
- Einen `--emit-payload`-Modus einführen, der den Payload-Bau offline prüfbar macht, und die
  Regression mit BATS-Tests absichern.

Nicht Teil dieses Changes: der advisory Charakter des Aufrufs (`plan-lint.sh` bleibt das harte
Gate), die 6 QA-Kriterien selbst und die Auto-Fix-Schleife.

_Ticket: T002595_
