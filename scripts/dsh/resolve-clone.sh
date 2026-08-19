#!/usr/bin/env bash
# scripts/dsh/resolve-clone.sh — Pfad zum deepseek-harness-Klon ermitteln.
#
# [T012965] Der Klon ist gitignoriert (T012960) und liegt deshalb NUR im
# Haupt-Checkout. In einem Worktree legt scripts/worktree-create.sh lediglich
# einen `deepseek-harness/node_modules`-Symlink an — ein Verzeichnis ohne
# package.json. Eine Pruefung auf "node_modules existiert" ist dort wahr und
# der anschliessende `pnpm` bricht mit ERR_PNPM_NO_PKG_MANIFEST ab.
#
# Reihenfolge: $DSH_DIR (Override) > Repo-lokaler Klon > Haupt-Checkout.
# Ein Kandidat zaehlt nur mit package.json — das unterscheidet den echten Klon
# vom Symlink-Gerippe.
#
# Usage:  clone_dir="$(bash scripts/dsh/resolve-clone.sh "$REPO")"  # Exit 2 wenn keiner
resolve_dsh_clone() {
  local repo="$1" candidate common_dir main_checkout

  # Ein explizit gesetztes DSH_DIR ist eine Anweisung, kein Vorschlag: ist es
  # ungueltig, wird es gemeldet statt still durch einen anderen Klon ersetzt —
  # sonst startet man unbemerkt den falschen Baum.
  if [[ -n "${DSH_DIR:-}" ]]; then
    [[ -f "$DSH_DIR/package.json" ]] && { printf '%s\n' "$DSH_DIR"; return 0; }
    return 2
  fi

  candidate="$repo/deepseek-harness"
  [[ -f "$candidate/package.json" ]] && { printf '%s\n' "$candidate"; return 0; }

  # Worktree: ueber das gemeinsame gitdir zurueck auf den Haupt-Checkout.
  common_dir="$(git -C "$repo" rev-parse --git-common-dir 2>/dev/null)" || return 2
  [[ "$common_dir" != /* ]] && common_dir="$repo/$common_dir"
  main_checkout="$(dirname "$common_dir")"
  [[ -f "$main_checkout/deepseek-harness/package.json" ]] && {
    printf '%s\n' "$main_checkout/deepseek-harness"; return 0
  }
  return 2
}

# Direktaufruf: Pfad auf stdout, Exit 2 wenn nicht auffindbar.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if ! resolve_dsh_clone "${1:-$PWD}"; then
    echo "resolve-clone: no deepseek-harness checkout with a package.json found" >&2
    echo "  looked at: \${DSH_DIR:-<unset>}, <repo>/deepseek-harness, <main-checkout>/deepseek-harness" >&2
    exit 2
  fi
fi
