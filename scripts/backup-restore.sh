#!/usr/bin/env bash
# scripts/backup-restore.sh — Workspace backup management dispatcher
# All operations target the backup-pvc inside the workspace namespace.
# This file is a thin dispatcher; implementations live in backup-restore-{db,pvc,filen,recovery}.sh.
# The recovery subcommand path renders k3d/recovery-browser.yaml through envsubst
# (see backup-restore-recovery.sh and backup-restore-lib.sh _render_recovery_browser).
# The 'restore' subcommand chains workspace:sync-db-passwords automatically
# (see backup-restore-db.sh cmd_db_restore post-restore guidance).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NS=workspace
SCRIPT=$(basename "$0")
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
# shellcheck source=backup-restore-lib.sh
source "$SCRIPT_DIR/backup-restore-lib.sh"

usage() {
  cat <<EOF
Usage: $SCRIPT <command> [options]

Commands (database):
  list                       List available DB backup timestamps
  trigger                    Trigger an immediate DB backup now
  restore <db> <timestamp>   Restore database(s) from a backup
    db:        keycloak | nextcloud | vaultwarden | website | docuseal | all
    timestamp: directory from 'list' (e.g. 20260427-020001)

Commands (PVC file data):
  pvc-list                         List available PVC backup timestamps
  pvc-trigger                      Trigger an immediate PVC backup now
  pvc-restore <service> <timestamp> Restore PVC data from a backup
    service:   nextcloud-files | vaultwarden-data | docuseal-data | all
    timestamp: directory from 'pvc-list' (e.g. pvc-20260427-030001)
    IMPORTANT: scale down the target service before restoring, e.g.:
      kubectl scale deploy/nextcloud -n <ns> --replicas=0 --context <ctx>

Commands (disaster recovery — fresh cluster):
  filen-pull <timestamp> [--remote-path <path>]
                             Download a backup timestamp from Filen cloud into
                             the in-cluster backup-pvc, so the existing
                             'restore' / 'pvc-restore' commands can run on a
                             freshly-deployed cluster (where backup-pvc is empty).
                             Remote path defaults to backup-config's
                             FILEN_DEFAULT_UPLOAD_PATH. Timestamps are discovered
                             out-of-band (Filen web/desktop app or 'filen ls').

Commands (browsable recovery — stage, browse, selectively restore):
  stage <timestamp> <db|service>      Decrypt one entry into a browsable staging area
                                        db → <db>_recovery inspection DB; service →
                                        recovery-pvc:/recovery/<ts>/<service>/
  verify <timestamp> <db>             Prove a DB dump restores; print table counts; drop temp
  browse                              Bring up the on-demand recovery filebrowser (SSO)
  unbrowse                            Tear the filebrowser down
  restore-file <timestamp> <service> <path>   Copy ONE staged path back into the live PVC
  restore-table <timestamp> <db> <table>      Restore ONE table back into the live DB
  unstage <timestamp>                 Drop *_recovery DBs + clear the staging dir

Options:
  --context <ctx>   kubectl context (default: active context)
  --namespace <ns>  Kubernetes namespace (default: workspace)
  --remote-path <p> Filen remote base path (overrides backup-config default)
  -y, --yes         Skip confirmation prompt for restore
  -h, --help        Show this help

Examples:
  $SCRIPT list
  $SCRIPT pvc-list --context fleet --namespace workspace
  $SCRIPT pvc-trigger
  $SCRIPT pvc-restore nextcloud-files pvc-20260427-030001 --context fleet --namespace workspace -y
  $SCRIPT restore all 20260427-020001 --context fleet --namespace workspace-korczewski -y
EOF
}

# ── Flag parsing ──────────────────────────────────────────────────────────────
CTX_FLAG=""
YES=false
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)     CTX_FLAG="--context $2"; shift 2 ;;
    --namespace)   NS="$2"; shift 2 ;;
    --remote-path) REMOTE_PATH="$2"; shift 2 ;;
    -y|--yes)      YES=true; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done
set -- "${POSITIONAL[@]+"${POSITIONAL[@]}"}"

CMD="${1:-}"; shift || true
KC="kubectl ${CTX_FLAG}"

# Export globals so child subcommand scripts inherit them.
export NS CTX_FLAG YES REPO_ROOT REMOTE_PATH KC SCRIPT

# Route to subcommand script
case "$CMD" in
  list|trigger|restore)             exec "$SCRIPT_DIR/backup-restore-db.sh"      "$CMD" "$@" ;;
  pvc-list|pvc-trigger|pvc-restore) exec "$SCRIPT_DIR/backup-restore-pvc.sh"     "$CMD" "$@" ;;
  filen-pull)                       exec "$SCRIPT_DIR/backup-restore-filen.sh"   "$CMD" "$@" ;;
  stage|verify|browse|unbrowse|restore-file|restore-table|unstage)
                                   exec "$SCRIPT_DIR/backup-restore-recovery.sh" "$CMD" "$@" ;;
  "") usage; exit 1 ;;
  *)  _die "unknown command '$CMD' (try --help)" ;;
esac
