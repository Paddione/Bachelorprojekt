# p1 — Audit des gelandeten Stands

## Ziel
Drei Fehlannahmen benennen, bevor etwas geaendert wird.

## Schritte
1. `checks/diffs/incoming.diff` lesen.
2. Beleg 1: `skip 'kein Cluster verfuegbar'` als erste Anweisung — Test ist
   unbedingt gruen, auch mit Cluster.
3. Beleg 2: `k3d/k1-embed-job.yaml` ohne `$JOB_ID`, `$REPO_URL`, `$MERGE_SHA`, `$FULL`.
4. Beleg 3: kein offline Render-Test vorhanden.
5. Gegen `checks/diffs/clean.diff` halten: der Referenz-Patch macht beides (Offline-Test
   **und** Erreichbarkeits-Guard), laesst Dry-Run und Platzhalter aber stehen.

## Fertig, wenn
Alle drei Punkte mit Datei und Zeile belegt sind.
