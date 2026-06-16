#!/usr/bin/env bash
# scripts/vda/backup.sh — Database backup operations (delegates to backup-restore.sh)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "${SCRIPT_DIR}/backup-restore.sh" "$@"
