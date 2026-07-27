#!/usr/bin/env bash
# register-scope.sh <scope> [--config <path>] — idempotently register a new
# scope in commitlint.config.cjs's namedScopes array (the SSOT, T001364).
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

# Ticket-number scopes (e.g. T001449) are auto-accepted everywhere and don't
# need registration. Silently ignore so callers don't accidentally register one.
if [[ "$SCOPE" =~ ^T[0-9]{6}$ ]]; then
  echo "register-scope: ticket-number scope '$SCOPE' is auto-allowed — nothing to do" >&2
  exit 0
fi

# Ein konsolidierter Scope darf nicht per register-scope zurückkehren — sonst
# baut sich die Allowlist Eintrag für Eintrag wieder auf (T002328). Betrifft
# Aliase (admin -> website), entfallene Systeme (tracking) und
# Quality-Goal-Codes (cq07). Läuft vor der Format-Prüfung, weil diese Namen
# das Format durchweg erfüllen und sonst stillschweigend durchrutschen.
if [ -f "$CONFIG" ] && command -v node >/dev/null 2>&1; then
  _hint="$(node -e "
    const cfg = require('$CONFIG');
    process.stdout.write(typeof cfg.scopeHint === 'function' ? cfg.scopeHint(process.argv[1]) : '');
  " "$SCOPE" 2>/dev/null || true)"
  if [ -n "$_hint" ]; then
    echo "register-scope: $_hint" >&2
    exit 1
  fi
fi

if [[ ! "$SCOPE" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "register-scope: invalid scope format '$SCOPE' (must match ^[a-z0-9][a-z0-9-]*$)" >&2
  exit 1
fi

[ -f "$CONFIG" ] || { echo "register-scope: config not found: $CONFIG" >&2; exit 2; }

if node -e "
  const cfg = require('$CONFIG');
  const scopes = cfg.namedScopes;
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
  const closeIdx = lines.findIndex((l) => l.trim() === ']' || l.trim() === '];');
  if (closeIdx === -1) { console.error('register-scope: could not find namedScopes array close'); process.exit(1); }
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
