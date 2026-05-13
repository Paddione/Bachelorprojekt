#!/usr/bin/env bash
# scripts/superpowers-helper-patch.sh — make the brainstorming visual-companion
# WebSocket protocol-aware so the click loop survives when the page is served
# over HTTPS (mixed-content blocks `ws://` from `https://` pages).
#
# Why: superpowers' brainstorming/scripts/helper.js hardcodes
#   const WS_URL = 'ws://' + window.location.host;
# Through https://brainstorm.mentolder.de the browser refuses the insecure
# upgrade and the click never reaches the server. Patching to a
# protocol-aware expression lets the loop work over both http and https.
#
# Idempotent: re-runs only re-apply against files that still have the old
# hardcoded `ws://` literal. Safe to wire as a SessionStart hook.
#
# Usage:
#   bash scripts/superpowers-helper-patch.sh         # patch + report
#   bash scripts/superpowers-helper-patch.sh --check # exit 1 if any file unpatched

set -euo pipefail

MODE="${1:-apply}"

OLD_LINE="const WS_URL = 'ws://' + window.location.host;"
NEW_LINE="const WS_URL = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;"

shopt -s nullglob globstar

patched=0
already=0
unpatched=0
missing_root=1

for root in \
  "$HOME/.claude/plugins/cache" \
  "$HOME/.config/claude/plugins/cache"
do
  [[ -d "$root" ]] || continue
  missing_root=0
  for helper in "$root"/**/superpowers/**/skills/brainstorming/scripts/helper.js; do
    [[ -f "$helper" ]] || continue
    if grep -qF "$NEW_LINE" "$helper"; then
      already=$((already+1))
      continue
    fi
    if ! grep -qF "$OLD_LINE" "$helper"; then
      # Some other unexpected content — don't touch.
      echo "skip (unrecognised content): $helper" >&2
      unpatched=$((unpatched+1))
      continue
    fi
    if [[ "$MODE" == "--check" ]]; then
      echo "unpatched: $helper" >&2
      unpatched=$((unpatched+1))
      continue
    fi
    # In-place replacement, no backup file (the plugin cache is regenerated
    # from upstream on every superpowers sync — there's nothing to roll back
    # to that the upstream tarball doesn't already hold).
    sed -i "s|${OLD_LINE}|${NEW_LINE}|" "$helper"
    patched=$((patched+1))
    echo "patched: $helper"
  done
done

if [[ "$missing_root" -eq 1 ]]; then
  echo "no claude plugin cache directories found — nothing to patch" >&2
  exit 0
fi

if [[ "$MODE" == "--check" ]]; then
  if [[ "$unpatched" -gt 0 ]]; then
    echo "${unpatched} helper.js file(s) still need patching — run without --check" >&2
    exit 1
  fi
  echo "all helper.js files are patched (${already} ok)"
  exit 0
fi

echo "superpowers helper.js: ${patched} patched, ${already} already-ok, ${unpatched} skipped"
