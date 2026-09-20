## ADDED Requirements

### Requirement: shared-db-backup toleriert den Pod-Startup-Netzwerk-Race

Das `shared-db-backup` CronJob-Script SHALL vor dem `pg_dumpall`-Lauf auf DB-Erreichbarkeit
warten (`pg_isready`-Retry-Schleife mit konfigurierbarem Wartebudget), statt beim ersten
Verbindungsversuch sofort aufzugeben. Damit uebersteht der Job den Container-Start-Race, bei
dem kube-proxy/CNI die Service-Routing-Regeln fuer eine frisch erzeugte Pod-Netns noch nicht
synchronisiert haben.

#### Scenario: DB wird erst nach ein paar Sekunden erreichbar

- **GIVEN** `pg_isready` gegen `$PGHOST` schlaegt bei den ersten Versuchen fehl (Startup-Race)
- **WHEN** `db-backup.sh` laeuft
- **THEN** wartet das Script (mit Sleep zwischen den Versuchen) und startet `pg_dumpall`
  erst, nachdem `pg_isready` Erfolg meldet — der Dump wird geschrieben

#### Scenario: DB bleibt dauerhaft nicht erreichbar

- **GIVEN** `pg_isready` gegen `$PGHOST` schlaegt bei jedem Versuch bis zum Wartebudget fehl
- **WHEN** `db-backup.sh` laeuft
- **THEN** bricht das Script nach Ausschoepfen des Wartebudgets mit Exit-Code != 0 ab, es
  bleibt kein Teil-Dump (`*.part`) liegen, und das Pruning der bestehenden Dumps wird nicht
  ausgefuehrt
