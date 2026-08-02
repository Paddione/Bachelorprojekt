# Proposal: ingest-llm-argv-anchor

## Why

Der Test `T002533 der Schluessel steht nicht in argv (per ps lesbar)` in
`tests/spec/brain-foundation/ingest-llm-endpoint.bats` wird auf CI sporadisch rot und blockiert
dann fremde PRs, weil `Factory + OpenSpec + Guards` als Aggregat mit fällt — für einen Fehler,
der mit dem jeweiligen PR nichts zu tun hat.

Belegt am Run `30730373962` **Attempt 1** (Shard 3, 2026-08-02): Zeile 133,
`[ "$seen_running" -eq 1 ]` schlug fehl, während Zeile 132 (`rc = 0`) durchlief — das geprüfte
Skript arbeitete also fehlerfrei. Der Defekt liegt allein im Messverfahren.

Ursache, gemessen statt vermutet: Der beobachtete Prozess lebt 31–56 ms, eine Iteration der
Abtastschleife kostet 11–23 ms. Es passen nur 2–4 Stichproben in das gesamte Ereignisfenster;
Abtastperiode und Ereignisdauer liegen in derselben Größenordnung. Auf einem Runner mit vier
parallelen Shards kollabiert das auf eine einzige Stichprobe.

Bei der Analyse trat ein zweiter, bisher unerfasster Defekt derselben Wurzel zutage: Der
wahrscheinlichste Leckweg ist die argv des `curl`-Kindprozesses, der nur während des
HTTP-Requests existiert. Die Abtastung kann diesen Moment verpassen und `hits = 0` melden, ohne
hingesehen zu haben — der Test wäre grün und hätte nichts belegt.

## What

Abtastung durch Synchronisation ersetzen. Der HTTP-Stub erhält ein optionales Gate: Er meldet den
Eingang des Requests und hält die Antwort zurück, bis der Test freigibt. Der Test misst in diesem
Fenster — also genau dann, wenn ein Leck überhaupt sichtbar wäre.

Der bisherige Positiv-Anker `seen_running` wird nicht gestrichen, sondern in zwei getrennte,
deterministische Anker aufgeteilt: „der Request kam an" und „das Prozess-Abbild ist aussagefähig".
Der zweite ist unverzichtbar — ohne ihn bestünde die Sachaussage vakuos, sobald die Messung
nichts liefert (T002356-M1).

Betroffen ist eine einzige Datei. Kein Produktionscode; `start_stub` wird strikt additiv
erweitert, damit die drei übrigen Nutzer unverändert bleiben.

_Ticket: T002537_
