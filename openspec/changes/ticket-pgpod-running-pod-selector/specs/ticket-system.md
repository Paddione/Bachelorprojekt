## ADDED Requirements

### Requirement: Ticket-CLI wählt ausschließlich einen laufenden shared-db-Pod

The ticket CLI SHALL resolve its `shared-db` target pod with a server-side phase filter so
that only pods in phase `Running` are eligible, and SHALL report a distinguishable error
when the label selector matches pods but none of them is `Running`.

#### Scenario: Ein zurückgebliebener Completed-Pod wird übersprungen

- **GIVEN** der Namespace enthält `shared-db-completed` in Phase `Succeeded` und
  `shared-db-live` in Phase `Running`, und der Completed-Pod sortiert alphabetisch zuerst
- **WHEN** `_pgpod` aus `scripts/vda/ticket/_ticket-core.sh` aufgerufen wird
- **THEN** liefert es `pod/shared-db-live` zurück, sodass das nachfolgende `kubectl exec`
  nicht mit "cannot exec into a container in a completed pod" scheitert

#### Scenario: Filterung passiert serverseitig, nicht im Client

- **GIVEN** `scripts/vda/ticket/_ticket-core.sh` wird auf seinen kubectl-Aufruf geprüft
- **WHEN** die Datei nach dem Phasen-Filter durchsucht wird
- **THEN** enthält der `kubectl get pod`-Aufruf `--field-selector status.phase=Running`,
  sodass der API-Server filtert statt die vollständige Pod-Liste zu übertragen

#### Scenario: Nur nicht-laufende Pods vorhanden

- **GIVEN** der Label-Selektor trifft ausschließlich Pods in Phase `Succeeded` oder `Failed`
- **WHEN** `_pgpod` aufgerufen wird
- **THEN** bricht es mit Exit-Code 1 ab und die Fehlermeldung unterscheidet diesen Fall von
  "gar kein Pod gefunden", sodass der Operator den toten Pod als Ursache erkennt
