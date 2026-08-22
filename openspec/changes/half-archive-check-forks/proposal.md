# Proposal: half-archive-check-forks

## Why

Der Half-Archive-Check startet pro Archiveintrag zwei externe Prozesse und ist dadurch
auf ~4 Sekunden angewachsen. Er hängt an vier Aufrufpunkten, die alle in heißen Pfaden
liegen: `scripts/agent-lock.sh` (`cmd_reap`, advisory), `.githooks/pre-commit`
(fail-closed), `scripts/openspec.sh` und `Taskfile.yml`. Jeder `reap` zahlt davon 3,3 s
von 6-7 s Gesamtlaufzeit; in der Spec-Suite schlägt das über fünf reap-lastige
Testdateien mit rund 720 s von 4065 s durch.

Die Kosten wachsen mit dem Archiv. Bei 763 archivierten Changes sind es heute ~1526
Prozessstarts pro Aufruf, und jeder weitere archivierte Change macht den Check und damit
jeden Commit, jeden `reap` und jeden Factory-Tick messbar langsamer.

Nicht die Verzeichnissuche ist der Grund — die beiden `find`-Aufrufe kosten zusammen
8 ms. Die Laufzeit steckt vollständig in `basename` und `printf | sed`, die je Iteration
geforkt werden, obwohl bash beide Operationen als Builtin beherrscht.

## What

`scripts/openspec-half-archive-check.sh` ersetzt die beiden Prozessaufrufe in seinen
Verzeichnisschleifen durch bash-Substitution und einen bash-Regex-Match. Das
Erkennungsverhalten bleibt Zeichen für Zeichen gleich, einschließlich der Behandlung
von Archiveinträgen ohne Datumspräfix.

Ein neuer Guard sichert die Eigenschaft ab, die den Defekt ausmacht: die Zahl externer
Prozessaufrufe darf nicht mit der Archivgröße wachsen. Gemessen wird sie per PATH-Shim
über zwei Läufe gegen unterschiedlich große synthetische Archive, nicht über eine
Laufzeitschranke — eine Zeitschranke misst die Ausstattung des Runners statt den Zustand
des Codes.

Ausdrücklich unverändert bleibt die Kopplung des Checks an `cmd_reap`. Sie ist ein
gewolltes Requirement (T002824) und der zugehörige Guard
`tests/spec/openspec-workflow/half-archive-uncommitted.bats` bleibt der Nachweis, dass
die Erkennungslogik an allen Aufrufpunkten weiterhin greift.

Außerhalb des Scopes: die neun Archiveinträge ohne Datumspräfix, die der Check
stillschweigend überspringt. Sie sind eigenständige Prozess-Drift und bekommen ein
eigenes Ticket.

_Ticket: T013673_
