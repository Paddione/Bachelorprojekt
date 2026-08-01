#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# setup.sh — Prerequisite checker for Workspace MVP
# ═══════════════════════════════════════════════════════════════════
# Usage:
#   ./setup.sh --check    Validate all required tools are installed
#   ./setup.sh            Same as --check (default)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# T002250-M1: WSL Docker Desktop credsStore fix
# Docker Desktop sets credsStore=desktop.exe which breaks docker CLI in WSL.
# Strip it automatically so docker pull/push work inside WSL distros.
fix_wsl_docker_creds() {
  if [ -z "${WSL_DISTRO_NAME:-}" ]; then return 0; fi
  local cfg="${HOME:-~}/.docker/config.json"
  if [ -f "$cfg" ] && grep -q '"credsStore"' "$cfg" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    if jq 'del(.credsStore)' "$cfg" > "$tmp" 2>/dev/null; then
      mv "$tmp" "$cfg"
      echo "  [FIX]  stripped credsStore from $cfg (WSL compat)" >&2
    else
      rm -f "$tmp"
    fi
  fi
}
fix_wsl_docker_creds

check_prerequisites() {
  local exit_code=0

  # Required tools
  local required=(kubectl docker k3d jq curl kustomize yq)
  for cmd in "${required[@]}"; do
    if command -v "$cmd" &>/dev/null; then
      echo "  [OK]  ${cmd} ($(command -v "$cmd"))"
    else
      echo "  [MISS] ${cmd} — required but not found"
      exit_code=1
    fi
  done

  # Optional tools (warn only)
  local optional=(helm skaffold kubeconform mmctl)
  for cmd in "${optional[@]}"; do
    if command -v "$cmd" &>/dev/null; then
      echo "  [OK]  ${cmd} (optional)"
    else
      echo "  [WARN] ${cmd} — optional, not found"
    fi
  done

  # Docker daemon running
  if docker info &>/dev/null; then
    echo "  [OK]  Docker daemon running"
  else
    echo "  [MISS] Docker daemon not running"
    exit_code=1
  fi

  return $exit_code
}

case "${1:-}" in
  --check|"")
    echo "Checking prerequisites..."
    if check_prerequisites; then
      echo ""
      echo "All required prerequisites met."
    else
      echo ""
      echo "Some prerequisites are missing. Please install them before proceeding."
      exit 1
    fi
    ;;
  -h|--help)
    echo "Usage: $0 [--check]"
    echo "  --check   Validate all required tools are installed (default)"
    ;;
  *)
    echo "Unknown option: $1"
    echo "Usage: $0 [--check]"
    exit 1
    ;;
esac
