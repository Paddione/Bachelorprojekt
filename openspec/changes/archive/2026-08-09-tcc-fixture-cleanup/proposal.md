# Proposal: tcc-fixture-cleanup

## Why

`tests/spec/dev-flow-plan/task-context.bats` materialisiert pro Testlauf ein Fixture-Verzeichnis
`openspec/changes/tcc-fixture-$$` (PID-Suffix) aus `tests/fixtures/task-context-channel/` und
räumt es in `teardown()` wieder ab. Am 2026-08-08 blieb `openspec/changes/tcc-fixture-3320939/`
mit acht 0-Byte-Dateien im main-Checkout zurück (T002710).

Verifiziert vor der Lösungssuche: `teardown()` ist intakt (case-Guard auf
`*/openspec/changes/tcc-fixture-*` vorhanden) und die Fixture-Quelle
`tests/fixtures/task-context-channel/` ist unbeschädigt. Die Kopie hatte die volle
Verzeichnisstruktur, aber keinen Inhalt — `cp -r` legt zuerst die Struktur an und schreibt danach
die Daten; der Bats-Prozess starb dazwischen (WSL-Abbruch / Session-Kill), wodurch `teardown()`
nie lief. Dasselbe Muster trat am selben Tag erneut auf: dreimal hinterließ ein per
systemd-Timeout (1h1min) abgebrochener Factory-Lauf einen halbfertigen interaktiven Rebase.

Das ist kein Test-Bug — es ist eine strukturelle Lücke: Aufräumen, das ausschließlich im
`teardown()`/Trap des sterbenden Prozesses passiert, ist unzuverlässig, weil genau der Fall, den
es abdecken soll (abgebrochener Prozess), sein eigenes Aufräumen verhindert. Robuster ist
Aufräumen beim **nächsten** Start, das nicht vom Überleben des erzeugenden Prozesses abhängt.

Verwandt mit T002664 (verwaiste ungetrackte Dateien verschmutzen den Freshness-Regen).

Geprüft, ob dasselbe Muster (Fixture-Kopie mit PID-Suffix nach `openspec/changes/`, Aufräumen nur
in `teardown()`) anderswo vorkommt: `grep -rl 'openspec/changes/\$SLUG\|SLUG=.*\$\$'
tests/spec/ tests/unit/` findet nur zwei Treffer. Der zweite,
`tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats`, nutzt einen **festen** Slug
(`_t002515-risks-dedupe-fixture`) ohne PID — jeder Lauf räumt in `setup()` denselben Pfad vorher
weg, ein Absturz hinterlässt daher nie einen unbekannten, unerreichbaren Namen. Nur
`task-context.bats` hat das PID-Suffix-Muster; die Lösung bleibt auf diese Datei beschränkt.

## What

`setup()` in `tests/spec/dev-flow-plan/task-context.bats` räumt zusätzlich zum eigenen,
PID-benannten Verzeichnis alle **fremden** `openspec/changes/tcc-fixture-*`-Verzeichnisse auf,
die älter als 10 Minuten sind (Altersschwelle nach dem Vorbild von
`scripts/hooks/cleanup-tmp.sh`, das mit `find ... -mmin +60 -delete` denselben Ansatz für
`/tmp/brainstorm-*` fährt — hier deutlich enger, weil ein einzelner Testlauf Sekunden dauert und
10 Minuten reichlich Puffer gegen einen echten parallelen Lauf lassen, ohne echte
Nachbar-Prozesse zu gefährden). Das eigene, gerade erst angelegte Verzeichnis (mtime < 10 min)
bleibt unangetastet — die Reap-Logik trifft nur wirklich verwaiste, ältere Reste.

Kein neues Skript: Die Reap-Logik lebt direkt in `setup()`, mit demselben `case`-Sicherheitsnetz
wie `teardown()` (`tcc-fixture-*` unter `openspec/changes/`, kein `rm -rf` von Fremd-Pfaden).

_Ticket: T002710_
