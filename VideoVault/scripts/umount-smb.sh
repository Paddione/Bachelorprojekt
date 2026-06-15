#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
MOUNT_DIR_NAME="${MOUNT_DIR:-Bibliothek}"
TARGET_DIR="${ROOT_DIR}/${MOUNT_DIR_NAME}"

if mountpoint -q "${TARGET_DIR}" 2>/dev/null; then
  echo "[smb] Unmounting ${TARGET_DIR}"
  if [ "${EUID}" -ne 0 ]; then
    sudo umount "${TARGET_DIR}" || sudo umount -f "${TARGET_DIR}"
  else
    umount "${TARGET_DIR}" || umount -f "${TARGET_DIR}"
  fi
else
  echo "[smb] ${TARGET_DIR} is not a mountpoint; skipping unmount"
fi

exit 0

