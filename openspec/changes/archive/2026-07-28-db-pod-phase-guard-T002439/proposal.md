# Proposal: db-pod-phase-guard-T002439

## Why

Der Verify-Phase-Event von T002418 vermerkte `DB-Nachweis rc=1`, ohne die Quelle zu benennen.
Die Untersuchung widerlegt alle drei im Ticket vermuteten Ursachen: die Spalte
`tickets.tickets.touched_files` existiert (Typ `ARRAY`, nullable, 181 von 1806 Zeilen befüllt),
`FA-SF-04-db-schema` läuft grün, und `scripts/factory/conflict-check.sh` trägt den
Phasenfilter aus T002386 bereits.

Die tatsächliche Lücke liegt im Guard selbst. `tests/spec/software-factory.bats` enthält einen
Klassen-Guard (T002386), der jede `shared-db`-Pod-Selektion ohne
`--field-selector status.phase=Running` rot meldet — greift eine solche Selektion einen
`Completed`- oder `Terminating`-Pod, scheitert das nachfolgende `kubectl exec` mit Exit-Code 1.
Genau dieser Fehlermodus erklärt den beobachteten `rc=1`.

Der Guard hat zwei Blindstellen:

1. **Scan-Wurzel.** Er durchsucht ausschließlich `$REPO_ROOT/scripts` mit `--include='*.sh'`.
   Sieben Dateien unter `tests/` tragen ungefilterte Selektionen und werden nie geprüft:
   `tests/spec/local-llm-proxy.bats`, `tests/spec/database.bats`,
   `tests/lib/factory-test-fixtures.sh`, `tests/local/FA-SF-04-db-schema.bats`,
   `tests/local/FA-SF-01-conflict-check.bats`, `tests/local/learning-db-schema.bats`,
   `tests/local/FA-SF-26-watchdog.bats`.

2. **Datei-Granularität.** Der Guard prüft pro Datei, ob *irgendwo* ein Phasenfilter steht.
   `tests/spec/software-factory.bats` selbst trägt vier ungefilterte Selektionen (Zeilen 40, 165,
   195, 871), seine einzigen `status.phase=Running`-Vorkommen (4599, 4632) stehen aber im
   Guard-Testtext. Eine bloße Ausweitung der Scan-Wurzel auf `tests/` würde diese Datei
   deshalb weiterhin durchwinken — der Guard läse sich selbst als Beweis seiner Korrektheit.

Der Kommentar des Guards warnt wörtlich vor diesem Muster: „T002307 fixte eine Kopie und hielt
die Sache für erledigt, während vier weitere Kopien den Bug behielten." Der Fehler wiederholt
sich hier eine Ebene höher — im Guard, der ihn verhindern soll.

Einschränkung: `rc=1` ist nicht nachstellbar, weil im Cluster derzeit nur ein `Running`-Pod
existiert und die auslösende Bedingung transient war. Die Absicherung simuliert den Fehlermodus
über ein Fake-`kubectl` statt auf einen kaputten Cluster zu warten.

## What

- Der Klassen-Guard wird von Datei- auf Treffer-Granularität umgebaut: Backslash-Fortsetzungen
  werden zu logischen Zeilen zusammengefaltet, dann muss jede logische Zeile mit einer
  `shared-db`-Selektion den Phasenfilter selbst tragen.
- Bewusst ungefilterte Selektionen tragen einen expliziten Opt-out-Marker. Betroffen sind zwei
  Stellen: der Fehlerpfad in `scripts/vda/ticket/_ticket-core.sh` (unterscheidet „gar kein Pod"
  von „Pods vorhanden, keiner Running") und das Suchmuster im Guard selbst.
- Die Scan-Wurzel wird auf `scripts/` und `tests/` erweitert, `--include` um `*.bats`.
- Die dann rot werdenden Selektionen werden gefiltert — vier in `tests/spec/software-factory.bats`
  und die sieben Dateien aus Punkt 1.
- `_skip_if_no_db` wird semantisch korrigiert: es überspringt künftig, wenn kein **Running**
  Pod erreichbar ist, statt nur wenn gar kein Pod gefunden wird. Damit endet der Testlauf bei
  einem toten Pod im Skip statt in `rc=1`.

`touched_files` bleibt nullable. `NULL` trägt hier Information, die ein `DEFAULT '{}'`
vernichten würde: „Scout lief für dieses Ticket nie" ist etwas anderes als „Ticket berührt keine
Dateien". Die Filterung in `conflict-check.sh:138` baut genau auf dieser Unterscheidung auf.

Nicht im Scope: die Befüllungsquote von `touched_files` (1625 Tickets ohne Wert), die
`conflict-check.sh` über `AND t.touched_files IS NOT NULL` real schwächt. Eigener Vorgang.

_Ticket: T002439_
