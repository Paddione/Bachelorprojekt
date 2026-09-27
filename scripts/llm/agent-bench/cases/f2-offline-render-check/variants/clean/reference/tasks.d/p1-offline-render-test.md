# p1 — Offline-Render-Test mit Positiv-Anker

## Ziel
Ein Test, der ohne Cluster gruen wird und **beweist**, dass das YAML gerendert wurde.

## Schritte
1. `sed -e 's/$JOB_ID/…/g' -e 's/$MERGE_SHA/…/g' -e 's/$FULL/0/g' -e 's|$REPO_URL|…|g'`
   auf `k3d/k1-embed-job.yaml`, `status -eq 0`.
2. Positiv-Anker zuerst: `apiVersion: batch/v1`, `kind: Job`,
   `name: k1-embed-abc1234-999`, `https://example.invalid/x.git`.
3. Danach Negativpruefungen: keiner der vier Platzhalter darf noch vorkommen.
4. Test **vor** den Dry-Run-Test setzen.
5. `k3d/k1-embed-job.yaml` nicht anfassen — Platzhalter muessen erhalten bleiben.

## Fertig, wenn
`bash checks/run.sh` den sed-Render mit allen Ankern bestaetigt und der Manifest-Check
alle vier Platzhalter weiterhin findet.
