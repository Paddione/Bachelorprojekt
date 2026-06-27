#!/usr/bin/env bash
# scripts/backup-restore-pvc.sh — cmd_pvc_* subcommands
# Called by backup-restore.sh dispatcher. Do not call directly.
# Commands: pvc-list, pvc-trigger, pvc-restore
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup-restore-lib.sh
source "$SCRIPT_DIR/backup-restore-lib.sh"

CMD="${1:-}"; shift || true

cmd_pvc_list() {
  echo "PVC backups on backup-pvc (newest first):"
  local POD="pvc-backup-list-$$"
  local OVERRIDES='{"spec":{"restartPolicy":"Never","volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backup-pvc"}}],"securityContext":{"runAsNonRoot":true,"runAsUser":65532,"runAsGroup":65532,"seccompProfile":{"type":"RuntimeDefault"}},"affinity":{"nodeAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":{"nodeSelectorTerms":[{"matchExpressions":[{"key":"kubernetes.io/hostname","operator":"NotIn","values":["k3s-1","k3s-2","k3s-3","k3w-1","k3w-2","k3w-3"]}]}]}}},"containers":[{"name":"c","image":"busybox","command":["/bin/sh","-c","find /backups -maxdepth 1 -mindepth 1 -type d -name '"'"'pvc-[0-9]*'"'"' | xargs -I{} basename {} | sort -r"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}},"volumeMounts":[{"name":"b","mountPath":"/backups","readOnly":true}]}]}}'
  if ! $KC run "$POD" -n "$NS" --restart=Never --image=busybox \
      --overrides="$OVERRIDES" --quiet 2>&1; then
    echo "(failed to schedule pvc-backup-list pod)"
    exit 1
  fi
  for _ in $(seq 1 90); do
    local PHASE; PHASE=$($KC get pod -n "$NS" "$POD" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
    [[ "$PHASE" == "Succeeded" || "$PHASE" == "Failed" ]] && break
    sleep 1
  done
  $KC logs -n "$NS" "$POD" 2>/dev/null || echo "(no PVC backups found)"
  $KC delete pod -n "$NS" "$POD" --ignore-not-found >/dev/null 2>&1 || true
}

cmd_pvc_trigger() {
  local STAMP; STAMP=$(date +%Y%m%d-%H%M%S)
  local JOB="pvc-backup-manual-${STAMP}"
  echo "Creating PVC backup job: ${JOB}"
  $KC create job -n "$NS" "$JOB" --from=cronjob/pvc-backup
  echo "Following logs (Ctrl-C detaches — job keeps running):"
  sleep 4
  $KC logs -n "$NS" -l "job-name=${JOB}" -f --tail=200 2>/dev/null || true
  local SUCCEEDED; SUCCEEDED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.succeeded}' 2>/dev/null || echo 0)
  local FAILED; FAILED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.failed}' 2>/dev/null || echo 0)
  if [[ "${SUCCEEDED}" == "1" ]]; then
    echo "✓ PVC backup complete"
  else
    echo "Job status: succeeded=${SUCCEEDED} failed=${FAILED}"
    echo "  kubectl logs -n $NS -l job-name=${JOB}"
  fi
}

