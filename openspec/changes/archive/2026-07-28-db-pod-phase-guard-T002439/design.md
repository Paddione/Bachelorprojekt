---
ticket_id: T002439
plan_ref: openspec/changes/db-pod-phase-guard-T002439/tasks.md
status: active
date: 2026-07-28
---

# Design: Pod-Phase-Guard treffer-granular (T002439)

## Root-Cause

`DB-Nachweis rc=1` im Verify-Event von T002418 stammt nicht aus einem Schema-Defekt, sondern
aus einer ungefilterten `shared-db`-Pod-Selektion. Eine Selektion ohne
`--field-selector status.phase=Running` kann einen `Completed`- oder `Terminating`-Pod
zurückgeben; das nachfolgende `kubectl exec` bricht dann mit Exit-Code 1 ab.

Der Fehlermodus ist bekannt und war bereits zweimal Gegenstand eines Vorgangs — T002307 fixte
eine einzelne Kopie, T002386 zog daraus einen Klassen-Guard. Der Guard schließt die Lücke für
`scripts/` und ist dort wirksam (`conflict-check.sh:59`, `_ticket-core.sh:47` tragen den Filter).
Er hat aber zwei eigene Blindstellen, die den Fehler in `tests/` überleben ließen.

### Blindstelle 1 — Scan-Wurzel

`grep -rl "app in (shared-db" "$REPO_ROOT/scripts" --include='*.sh'`. Weder `tests/` noch
`*.bats` sind erfasst. Sieben Dateien tragen dort ungefilterte Selektionen:

| Datei |
|---|
| `tests/spec/local-llm-proxy.bats` |
| `tests/spec/database.bats` |
| `tests/lib/factory-test-fixtures.sh` |
| `tests/local/FA-SF-04-db-schema.bats` |
| `tests/local/FA-SF-01-conflict-check.bats` |
| `tests/local/learning-db-schema.bats` |
| `tests/local/FA-SF-26-watchdog.bats` |

### Blindstelle 2 — Datei-Granularität

Der Guard prüft pro Datei, ob *irgendwo* ein Phasenfilter vorkommt. `tests/spec/software-factory.bats`
trägt vier ungefilterte Selektionen (Zeilen 40, 165, 195, 871), seine beiden
`status.phase=Running`-Vorkommen (4599, 4632) stehen jedoch im Guard-Testtext selbst. Eine bloße
Erweiterung der Scan-Wurzel auf `tests/` würde diese Datei weiterhin durchwinken — der Guard
läse seinen eigenen Suchstring als Beleg dafür, dass die Datei in Ordnung ist.

Die Datei-Granularität war kein Versehen: der Kommentar begründet sie damit, dass die Selektion
über Zeilen umgebrochen sein darf (so steht sie in `_ticket-core.sh:47-48`). Der Bedarf ist real,
die gewählte Lösung schießt aber über das Ziel hinaus.

## Fix-Ansatz

**Continuation-Join statt Datei-Granularität.** Backslash-Fortsetzungen werden zu logischen
Zeilen zusammengefaltet, dann wird pro logischer Zeile geprüft. Damit ist der umgebrochene Fall
korrekt abgedeckt, ohne die restliche Datei mitzuentschuldigen.

**Opt-out-Marker für bewusste Ausnahmen.** `scripts/vda/ticket/_ticket-core.sh:52` fragt auf dem
Fehlerpfad absichtlich ungefiltert nach, um „gar kein Pod" von „Pods vorhanden, keiner Running"
zu unterscheiden. Diese Zeile ist korrekt und muss es bleiben. Sie trägt künftig
`# pod-phase-filter: intentional-unfiltered`; nur damit toleriert der Guard sie. Ein Pauschal-Opt-out
per Datei wäre wieder die Datei-Granularität durch die Hintertür.

**Extraktion in `scripts/check-pod-phase-filter.sh`.** Die Guard-Logik verlässt den inline-`@test`.
Zwei Gründe: sie wird gegen Fixtures prüfbar (ohne das ist der Positiv-Anker nach T002356-M1 nicht
konstruierbar), und sie wird eigenständig aufrufbar. Das Skript nimmt optionale Scan-Wurzeln als
Argumente; ohne Argumente scannt es `scripts/` und `tests/`. `--print-roots` gibt die
Standardwurzeln aus, damit die Abdeckung selbst testbar ist statt nur behauptet.

**`_skip_if_no_db` semantisch korrigieren.** Der Helfer springt bisher nur an, wenn die Pod-Liste
leer ist. Mit Phasenfilter wird daraus die Aussage, die er immer treffen wollte: kein *Running*
Pod erreichbar → skip. Damit endet ein Lauf gegen einen toten Pod im sauberen Skip statt in `rc=1`
— das schließt AK 3 und AK 4 des Tickets.

## Nicht-Reproduzierbarkeit

`rc=1` lässt sich heute nicht nachstellen: im Cluster läuft genau ein `shared-db`-Pod in Phase
`Running`, die auslösende Bedingung war transient (Rollout-Fenster). AK 1 wird deshalb als
begründete Rekonstruktion geschlossen, nicht als Nachstellung. Die Absicherung simuliert den
Fehlermodus über Fixtures statt auf einen kaputten Cluster zu warten.

## Fixtures zur Laufzeit, nicht committed

Die Guard-Fixtures entstehen in `$BATS_TEST_TMPDIR`. Eine eingecheckte Fixture mit absichtlich
ungefilterter Selektion würde vom repo-weiten Scan als echter Verstoß gemeldet — der Guard
würde an seinem eigenen Testmaterial scheitern.

Aus demselben Grund trägt die Testdatei dort, wo sie das Suchmuster als Literal führt
(Fixture-Generator, umgebrochene Fixture), selbst den Opt-out-Marker.

## touched_files bleibt nullable

AK 2 fordert „existiert, NOT NULL default". Die Spalte existiert (`ARRAY`, nullable, kein Default,
181 von 1806 Zeilen befüllt); der zweite Teil wird bewusst nicht umgesetzt. `NULL` trägt
Information, die ein `DEFAULT '{}'` vernichten würde: „Scout lief für dieses Ticket nie" ist
etwas anderes als „Ticket berührt keine Dateien". `conflict-check.sh:138` filtert genau darauf
(`AND t.touched_files IS NOT NULL`) — nach einer solchen Migration würde jedes ungescoutete
Ticket als Kollisionskandidat gelten.

## Abgrenzung

Nur 181 von 1806 Tickets haben `touched_files` gesetzt. Die Kollisionsprüfung ist damit für rund
90 % der Tickets wirkungslos. Das ist ein realer Mangel, aber ein eigener Vorgang — er ändert
nichts an der hier behandelten `rc=1`-Ursache.

_Ticket: T002439_
