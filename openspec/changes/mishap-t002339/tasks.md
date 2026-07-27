---
title: "mishap-t002339 — Implementation Plan"
ticket_id: T002339
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002339 — Implementation Plan

_Ticket: T002339_

Bundle aus zwei Mishaps desselben Typs: ein erfolgreicher Vorgang wird als
Fehlschlag gemeldet, beziehungsweise eine ausbleibende Antwort als Aussage
gedeutet. Beide verleiten automatisierte Aufrufer zu einer schaedlichen
Folgehandlung.

## File Structure

```
scripts/llm/start-gemma-server.ps1                   (geaendert: -NoWait-Schalter)
scripts/llm/start-rerank-server.ps1                  (geaendert: -NoWait-Schalter)
scripts/llm/start-embed-server.ps1                   (geaendert: -NoWait-Schalter)
tests/spec/llm-pipeline.bats                         (geaendert: Guard auf -NoWait)
.claude/skills/references/git-workflow-procedures.md (geaendert: Watch-Loop-Regel)
tests/spec/dev-flow-execute.bats                     (geaendert: RED-Test auf die Regel)
```

## Kontext: was beobachtet wurde

**Mishap 1, Exit 143 bei erfolgreichem Serverstart.** Die drei
`scripts/llm/start-*.ps1` starten ihren Server via `Start-Process` (entkoppelt,
T002276) und pollen danach bis zu 240 Sekunden auf `/health`, gefolgt von
mehreren Zeilen Hinweistext. Der Aufruf laeuft also lange weiter, NACHDEM der
Server bereits bedient. Am 2026-07-27 lief ein Wrapper deshalb zweimal in
Exit 143 (SIGTERM durch `timeout`), obwohl beide Server nachweislich gesund
waren (Health 200, korrekte PIDs, n_ctx 262144).

Warum das gefaehrlich ist: die naheliegende Reaktion auf Exit 143 ist ein
erneuter Startversuch. Der raeumt per Port-Cleanup (`taskkill /F`, seit T002288
in allen drei Skripten) genau den Server ab, der gerade erfolgreich hochgefahren
war. Der Fehlalarm erzeugt den Ausfall, den er zu melden scheint.

**Mishap 2, Watch-Loop deutet Netzwerkfehler als Zustandswechsel.** Waehrend der
CI-Ueberwachung von PR #3390 brach `gh pr view --json state -q .state` mit
"error connecting to api.github.com" ab. Die Schleife bekam einen LEEREN String,
verglich ihn gegen "OPEN", befand ihn als ungleich und stieg mit `STATE=` aus,
also mit einer Ausgabe, die sich wie ein abgeschlossener Zustandswechsel liest,
obwohl der PR unveraendert offen war.

Das ist dieselbe Klasse wie das bekannte devflow-ci-watch-Falschpositiv
("gruen bei 0 Checks"): das AUSBLEIBEN einer Antwort wird als Antwort gewertet.
Der zweite Anlauf mit `|| { sleep 30; continue; }` plus explizitem
Leer-String-Guard lief sauber bis `STATE=MERGED` durch. Genau dieses Muster
gehoert in die Referenz.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** In `tests/spec/dev-flow-execute.bats` einen
      Guard ergaenzen, der in
      `.claude/skills/references/git-workflow-procedures.md` die
      Watch-Loop-Robustheitsregel verlangt. Der Test muss auf dem aktuellen
      Stand fehlschlagen, weil die Referenz die Regel noch nicht enthaelt (dort
      steht bisher nur die CI-Tabelle um Zeile 83).

```bash
# Neuer @test: "T002339: git-workflow-procedures requires a CI watch loop to
# treat an empty gh response as retry, not as a state change"
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-execute.bats
# expected: FAIL (rot, die Regel steht noch nicht in der Referenz)
```

- [ ] **Fix-Step 1 (GREEN): Watch-Loop-Regel in der Referenz.**
      `.claude/skills/references/git-workflow-procedures.md` bekommt neben der
      bestehenden CI-Tabelle eine Regel samt lauffaehigem Muster: jeder
      `gh`-Aufruf in einer Warteschleife wird gegen Transportfehler abgesichert
      (`|| { sleep N; continue; }`), und ein LEERES Ergebnis ist kein
      Zustandswechsel, sondern ein Grund weiterzupollen. Nur ein nicht-leerer
      Wert ungleich `OPEN` beendet die Schleife.

      Dazuschreiben, warum das kein Schoenheitsfehler ist: der Abbruch mit
      `STATE=` liest sich wie ein Ergebnis und wurde im Vorfall beinahe als
      Merge gedeutet. Die Verwandtschaft zum bekannten "gruen bei 0
      Checks"-Falschpositiv benennen, damit beide Faelle als eine Regel
      erinnert werden.

- [ ] **Fix-Step 2 (GREEN): -NoWait fuer die drei Startskripte.**
      `start-gemma-server.ps1`, `start-rerank-server.ps1` und
      `start-embed-server.ps1` bekommen einen `[switch]$NoWait`. Gesetzt, kehrt
      das Skript direkt nach `Start-Process` mit der PID zurueck und
      ueberspringt Health-Poll und Hinweistext. Der Default bleibt unveraendert
      (Poll an), damit interaktive Aufrufer weiterhin die Bestaetigung sehen.

      In der `.DESCRIPTION` jedes Skripts den Health-Poll-Zeitraum benennen
      (Gemma: bis 240 s) und den Zusammenhang festhalten: wer unter diesem
      Fenster ein Timeout setzt, bekommt einen Fehlschlag fuer eine
      erfolgreiche Operation gemeldet, und ein blinder Retry killt den
      laufenden Server.

- [ ] **Fix-Step 3 (GREEN): Guard auf -NoWait.**
      In `tests/spec/llm-pipeline.bats` einen Guard ergaenzen, der den Schalter
      in allen drei Startskripten festhaelt. Der Guard muss CRLF-tolerant
      formuliert sein (`[[:space:]]*$` statt `$`), weil die `.ps1`-Dateien
      durchgehend CRLF sind. Siehe T002337 und den entsprechenden Task in
      T002338.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
