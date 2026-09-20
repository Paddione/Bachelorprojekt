# Proposal: devmesh-shared-db-backup-retry

## Why

Das `shared-db-backup` CronJob auf Context `devmesh`, Namespace `workspace`, ist seit
mindestens drei Laeufen rot: `pg_dumpall: error: connection to server at "shared-db"
(10.53.198.67), port 5432 failed: Connection refused`.

Ursache gemessen (T900240): Service, Endpoints und die shared-db-DB selbst sind gesund
(bestaetigt per `pg_isready`/`psql` aus einem separat erzeugten Debug-Pod mit identischem
nodeSelector/Label/Namespace — verbindet sich problemlos). Ein manueller Job-Trigger
ausserhalb des Schedule-Fensters `30 3 * * *` reproduziert den Fehler ebenfalls, und zwar
0-1s nachdem der Pod `Running` wird:

```bash
kubectl --context devmesh create job --from=cronjob/shared-db-backup manual-test2-t900240 -n workspace
# Pod manual-test2-t900240-8l8zc: Running -> Error innerhalb von 1s
kubectl --context devmesh logs -n workspace manual-test2-t900240-8l8zc
# pg_dumpall: error: connection to server at "shared-db" (10.53.198.67), port 5432 failed: Connection refused
```

Das ist kein Schedule-Fenster-Problem und keine DB-Verfuegbarkeitsluecke, sondern ein
Container-Start-Netzwerk-Race: `scripts/devmesh/db-backup.sh` ruft `pg_dumpall` sofort
beim Containerstart auf, bevor kube-proxy/CNI die Service-DNAT-Regeln fuer die neue
Pod-Netzwerknamespace fertig synchronisiert haben. Ein Pod, der ein paar Sekunden nach dem
Start verbindet (z. B. der manuell erzeugte Debug-Pod in der Messung), verbindet sich
zuverlaessig.

Nebenbefund, nicht Teil dieser Aenderung: `gpu-cluster` (10.10.10.2) zeigt `NotReady` in
`kubectl --context devmesh get nodes` — betrifft die Backup-Pods nicht (sie laufen auf
`gpu-cluster2`, das `Ready` ist).

## What

`scripts/devmesh/db-backup.sh` wartet vor `pg_dumpall` mit einer kurzen Retry-Schleife auf
`pg_isready -h "$PGHOST" -U "$PGUSER"`, um den Startup-Netzwerk-Race zu ueberbruecken. Nach
Ausschoepfen des Wartebudgets (Default: 10 Versuche a 2s = 20s) bricht das Script sauber mit
Fehler ab — ohne Teil-Dump und ohne Pruning — wie zuvor bei anderen Fehlerpfaden.

_Ticket: T900240_
