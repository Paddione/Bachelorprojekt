#!/usr/bin/env bash
# scripts/backup-restore-filen.sh — cmd_filen_* subcommands
# Called by backup-restore.sh dispatcher. Do not call directly.
# Commands: filen-pull
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup-restore-lib.sh
source "$SCRIPT_DIR/backup-restore-lib.sh"

CMD="${1:-}"; shift || true

cmd_filen_pull() {
  local TS="${1:-}"
  [[ -n "$TS" ]] || _die "Usage: backup-restore.sh filen-pull <timestamp> [--remote-path <path>]"

  # Resolve the Filen remote base path: --remote-path wins, else the
  # backup-config ConfigMap default (mirrors what the upload side uploads to).
  if [[ -z "${REMOTE_PATH:-}" ]]; then
    REMOTE_PATH=$($KC get configmap backup-config -n "$NS" \
      -o jsonpath='{.data.FILEN_DEFAULT_UPLOAD_PATH}' 2>/dev/null || echo "")
  fi
  [[ -n "$REMOTE_PATH" ]] || _die "Could not resolve Filen remote path — pass --remote-path <path> or ensure backup-config has FILEN_DEFAULT_UPLOAD_PATH"

  echo "Pulling ${TS} from Filen (${REMOTE_PATH}/${TS}/) into backup-pvc (ns=${NS})..."
  local JOB="filen-pull-$$"

  $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels:
    app: filen-pull
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        fsGroup: 65532
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: filen-pull
          # Mirrors the filen-upload container in k3d/backup-cronjob.yaml,
          # inverted to download. @filen/cli is the only working Filen client
          # (rclone has no Filen backend; webdav.filen.io is desktop-only).
          image: node:22-alpine
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              if [ -z "\$FILEN_EMAIL" ] || [ -z "\$FILEN_PASSWORD" ]; then
                echo "ERROR: FILEN_EMAIL/FILEN_PASSWORD not set in workspace-secrets"; exit 1
              fi
              export HOME=/tmp
              echo "Installing Filen CLI..."
              npm install -g @filen/cli --prefix /tmp/npm-global --silent 2>&1 | tail -3
              export PATH="/tmp/npm-global/bin:\$PATH"
              mkdir -p "/backups/${TS}"
              echo "Downloading ${REMOTE_PATH}/${TS}/ -> /backups/${TS}/ ..."
              filen --email "\$FILEN_EMAIL" --password "\$FILEN_PASSWORD" \\
                download "${REMOTE_PATH}/${TS}/" "/backups/${TS}/"
              echo "Pulled ${TS} into backup-pvc:/backups/${TS}/"
              ls -la "/backups/${TS}/"
          env:
            - name: FILEN_EMAIL
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: FILEN_EMAIL
            - name: FILEN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: FILEN_PASSWORD
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            capabilities:
              drop: ["ALL"]
          volumeMounts:
            - name: backup-storage
              mountPath: /backups
          resources:
            requests:
              memory: 256Mi
              cpu: "200m"
            limits:
              memory: 1Gi
              cpu: "1"
      volumes:
        - name: backup-storage
          persistentVolumeClaim:
            claimName: backup-pvc
YAML

  echo "Waiting for filen-pull job to complete (up to 10 min)..."
  if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=600s 2>/dev/null; then
    echo "ERROR: filen-pull job did not complete"
    $KC logs -n "$NS" -l "job-name=${JOB}" --tail=50 2>/dev/null || true
    exit 1
  fi
  $KC logs -n "$NS" -l "job-name=${JOB}" --tail=20 2>/dev/null || true
  echo ""
  echo "✓ filen-pull complete. Confirm and restore:"
  echo "    backup-restore.sh list ${CTX_FLAG}        # DB backups now in backup-pvc"
  echo "    backup-restore.sh pvc-list ${CTX_FLAG}    # PVC backups now in backup-pvc"
  echo "    backup-restore.sh restore <db> ${TS} ${CTX_FLAG}"
  echo "    backup-restore.sh pvc-restore <svc> ${TS} ${CTX_FLAG}"
}

case "$CMD" in
  filen-pull) cmd_filen_pull "$@" ;;
  *) _die "unknown filen command '$CMD'" ;;
esac
