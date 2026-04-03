#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# setup.sh — Prerequisite checker for Workspace MVP
# ═══════════════════════════════════════════════════════════════════
# Usage:
#   ./setup.sh --check    Validate all required tools are installed
#   ./setup.sh            Same as --check (default)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

check_prerequisites() {
  local exit_code=0

  # Required tools
  local required=(kubectl docker k3d jq curl kustomize)
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
