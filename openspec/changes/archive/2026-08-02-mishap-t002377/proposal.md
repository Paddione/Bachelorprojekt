# Proposal: mishap-t002377

_Ticket: T002377_

## Why

Das Bundle enthielt zwei Einträge. Die Recon bei der Umsetzung hat für beide ein anderes
Ergebnis geliefert als die ursprüngliche Vermutung — das ist der eigentliche Inhalt dieses
Changes.

**Eintrag 1 — `.worktrees/llm-server-watchdog` auf detached HEAD.** Trifft nicht zu. Der
Worktree hängt an `fix/llm-server-watchdog-T002335`, `git worktree list` weist ihn dort aus,
und der Baum ist sauber. Kein Handlungsbedarf.

**Eintrag 2 — `test:spec:changed` liefert einen falschen Exit 1.** Der im Plan genannte
RED-Test (`factory-mcp registers openspec_find_similar tool`) **existiert nicht** — der Aufruf
endet mit `1..0` und Exit 0. `task test:spec:changed` liefert sowohl auf `main` als auch in
einem Worktree mit Änderungen Exit 0. Ein Exit-Code-Fehler in der Task ließ sich nicht
reproduzieren.

Reproduzierbar ist etwas anderes, und es erklärt die Beobachtung vollständig:
`scripts/find-changed-tests.sh` fällt **stumm** auf die volle Suite zurück. Gemessen im
Worktree `mishap-test-repo-hygiene`: 138 von 138 Spec-Dateien, 2016 Tests, über zehn Minuten
Laufzeit. Die Task gibt dabei `→ Running changed spec tests:` aus, gefolgt von 138 Pfaden —
das liest sich wie eine gezielte Auswahl, nicht wie ein Vollauf.

Ein solcher Lauf, der in ein Timeout gerät, endet mit Exit ≠ 0, **während jeder Untertest
bestanden hat**. Genau die Beschreibung aus dem Ticket. Der Defekt liegt also nicht in der
Exit-Code-Logik, sondern darin, dass der Fallback sich nicht zu erkennen gibt.

## What

`find-changed-tests.sh` meldet den Fallback auf stderr und nennt die auslösende Datei —
genau einmal pro Lauf, nicht je Datei, sonst textet die Meldung sich selbst zu. Alle drei
`RUN_ALL=true`-Stellen laufen dafür über einen gemeinsamen Helfer. stdout bleibt unverändert
die reine Dateiliste, weil nachgelagerte Aufrufer sie parsen.

`Taskfile.yml` unterscheidet in der Ausgabe zwischen gezielter Auswahl (`n of m`) und Vollauf
(`FULL spec suite … expect >10 min`).

## Abgrenzung

Am Exit-Code-Verhalten wird **nichts** geändert: Es wurde kein Fehler gefunden, und ein Fix
ohne reproduzierten Fehler würde die Symptomsuche nur verschieben. Sollte der Exit 1 erneut
auftreten, ist er dank der neuen Meldung entweder sofort als Vollauf-Timeout erkennbar oder
eben ausgeschlossen — in beiden Fällen ist die nächste Diagnose kürzer.
