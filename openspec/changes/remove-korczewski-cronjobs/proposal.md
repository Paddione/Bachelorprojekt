# Proposal: remove-korczewski-cronjobs

## Why

Die CronJobs `pvc-backup` und `error-log-retention` schlagen in `workspace-korczewski` systematisch fehl: sie referenzieren Deployments (vaultwarden, nextcloud, website), die im korczewski-Overlay auf 0 Replikas skaliert sind — die Jobs laufen gegen Pods, die nie existieren. [T012964]

## What

Zwei Inline-Delete-Patches in `prod-korczewski/kustomization.yaml` (analog der bestehenden brain-Delete-Patches), sodass der korczewski-Render die beiden CronJobs gar nicht erst enthält.

_Ticket: T012964_
