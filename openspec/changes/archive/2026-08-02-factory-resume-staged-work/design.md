# Design: factory-resume-staged-work

_Ticket: T002327._ Entscheidungen von Patrick am 2026-07-27 in der Planungssitzung.

## Ausgangslage

Der REUSE-Pfad der Factory ist gebaut, aber er wird nicht erreicht. Die Kette:

```
pipeline.js:112   FACTORY-PLAN-REF erkannt        → REUSE = true
pipeline.js:132   WORK_WT = .worktrees/<slug>-reuse   (Pfad, noch nicht angelegt)
pipeline.js:320   read-partials(changeDir = WORK_WT/openspec/changes/<slug>)
                     └─ Verzeichnis existiert nicht → res.partials falsy
pipeline.js:327   LLM-Decompose (Fallback)        → volle Taskliste, kein Done-Filter
pipeline.js:345   setupWorktree()                 → JETZT erst entsteht WORK_WT
pipeline.js:357   for (const t of tasks)          → implementiert alles erneut
```

`read-partials` (`pipeline-runner.js:403–423`) enthält bereits die vollständige
Fortschrittserkennung: es liest `partial-done`-Events aus `tickets.factory_phase_events` und
filtert über `orderAndFilter` aus `partial-order.cjs`. Diese Fähigkeit ist seit T002082 da und
wird durch die Reihenfolge lediglich umgangen.

## Entscheidungen

### E1 — Reihenfolge korrigieren statt Mechanismus neu bauen

`setupWorktree` läuft vor `read-partials`. Damit greift der bestehende `partial-done`-Filter.

**Es wird ausdrücklich kein zweiter Fortschrittsmechanismus eingeführt** — keine Auswertung von
Commit-Betreffs, keine Checkbox-Parserei im Plan. Zwei Quellen für „ist p2 fertig?" würden
auseinanderlaufen, und die Phase-Events sind die einzige Quelle, die auch ein abgebrochener Lauf
hinterlässt.

Folge für die Struktur: der Implement-Block ab Zeile 341 besitzt heute den `setupWorktree`-Aufruf.
Er wandert vor den `if (REUSE)`-Block in Zeile 314. Der Nicht-REUSE-Pfad darf dadurch **nicht**
früher einen Worktree anlegen als bisher — das ist die Stelle, an der ein unachtsamer Umbau
Ressourcen für Läufe verbraucht, die gar nicht implementieren.

### E2 — Neue Logik gehört in `pipeline-runner.js`, nicht in `pipeline.js`

`scripts/factory/pipeline.js` ist ein Claude-Code-Workflow-Skript und laut `docs/code-quality/gates.yaml`
eine bewusste S1-Ausnahme: Top-Level-Importe vor `meta` und `import()` zur Laufzeit sind vom
Harness verboten (T000460), es kann also keine Module laden. Jede Logik, die mehr als ein paar
Zeilen braucht, wird als Runner-Kommando in `pipeline-runner.js` implementiert und über
`runRunner(agent, '<command>', payload)` gerufen — genau wie `read-partials` selbst.

In `pipeline.js` verbleiben deshalb nur Reihenfolge, Verzweigung und Logging.

### E3 — Fremdbesitz wird an der Quelle erkannt, nicht aus Fehlertext geraten

Ist der Branch bereits in einem anderen Worktree ausgecheckt, scheitert `git worktree add` mit
einer Meldung, deren Wortlaut von der git-Version abhängt. Statt in `pipeline.js` darauf zu
matchen, meldet `scripts/worktree-create.sh` den Fall selbst über eine feste Markerzeile und einen
eigenen Exit-Code. `pipeline.js` verzweigt auf den Marker.

Damit ist die Unterscheidung „fremd belegt" gegenüber „echt kaputt" an einer Stelle definiert und
testbar, ohne einen Cluster oder eine laufende Fremdsession.

### E4 — Fremdbesitz stellt zurück, er blockiert nicht

Bei Fremdbesitz gibt die Factory ihren Slot frei und lässt das Ticket dispatchbar. `blocked` bleibt
dem echten Fehlschlag vorbehalten. Grund: `blocked` ist ein Zustand, aus dem ein Mensch das Ticket
herausholen muss — eine fremde Session, die in zehn Minuten fertig ist, darf das nicht auslösen.

### E5 — Das Hold-Gate bleibt Default

T002272 ist gemergt: `stage-plan --hold` setzt `readiness.execution_released=false`, `queue.sh:26`
dispatcht nur bei `true`. Das bleibt so. Fortsetzungsfähigkeit ersetzt die Freigabe nicht — sie
sorgt nur dafür, dass eine Freigabe nicht bedeutet, bereits geleistete Arbeit wegzuwerfen.

`ticket.sh reclaim` bleibt manueller Notausstieg und wird **nicht** automatisch ausgelöst. Eine
Automatik müsste „verhunzt" definieren; jede Heuristik dafür würde irgendwann gesunde Läufe
abräumen.

### E6 — Der Fallback bleibt, wird aber laut

Pläne ohne `tasks.d/` gibt es weiterhin, der LLM-Decompose bleibt ihr Weg. Er wird aber
protokolliert. Ohne diese Meldung ist die heutige Fehlersituation von der korrigierten nicht zu
unterscheiden — beide sehen im Log gleich aus, und genau daran ist der Bug so lange unbemerkt
geblieben.

## Verworfene Alternativen

**Eigener Fortsetzungs-Skill (`dev-flow-resume`).** Zwei Ausführungspfade, die synchron gehalten
werden müssten. `dev-flow-execute` deckt denselben Ablauf bereits ab; der Unterschied zwischen
Mensch und Factory ist die Aufrufumgebung, nicht der Ablauf.

**Hold als Opt-out (Factory greift standardmäßig).** Kehrt den gerade gemergten Default aus T002272
um, ohne dass die Fortsetzungsfähigkeit das erfordert. Bei Bedarf später separat entscheidbar.

**Fortschritt aus Commit-Betreffs ableiten.** Zweite Wahrheitsquelle neben den Phase-Events; bricht,
sobald ein Partial ohne eigenen Commit landet oder ein Squash die Betreffs zusammenzieht.

## Risiken

- **Der Umbau der Reihenfolge berührt den Nicht-REUSE-Pfad.** `setupWorktree` wird heute nur
  erreicht, wenn `tasks.length` gefüllt ist. Wandert der Aufruf nach vorne, muss die Bedingung
  mitwandern, sonst legt jeder Lauf einen Worktree an. Der FA-SF-20-Kontrakttest schützt die
  Struktur von `pipeline.js`, nicht diese Semantik — die Absicherung muss aus p5 kommen.
- **`partial-order.cjs` fällt unter das `.cjs`-Limit von 200 Zeilen** (`docs/code-quality/gates.yaml:55`).
  Falls dort etwas ergänzt werden müsste, ist die Reserve knapp; der Plan vermeidet das bewusst.
- **Kein Zugriff auf `tickets.factory_phase_events` in CI.** Die Tests dürfen nicht gegen eine
  Datenbank laufen; p5 prüft daher Struktur und Verzweigung, nicht den DB-Roundtrip.
