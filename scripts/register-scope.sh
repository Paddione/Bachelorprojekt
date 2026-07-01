#!/usr/bin/env bash
# register-scope.sh <scope> [--config <path>] — idempotently register a new
# scope in commitlint.config.cjs's scope-enum (the SSOT, T001364).
set -euo pipefail

SCOPE="${1:?Usage: register-scope.sh <scope> [--config <path>]}"
shift || true

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$repo_root/commitlint.config.cjs"

while [ $# -gt 0 ]; do
  case "$1" in
    --config) CONFIG="$2"; shift 2 ;;
    *) echo "usage: register-scope.sh <scope> [--config <path>]" >&2; exit 2 ;;
  esac
done

if [[ ! "$SCOPE" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "register-scope: invalid scope format '$SCOPE' (must match ^[a-z0-9][a-z0-9-]*$)" >&2
  exit 1
fi

[ -f "$CONFIG" ] || { echo "register-scope: config not found: $CONFIG" >&2; exit 2; }

if node -e "
  const cfg = require('$CONFIG');
  const scopes = cfg.rules['scope-enum'][2];
  process.exit(scopes.includes('$SCOPE') ? 0 : 1);
"; then
  echo "register-scope: scope '$SCOPE' is already registered — nothing to do" >&2
  exit 1
fi

# Text-line insert: find the array's closing bracket line and append a new
# line with matching indent/quoting directly before it. Avoids a full AST
# rewrite; preserves comments/formatting in the rest of the file.
node -e "
  const fs = require('fs');
  const path = '$CONFIG';
  const scope = '$SCOPE';
  const lines = fs.readFileSync(path, 'utf8').split('\n');
  const closeIdx = lines.findIndex((l) => l.trim() === ']');
  if (closeIdx === -1) { console.error('register-scope: could not find scope-enum array close'); process.exit(1); }
  const prevIdx = closeIdx - 1;
  const indent = lines[prevIdx].match(/^\s*/)[0];
  // Ensure the previous last-entry line ends with a trailing comma before
  // splicing in the new entry — two adjacent string literals with no
  // separator would otherwise produce a syntax error (T001364 bug fix).
  const trimmedPrev = lines[prevIdx].replace(/\s+\$/, '');
  if (trimmedPrev && !trimmedPrev.endsWith(',')) {
    lines[prevIdx] = trimmedPrev + ',';
  }
  lines.splice(closeIdx, 0, indent + \"'\" + scope + \"',\");
  fs.writeFileSync(path, lines.join('\n'));
"

echo "register-scope: added '$SCOPE' to $CONFIG"
exit 0
