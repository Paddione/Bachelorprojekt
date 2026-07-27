# Proposal: factory-resume-staged-work

## Why

Die Factory kann ein bereits angefangenes Ticket heute nicht zuverlässig zu Ende bearbeiten — sie
fängt den Plan in der Regel von vorne an. Die Bausteine dafür sind aber schon da, sie greifen nur
nicht ineinander:

- `scripts/factory/pipeline.js:112–127` erkennt über `FACTORY-PLAN-REF`, dass ein Mensch den Plan
  bereits geschrieben hat, und überspringt Scout/Design/Plan.
- `scripts/worktree-create.sh` checkt einen existierenden Branch samt seiner Commits aus statt ihn
  neu von `origin/main` zu erzeugen (der `<base>`-Parameter wird bei existierendem Branch ignoriert).
- `scripts/factory/pipeline-runner.js:403–423` (`read-partials`, T002082) filtert bereits erledigte
  Partials heraus: es liest die `partial-done`-Einträge aus `tickets.factory_phase_events` und
  reicht sie an `orderAndFilter` aus `scripts/factory/partial-order.cjs` weiter.

**Der Fehler liegt in der Reihenfolge.** `pipeline.js:320` ruft `read-partials` mit
`changeDir: ${WORK_WT}/openspec/changes/<slug>` auf, aber `setupWorktree` legt `WORK_WT` erst in
Zeile 345 an. Zum Lesezeitpunkt existiert das Verzeichnis nicht, `readPartials` liefert nichts, und
der Code fällt auf den LLM-Decompose in Zeile 327 zurück. Dieser Pfad kennt keine erledigten
Partials und erzeugt eine vollständige Taskliste — die Implementierungsschleife in Zeile 357
iteriert anschließend bedingungslos darüber und wiederholt bereits geleistete Arbeit.

Das Verhalten ist dadurch nicht einmal stabil falsch: bleibt `.worktrees/<slug>-reuse` von einem
früheren Tick liegen, greift der Partial-Pfad plötzlich doch. Wiederaufnahme wirkt deshalb wie
Zufall statt wie eine Zusage.

Weil der Übergang zwischen „Plan fertig" und „Ausführung läuft" damit praktisch binär ist, ist der
Rückholweg `ticket.sh reclaim` (T002267) heute der Regelweg geworden, obwohl er als Notausstieg
gedacht war.

Ein zweiter, unabhängiger Befund: ist der Branch bereits in einem Worktree einer lebenden Session
ausgecheckt, scheitert `git worktree add`, und die Factory eskaliert das Ticket auf `blocked`
(Zeile 346–355), statt die fremde Zuständigkeit zu erkennen und zurückzustellen.

## What

`dev-flow-execute` wird factory-tauglich gemacht — **kein neuer Skill**. Es bleibt ein
Ausführungspfad für Mensch und Factory, damit beide nicht auseinanderlaufen.

- Das Partial-Manifest wird erst gelesen, nachdem der Worktree bereitsteht. Damit greift der
  bestehende `partial-done`-Filter aus `read-partials` tatsächlich, statt still auf den
  LLM-Decompose zurückzufallen. **Es wird kein zweiter Fortschrittsmechanismus gebaut** — die
  vorhandene Phase-Event-Auswertung ist die Quelle der Wahrheit.
- Fällt die Pipeline dennoch auf den LLM-Decompose zurück (Plan ohne `tasks.d/`), meldet sie das
  ausdrücklich, statt den Rückfall stillschweigend als Normalfall zu behandeln.
- Ist der Branch in einem anderen Worktree ausgecheckt, erkennt die Factory das als fremde
  Zuständigkeit und stellt zurück, statt `blocked` zu setzen.
- Das Hold-Gate aus T002272 bleibt unverändert: `execution_released=false` ist weiterhin der
  Default, die Factory greift erst nach `ticket.sh release-hold`. Fortsetzungsfähigkeit ersetzt die
  Freigabe nicht, sie macht sie nur folgenlos für bereits geleistete Arbeit.
- `ticket.sh reclaim` bleibt unangetastet als manueller Notausstieg für entgleiste Ausführungen.

_Ticket: T002327_
