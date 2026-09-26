#!/usr/bin/env bash
# scripts/nightly-update.sh — Nightly update of skills, plugins, apps & package managers.
#
# Runs nightly via cron:
# - Updates Bachelorprojekt skills and global agent skills to latest releases
# - Updates Claude Code marketplaces & installed plugins
# - Verifies plugin health via plugin-doctor
# - Updates WSL system packages via apt (dist-upgrade, autoremove, clean)
# - Updates package managers & runtimes: npm, bun, pnpm, uv, pip user packages
# - Upgrades installed developer CLIs: claude, opencode, etc.
#
# Usage:
#   bash /home/patrick/Bachelorprojekt/scripts/nightly-update.sh
#
# Cron entry (as user patrick):
#   0 3 * * * bash /home/patrick/Bachelorprojekt/scripts/nightly-update.sh >> /tmp/nightly-update.log 2>&1

set -uo pipefail

LOCKFILE="/tmp/wsl-nightly-update.lock"
exec 200>"$LOCKFILE"
if ! flock -n 200; then
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [nightly-update] Another update process is running. Exiting." >&2
  exit 0
fi

# Set complete PATH and environment for cron execution
export HOME="${HOME:-/home/patrick}"
export USER="${USER:-patrick}"
export PATH="${HOME}/.local/bin:${HOME}/.npm-global/bin:${HOME}/.opencode/bin:/usr/local/go/bin:${HOME}/go/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

REPO_DIR="${REPO_DIR:-/home/patrick/Bachelorprojekt}"

log() {
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [nightly-update] $*"
}

log "=== Nightly Update Started ==="

# ─────────────────────────────────────────────────────────────────────────────
# 1. System Package Manager (APT)
# ─────────────────────────────────────────────────────────────────────────────
log "--- [1/8] Updating WSL system packages (APT) ---"
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -q || log "WARNING: apt-get update failed"
  sudo DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y -q \
    -o Dpkg::Options::="--force-confdef" \
    -o Dpkg::Options::="--force-confold" || log "WARNING: apt-get dist-upgrade failed"
  sudo apt-get autoremove -y -q || true
  sudo apt-get clean || true
  log "APT update completed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Snaps (if active)
# ─────────────────────────────────────────────────────────────────────────────
if command -v snap >/dev/null 2>&1; then
  log "--- [2/8] Refreshing snap packages ---"
  sudo snap refresh 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Node & JavaScript Runtimes / Package Managers (NPM, Bun, PNPM)
# ─────────────────────────────────────────────────────────────────────────────
log "--- [3/8] Updating npm, bun, pnpm packages & runtimes ---"
if command -v npm >/dev/null 2>&1; then
  npm update -g || log "WARNING: npm update -g encountered issues"
fi

if command -v bun >/dev/null 2>&1; then
  bun upgrade 2>/dev/null || true
  bun update -g 2>/dev/null || true
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm update -g 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. Python Ecosystem (UV & Pip User Packages)
# ─────────────────────────────────────────────────────────────────────────────
log "--- [4/8] Updating Python tools (uv & pip user packages) ---"
if command -v uv >/dev/null 2>&1; then
  uv self update 2>/dev/null || true
  uv tool upgrade --all 2>/dev/null || true
fi

if command -v python3 >/dev/null 2>&1 && python3 -m pip --version >/dev/null 2>&1; then
  outdated_pip=$(python3 -m pip list --user --outdated --format=freeze 2>/dev/null | cut -d= -f1 || true)
  if [ -n "$outdated_pip" ]; then
    log "Updating outdated pip user packages: $outdated_pip"
    echo "$outdated_pip" | xargs -r -n1 python3 -m pip install --user --upgrade 2>/dev/null || true
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. Developer CLI Tools (Claude Code & OpenCode)
# ─────────────────────────────────────────────────────────────────────────────
log "--- [5/8] Updating Developer CLIs (claude, opencode) ---"
if command -v claude >/dev/null 2>&1; then
  claude update 2>/dev/null || true
fi

if command -v opencode >/dev/null 2>&1; then
  opencode upgrade 2>/dev/null || true
fi

if [ -f "${HOME}/go/bin/gopls" ] && command -v go >/dev/null 2>&1; then
  go install golang.org/x/tools/gopls@latest 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. Claude Code Plugins & Marketplaces
# ─────────────────────────────────────────────────────────────────────────────
log "--- [6/8] Updating Claude Code plugin marketplaces & installed plugins ---"
if command -v claude >/dev/null 2>&1; then
  claude plugin marketplace update 2>/dev/null || true

  # Iterate over all installed plugins and update each to latest release
  INSTALLED_PLUGINS_JSON="${HOME}/.claude/plugins/installed_plugins.json"
  if [ -f "$INSTALLED_PLUGINS_JSON" ]; then
    PLUGINS=$(python3 -c "
import json
try:
    with open('$INSTALLED_PLUGINS_JSON') as f:
        data = json.load(f)
    for p in data.get('plugins', {}).keys():
        print(p)
except Exception:
    pass
" 2>/dev/null)
    for plugin in $PLUGINS; do
      [ -n "$plugin" ] || continue
      log "Checking update for plugin: $plugin"
      claude plugin update -y "$plugin" 2>/dev/null || true
    done
  fi

  # Run plugin-doctor check in Bachelorprojekt
  if [ -f "${REPO_DIR}/scripts/plugin-doctor.sh" ]; then
    bash "${REPO_DIR}/scripts/plugin-doctor.sh" || log "WARNING: plugin-doctor detected drift"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 7. Agent Skills & Vendor Sync (Bachelorprojekt & Global)
# ─────────────────────────────────────────────────────────────────────────────
log "--- [7/8] Updating Agent Skills & Vendor Components (Project & Global) ---"
if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR"
  log "Updating project skills in Bachelorprojekt via skills CLI..."
  npx -y skills update -y || log "WARNING: npx skills update in Bachelorprojekt failed"

  if [ -f "scripts/vendor-sync.py" ]; then
    log "Updating external vendor skills and plugins via vendor-sync.py..."
    python3 scripts/vendor-sync.py update --report /tmp/vendor-report.json || log "WARNING: vendor-sync update reported findings"
    python3 scripts/vendor-sync.py check || log "WARNING: vendor-sync check reported drift"
  fi

  if [ -f "scripts/agent-skills/project.mjs" ]; then
    node scripts/agent-skills/project.mjs --check || log "WARNING: agent-skills projection drift detected"
  fi
fi

log "Updating global skills..."
npx -y skills update -g -y || log "WARNING: npx skills update -g failed"

# ─────────────────────────────────────────────────────────────────────────────
# 8. Finished
# ─────────────────────────────────────────────────────────────────────────────
log "=== Nightly Update Completed Successfully ==="