cmd_pvc_restore() {
  local SVC="${1:-}"; local TS="${2:-}"
  [[ -n "$SVC" ]] || _die "Usage: backup-restore.sh pvc-restore <service> <timestamp>"
  [[ -n "$TS" ]]  || _die "Usage: backup-restore.sh pvc-restore <service> <timestamp>"

  local SVCS=()
  if [[ "$SVC" == "all" ]]; then
    SVCS=(nextcloud-files vaultwarden-data docuseal-data)
  else
    _pvc_service_mount "$SVC" >/dev/null
    SVCS=("$SVC")
  fi

  local CTX_DISPLAY="${CTX_FLAG:-$(kubectl config current-context 2>/dev/null || echo "current")}"
  echo ""
  echo "==================================================="
  echo " WORKSPACE PVC RESTORE"
  echo "==================================================="
  printf " Services   : %s\n"  "${SVCS[*]}"
  printf " Timestamp  : %s\n"  "$TS"
  printf " Namespace  : %s\n"  "$NS"
  printf " Context    : %s\n"  "$CTX_DISPLAY"
  echo ""
  echo " WARNING: The target PVC contents will be ERASED"
  echo " and replaced with the backup. Scale down the"
  echo " affected service BEFORE continuing:"
  for svc in "${SVCS[@]}"; do
    case "$svc" in
      nextcloud-files)  echo "   kubectl scale deploy/nextcloud -n $NS --replicas=0" ;;
      vaultwarden-data) echo "   kubectl scale deploy/vaultwarden -n $NS --replicas=0" ;;
      docuseal-data)    echo "   kubectl scale deploy/docuseal -n $NS --replicas=0" ;;
    esac
  done
  echo "==================================================="
  echo ""
  if [[ "$YES" != true ]]; then
    read -rp "Type 'yes' to continue: " CONFIRM
    [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }
  fi

  for svc in "${SVCS[@]}"; do
    local ARCHIVE_FILE; ARCHIVE_FILE=$(_pvc_service_mount "$svc")
    local PVC_NAME MOUNT_PATH
    case "$svc" in
      nextcloud-files)  PVC_NAME="nextcloud-data-pvc";  MOUNT_PATH="/data" ;;
      vaultwarden-data) PVC_NAME="vaultwarden-data-pvc"; MOUNT_PATH="/data" ;;
      docuseal-data)    PVC_NAME="docuseal-data-pvc";    MOUNT_PATH="/data" ;;
    esac

    echo ""
    echo "--> Restoring ${svc} from ${TS}..."
    local JOB="pvc-restore-${svc}-$$"

    $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels:
    app: pvc-restore
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: restore
          image: alpine:3
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              ENC="/backups/${TS}/${ARCHIVE_FILE}"
              [ -f "\$ENC" ] || { echo "ERROR: \$ENC not found in PVC backup"; exit 1; }
              echo "Decrypting \$ENC..."
              openssl enc -d -aes-256-cbc -pbkdf2 -in "\$ENC" -out /tmp/restore.tar.gz -pass env:BACKUP_PASSPHRASE
              echo "Clearing ${MOUNT_PATH}..."
              find ${MOUNT_PATH} -mindepth 1 -delete
              echo "Extracting into ${MOUNT_PATH}..."
              tar xzf /tmp/restore.tar.gz -C ${MOUNT_PATH}
              rm /tmp/restore.tar.gz
              echo "✓ ${svc} restored from \$ENC"
          env:
            - name: BACKUP_PASSPHRASE
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: BACKUP_PASSPHRASE
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: ["ALL"]
          volumeMounts:
            - name: backup-storage
              mountPath: /backups
              readOnly: true
            - name: target-data
              mountPath: ${MOUNT_PATH}
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
        - name: target-data
          persistentVolumeClaim:
            claimName: ${PVC_NAME}
YAML

    echo "    Waiting for PVC restore job to complete (up to 10 min)..."
    if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=600s 2>/dev/null; then
      local FAILED; FAILED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.failed}' 2>/dev/null || echo "?")
      echo "    ERROR: ${svc} restore job did not complete (failed=${FAILED})"
      echo "    Check: kubectl get pods -n $NS -l job-name=${JOB}"
      exit 1
    fi
    echo "    ✓ ${svc} restored"
  done

  echo ""
  echo "✓ PVC restore complete. Scale services back up:"
  for svc in "${SVCS[@]}"; do
    case "$svc" in
      nextcloud-files)  echo "  kubectl scale deploy/nextcloud -n $NS --replicas=1" ;;
      vaultwarden-data) echo "  kubectl scale deploy/vaultwarden -n $NS --replicas=1" ;;
      docuseal-data)    echo "  kubectl scale deploy/docuseal -n $NS --replicas=1" ;;
    esac
  done
}

case "$CMD" in
  pvc-list)    cmd_pvc_list    "$@" ;;
  pvc-trigger) cmd_pvc_trigger "$@" ;;
  pvc-restore) cmd_pvc_restore "$@" ;;
  *) _die "unknown pvc command '$CMD'" ;;
esac
