#!/usr/bin/env bats
# tests/spec/backup-pipeline/pvc-backup-multinode.bats
#
# Covers: pvc-backup funktioniert mit local-path-PVCs auf verschiedenen Nodes (T901105).
# Der Writer mountet nur backup-pvc, jede Datenvolume bekommt einen eigenen
# Reader-Job, das Archiv wird per kubectl exec in den Writer gestreamt.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CRON="$REPO/k3d/pvc-backup-cronjob.yaml"
  RBAC="$REPO/k3d/pvc-backup-rbac.yaml"
}

@test "writer job does not mount data volumes alongside backup-pvc" {
  run grep -En 'name: (nextcloud-data|vaultwarden-data)$' "$CRON"
  [ "$status" -eq 1 ]
}

@test "one reader job per data volume is streamed into the writer" {
  grep -q 'role: reader' "$CRON"
  grep -q 'stream_volume nextcloud-data nextcloud-data-pvc' "$CRON"
  grep -q 'stream_volume vaultwarden-data "\$VW_CLAIM"' "$CRON"
  grep -q 'exec -i "\$WPOD" -c backup' "$CRON"
}

@test "orchestrator may exec into pods" {
  grep -q 'pods/exec' "$RBAC"
}
