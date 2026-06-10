#!/usr/bin/env bash
# wsl-open.sh — open a URL (or local file) in the Windows default browser from WSL.
#
# This is the "once and for all" reliability bridge for brainstorming visuals/forms:
# the dev node is this WSL machine, WSL2 forwards localhost to Windows automatically,
# so any local server on 127.0.0.1:<port> is reachable at http://localhost:<port> from
# the Windows browser. This script removes the last bit of friction — the manual
# copy/paste of the URL — by launching the Windows browser directly.
#
# Usage:
#   scripts/wsl-open.sh http://localhost:52341
#   scripts/wsl-open.sh /tmp/grilling-foo.html      # local file -> served-or-file://
#
# Picks the first working opener: cmd.exe -> powershell.exe -> explorer.exe -> wslview.
# Prints the opener used (and the URL) to stderr; prints the final URL to stdout.
set -euo pipefail

target="${1:?usage: wsl-open.sh <url|path>}"

# --- Resolve target to a browser-openable URL ---------------------------------
case "$target" in
  http://*|https://*|file://*)
    url="$target"
    ;;
  *)
    # A local filesystem path. Convert to a Windows-readable file:// URL via wslpath.
    if [[ ! -e "$target" ]]; then
      echo "wsl-open: path not found: $target" >&2
      exit 2
    fi
    abs="$(readlink -f "$target")"
    if command -v wslpath >/dev/null 2>&1; then
      # \\wsl.localhost\<distro>\home\... -> forward slashes -> file:// URL
      winpath="$(wslpath -w "$abs")"
      url="file://${winpath//\\//}"
    else
      url="file://$abs"
    fi
    ;;
esac

# --- Launch the Windows browser -----------------------------------------------
# We run cmd.exe from /mnt/c to avoid the "UNC path not supported" warning that
# appears when the cwd is a \\wsl$ path. Exit codes from these launchers are
# unreliable (explorer.exe returns 1 even on success), so we treat "the command
# ran" as success and don't gate on $?.
open_url() {
  local u="$1"

  if command -v cmd.exe >/dev/null 2>&1; then
    if ( cd /mnt/c 2>/dev/null && cmd.exe /c start "" "$u" ) >/dev/null 2>&1; then
      echo "wsl-open: opened via cmd.exe -> $u" >&2; return 0
    fi
  fi
  if command -v powershell.exe >/dev/null 2>&1; then
    if powershell.exe -NoProfile -Command "Start-Process '$u'" >/dev/null 2>&1; then
      echo "wsl-open: opened via powershell.exe -> $u" >&2; return 0
    fi
  fi
  if command -v explorer.exe >/dev/null 2>&1; then
    explorer.exe "$u" >/dev/null 2>&1 || true   # exit 1 even on success
    echo "wsl-open: opened via explorer.exe -> $u" >&2; return 0
  fi
  if command -v wslview >/dev/null 2>&1; then
    wslview "$u" >/dev/null 2>&1 && { echo "wsl-open: opened via wslview -> $u" >&2; return 0; }
  fi
  return 1
}

if open_url "$url"; then
  echo "$url"
  exit 0
fi

echo "wsl-open: no working Windows browser launcher found." >&2
echo "          Open this URL manually in your Windows browser:" >&2
echo "          $url" >&2
exit 1
