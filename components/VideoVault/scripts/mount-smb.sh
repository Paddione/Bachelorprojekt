#!/usr/bin/env bash
set -euo pipefail

# Load env vars if present
if [ -f "env/.env-smb.local" ]; then
  # shellcheck disable=SC1091
  source "env/.env-smb.local"
elif [ -f "env/.env-smb" ]; then
  # shellcheck disable=SC1091
  source "env/.env-smb"
elif [ -f "env/.env-smb.example" ]; then
  # shellcheck disable=SC1091
  source "env/.env-smb.example"
fi

SMB_HOST=${SMB_HOST:-}
SMB_SHARE=${SMB_SHARE:-}
SMB_SUBPATH=${SMB_SUBPATH:-}
MOUNT_DIR=${MOUNT_DIR:-Bibliothek}
SMB_USER=${SMB_USER:-}
SMB_PASS=${SMB_PASS:-}
SMB_VERSION=${SMB_VERSION:-3.0}
SMB_WIN_PATH=${SMB_WIN_PATH:-}

if [ -z "${SMB_HOST}" ] || [ -z "${SMB_SHARE}" ]; then
  echo "[smb] Please set SMB_HOST and SMB_SHARE in env/.env-smb.local (see env/.env-smb.example)" >&2
  exit 1
fi

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
TARGET_DIR="${ROOT_DIR}/${MOUNT_DIR}"

mkdir -p "${TARGET_DIR}"

unameOut=$(uname -s)
case "$unameOut" in
  Linux*)   OS=Linux;;
  Darwin*)  OS=Mac;;
  *)        OS=Other;;
esac

# Detect WSL and override OS marker
if grep -qi microsoft /proc/version 2>/dev/null; then
  OS="WSL"
fi

if [ "$OS" = "WSL" ] && [ -n "${SMB_WIN_PATH}" ]; then
  if [ ! -d "${SMB_WIN_PATH}" ]; then
    echo "[smb] SMB_WIN_PATH does not exist: ${SMB_WIN_PATH}" >&2
    exit 1
  fi
  echo "[smb] WSL bind-mount ${SMB_WIN_PATH} -> ${TARGET_DIR}"
  mkdir -p "${TARGET_DIR}"
  if mountpoint -q "${TARGET_DIR}" 2>/dev/null; then
    echo "[smb] ${TARGET_DIR} already mounted"
    exit 0
  fi
  if [ "${EUID}" -ne 0 ]; then
    sudo mount --bind "${SMB_WIN_PATH}" "${TARGET_DIR}"
  else
    mount --bind "${SMB_WIN_PATH}" "${TARGET_DIR}"
  fi
  echo "[smb] Mounted at ${TARGET_DIR}"
  exit 0
fi

if [ "$OS" = "Linux" ]; then
  if ! command -v mount.cifs >/dev/null 2>&1; then
    echo "[smb] mount.cifs not found. Please install cifs-utils (e.g., sudo apt install cifs-utils)" >&2
    exit 1
  fi

  # Build remote path and options
  REMOTE="//${SMB_HOST}/${SMB_SHARE}"
  OPTS="vers=${SMB_VERSION},rw,uid=$(id -u),gid=$(id -g),file_mode=0664,dir_mode=0775"
  if [ -n "${SMB_USER}" ]; then
    OPTS=",username=${SMB_USER},password=${SMB_PASS},${OPTS}"
  else
    OPTS=",guest,${OPTS}"
  fi
  # Mount a subdirectory if provided (prefixpath is supported by cifs)
  if [ -n "${SMB_SUBPATH}" ]; then
    OPTS=",prefixpath=${SMB_SUBPATH},${OPTS}"
  fi

  echo "[smb] Mounting ${REMOTE}${SMB_SUBPATH:+/${SMB_SUBPATH}} -> ${TARGET_DIR}"
  if [ "${EUID}" -ne 0 ]; then
    sudo mount -t cifs "${REMOTE}" "${TARGET_DIR}" -o "${OPTS}"
  else
    mount -t cifs "${REMOTE}" "${TARGET_DIR}" -o "${OPTS}"
  fi
  echo "[smb] Mounted at ${TARGET_DIR}"
  exit 0
fi

if [ "$OS" = "Mac" ]; then
  if ! command -v mount_smbfs >/dev/null 2>&1; then
    echo "[smb] mount_smbfs not found." >&2
    exit 1
  fi
  # macOS cannot easily mount a subpath; use the full UNC if provided
  UNC="//${SMB_USER:+${SMB_USER}:${SMB_PASS}@}${SMB_HOST}/${SMB_SHARE}"
  if [ -n "${SMB_SUBPATH}" ]; then
    UNC="${UNC}/${SMB_SUBPATH}"
  fi
  echo "[smb] Mounting ${UNC} -> ${TARGET_DIR}"
  mount_smbfs "${UNC}" "${TARGET_DIR}"
  echo "[smb] Mounted at ${TARGET_DIR}"
  exit 0
fi

echo "[smb] Unsupported OS for mount script. On Windows, run scripts/mount-smb.ps1 via PowerShell." >&2
exit 2
