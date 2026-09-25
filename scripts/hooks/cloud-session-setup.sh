#!/usr/bin/env bash
# scripts/hooks/cloud-session-setup.sh — SessionStart-Hook fuer Claude Code on the web.
#
# Laeuft nur, wenn CLAUDE_CODE_REMOTE=true gesetzt ist (Cloud-Container); lokal
# ist der Hook ein No-op. Richtet ein, was der frische Container nicht mitbringt:
#   1. gh-axi (npm, Anzeige-Wrapper — vom gh-axi-SessionStart-Hook erwartet)
#   2. gh     (GitHub-Release-Tarball — Mutationen/--json laufen ueber gh direkt)
#   3. ~/brain -> <Workspace>/brain (brain-mcp-node liest BRAIN_WIKI_DIR=~/brain/wiki;
#      der Clone selbst kommt aus den Session-Sources, sofern Paddione/brain
#      dort eingetragen ist)
#   4. components/website/node_modules (npm ci, im Hintergrund — dauert Minuten)
#
# Jeder Schritt ist idempotent und fail-soft: ein Fehler wird gemeldet, bricht
# den Sessionstart aber nie ab.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GH_VERSION="${GH_VERSION:-2.63.2}"
LOG_DIR="${TMPDIR:-/tmp}/cloud-session-setup"
mkdir -p "$LOG_DIR"

say() { printf '[cloud-session-setup] %s\n' "$*" >&2; }

# 1. gh-axi
if ! command -v gh-axi >/dev/null 2>&1; then
  if npm install -g --silent gh-axi >"$LOG_DIR/gh-axi.log" 2>&1; then
    say "gh-axi installiert"
  else
    say "gh-axi-Installation fehlgeschlagen (siehe $LOG_DIR/gh-axi.log)"
  fi
fi

# 2. gh
if ! command -v gh >/dev/null 2>&1; then
  case "$(uname -m)" in
    x86_64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) arch="" ;;
  esac
  if [ -n "$arch" ]; then
    tmp="$(mktemp -d)"
    url="https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${arch}.tar.gz"
    if curl -fsSL "$url" -o "$tmp/gh.tgz" && tar -xzf "$tmp/gh.tgz" -C "$tmp" \
       && install -m 0755 "$tmp/gh_${GH_VERSION}_linux_${arch}/bin/gh" /usr/local/bin/gh; then
      say "gh ${GH_VERSION} installiert"
    else
      say "gh-Installation fehlgeschlagen ($url)"
    fi
    rm -rf "$tmp"
  fi
fi

# 3. Brain-Wiki
if [ ! -e "$HOME/brain" ]; then
  brain_src="$(dirname "$REPO")/brain"
  if [ -d "$brain_src/wiki" ]; then
    ln -s "$brain_src" "$HOME/brain" && say "$HOME/brain -> $brain_src verlinkt"
  else
    say "Brain-Wiki fehlt: Paddione/brain als Repository in der Cloud-Umgebung eintragen"
  fi
fi

# 4. Website-Dependencies (Hintergrund, blockiert den Sessionstart nicht)
if [ -f "$REPO/components/website/package.json" ] && [ ! -d "$REPO/components/website/node_modules" ]; then
  # Gleicher Installer wie CI (.github/workflows/ci.yml: pnpm 10, --frozen-lockfile)
  if command -v pnpm >/dev/null 2>&1; then
    cmd="pnpm install --frozen-lockfile"
  else
    cmd="npx -y pnpm@10 install --frozen-lockfile"
  fi
  (cd "$REPO/components/website" && nohup bash -c "$cmd" >"$LOG_DIR/website-deps.log" 2>&1 &)
  say "Website-Dependencies werden im Hintergrund installiert (Log: $LOG_DIR/website-deps.log)"
fi

exit 0
