#!/usr/bin/env bash
# scripts/guard-pnpm-install.sh — refuse pnpm install inside a git worktree
# whose node_modules are symlinked to the main checkout.
#
# Why: scripts/worktree-create.sh symlinks node_modules from the main checkout
# so worktrees share dependencies without reinstall. If someone runs `pnpm install`
# inside a worktree, pnpm rewrites the MAIN checkout's `.modules.yaml` with a
# worktree-relative virtual store path. When the worktree is later removed the
# path dangles, pnpm refuses any repair short of a full purge
# (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY), and `vitest` becomes unresolvable
# even though the package is in the store. [T002239-M3]
#
# Usage:
#   scripts/guard-pnpm-install.sh [package-dir]
#   Returns 0 (safe to proceed) or 1 (refused with explanation).
#
# When called without an argument, scans all pnpm workspace packages under the
# repo root for symlinked node_modules.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="${1:-}"

_refuse() {
  local pkg="$1"
  echo "❌ Refusing pnpm install in '${pkg}' — node_modules is a symlink." >&2
  echo "   You are inside a git worktree. Running 'pnpm install' here would" >&2
  echo "   rewrite the MAIN checkout's .modules.yaml with a worktree-relative" >&2
  echo "   virtual store path. When this worktree is removed, the main checkout's" >&2
  echo "   pnpm configuration is broken (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR)." >&2
  echo "   Run 'pnpm install' from the main checkout instead:" >&2
  echo "     cd ${REPO_ROOT} && pnpm install" >&2
  exit 1
}

if [ -n "$TARGET_DIR" ]; then
  # Single-package check: e.g. scripts/guard-pnpm-install.sh components/website/
  pkg_nm="$TARGET_DIR/node_modules"
  if [ -L "$pkg_nm" ]; then
    _refuse "$TARGET_DIR"
  fi
else
  # Scan all pnpm workspace packages (matching worktree-create.sh logic).
  while IFS= read -r -d '' _ws_file; do
    _pkg_dir="$(dirname "$_ws_file")"
    _pkg_rel="${_pkg_dir#"$REPO_ROOT"/}"
    [ "$_pkg_rel" = "$_pkg_dir" ] && continue  # not under repo root
    _pkg_nm="$_pkg_dir/node_modules"
    if [ -L "$_pkg_nm" ]; then
      _refuse "$_pkg_rel"
    fi
  done < <(find "$REPO_ROOT" -maxdepth 3 -name pnpm-workspace.yaml -not -path '*/node_modules/*' -print0 2>/dev/null)
fi

echo "✅ No symlinked node_modules detected — pnpm install is safe." >&2
exit 0
