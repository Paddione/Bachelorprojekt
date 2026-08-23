# Proposal: pvc-backup-escaping-T014535

## Why

Der pvc-backup CronJob bricht seit ~3 Tagen in beiden Brands: Mounter-Jobs
enden mit `/bin/bash: -c: line 11: syntax error near unexpected token '('`,
korczewski läuft seit 8 Tagen ohne erfolgreichen Lauf, zusätzlich ist
`db-backup` in korczewski suspendiert. Datenverlustrisiko für beide
Prod-Brands.

Root-Cause (lokal reproduziert, 1:1 die Fehlermeldung aus dem Cluster-Log):

1. `k3d/pvc-backup-cronjob.yaml` escaped Runtime-Variablen im Mounter-Script
   mit `\${VAR}`. Der Flux-Renderer (`scripts/flux-render-artifact.sh`)
   kennt als Runtime-Marker nur `$${VAR}` (T002306). Sein dynamischer
   Variablen-Extraktor sieht durch den Backslash hindurch und nimmt
   `${LABEL}`, `${OUT}`, `${FAILED}` in die envsubst-Liste auf.
2. envsubst substituiert sie leer (nicht in der Render-Umgebung), der
   Backslash bleibt stehen → `\ `. `SRC`, `STAMP`, `BACKUP_DIR` überleben
   nur zufällig, weil andere Dateien im Overlay sie als `$${...}` nutzen
   (globaler runtime_vars-Filter).
3. Im unquotierten MJOB-Heredoc des Orchestrator-Pods wird daraus ein hart
   kaputtes Mounter-Script: `-out "${BACKUP_DIR}/\"` (Quote-Collaps) und
   `echo "  ✓ \ OK ($(ls ...` → Syntaxfehler Zeile 11.

## What

- Alle Mounter-Runtime-Variablen im MJOB-Block auf die Renderer-Konvention
  umstellen: `\${VAR}` → `\$${VAR}`, `\$(...)` → `\$$(...)`,
  `\$((...))` → `\$$((...))`. Orchestrator-seitige Variablen
  (`${MOUNTER}`, `${VW_AFFINITY}`, `${VW_CLAIM}`) auf `$${VAR}`.
- Taskfile-Unwrap (Push-/Dev-Pfad) auf die breite Regex anheben
  (`$$(` abdecken, Parität mit T012503).
- Failing BATS-Test unter `tests/spec/backup-pipeline.bats`, der die
  Flux-Render-Logik simuliert und `bash -n` auf das generierte
  Mounter-Script prüft, plus Unwrap-Paritäts-Check.
- db-backup-Suspension (korczewski) bleibt vorerst dokumentiert;
  Reaktivierung erst nach verifiziertem grünen Backup-Lauf.

_Ticket: T014535_
