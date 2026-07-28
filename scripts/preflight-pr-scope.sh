#!/usr/bin/env bash
# preflight-pr-scope.sh — validate the scope in a Conventional-Commit PR title
# against the named-scope list in commitlint.config.cjs BEFORE `gh pr create`.
# [T000925]
#
# Bis T002328 wurde die Allowlist hier aus einem `scopes: |`-Block in
# .github/workflows/ci.yml geparst. Den Block gibt es dort seit der Umstellung
# auf action-semantic-pull-request nicht mehr — ci.yml hält selbst fest
# "Scopes are NOT enforced here". Der Parser lief seither immer leer und nur
# ein stiller Fallback hielt das Skript funktionsfähig. Die einzige Quelle ist
# jetzt commitlint.config.cjs, gelesen über validate-commit-msg.sh.
#
# Usage:  preflight-pr-scope.sh "<PR title>"
#
# Exit: 0 = scope valid or no scope; 1 = scope not in allowlist or SSOT unreadable.

set -euo pipefail

# Eigener Argument-Check statt ${1:?…} [T002425-M3]: die Parameter-Expansion erzeugt
# "preflight-pr-scope.sh: line 19: 1: Usage: …" — eine Bash-Fehlermeldung, in der die
# Usage-Zeile als Fehlertext des fehlenden Parameters "1" erscheint. Dass schlicht der
# PR-Titel fehlt, ist daraus nicht erkennbar.
if [ "$#" -lt 1 ]; then
  echo "preflight-pr-scope: FEHLER: PR-Titel fehlt." >&2
  echo "  Usage: preflight-pr-scope.sh \"<PR title>\"" >&2
  echo "  Beispiel: preflight-pr-scope.sh \"fix(scripts): guard xyz [T000123]\"" >&2
  exit 2
fi
TITLE="$1"

# ── Branch and Worktree Validation [T001592] ──────────────────────────────────
CURRENT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo "")"

if [ -z "$CURRENT_BRANCH" ]; then
  echo "preflight-pr-scope: FATAL: Not on any branch (detached HEAD)" >&2
  exit 1
fi

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  echo "preflight-pr-scope: FATAL: Cannot create a PR from the '$CURRENT_BRANCH' branch" >&2
  exit 1
fi

# Extract ticket ID from title if present (format: type(scope): [TXXXXXX] subject)
# Matches [T123456] or T123456
TICKET_ID="$(echo "$TITLE" | grep -oP '\[T\d{6}\]|T\d{6}' | tr -d '[]' | head -n 1 || true)"
if [ -n "$TICKET_ID" ]; then
  # Case-insensitive Vergleich [T001873]: dev-flow-chore erzeugt chore/<slug>-Branches
  # durchgehend in lowercase; die Ticket-ID im PR-Titel ist [T123456] (uppercase).
  BRANCH_LC="$(echo "$CURRENT_BRANCH" | tr '[:upper:]' '[:lower:]')"
  TICKET_LC="$(echo "$TICKET_ID" | tr '[:upper:]' '[:lower:]')"
  if [[ "$BRANCH_LC" != *"$TICKET_LC"* ]]; then
    _suggested_branch="${CURRENT_BRANCH}-${TICKET_LC}"
    echo "preflight-pr-scope: FATAL: PR title ticket ID '$TICKET_ID' does not match current branch name '$CURRENT_BRANCH'" >&2
    echo "  Fix: rename the branch to include the ticket ID, e.g.:" >&2
    echo "    git branch -m '$CURRENT_BRANCH' '$_suggested_branch'" >&2
    echo "  See T001917 (dev-flow-chore/SKILL.md, Schritt 1): create the ticket BEFORE" >&2
    echo "  naming the branch/worktree slug so this never triggers in the first place." >&2
    exit 1
  fi
fi

# Worktree verification
CURRENT_WORKTREE="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
EXPECTED_WORKTREE="$(git worktree list | grep -F "[$CURRENT_BRANCH]" | awk '{print $1}' || echo "")"

if [ -n "$EXPECTED_WORKTREE" ]; then
  ABS_CURRENT="$(cd "$CURRENT_WORKTREE" && pwd -P)"
  ABS_EXPECTED="$(cd "$EXPECTED_WORKTREE" && pwd -P)"
  if [ "$ABS_CURRENT" != "$ABS_EXPECTED" ]; then
    echo "preflight-pr-scope: FATAL: Current directory is not the correct worktree for branch '$CURRENT_BRANCH'" >&2
    echo "  Current:  $ABS_CURRENT" >&2
    echo "  Expected: $ABS_EXPECTED" >&2
    exit 1
  fi
fi

# Enforce worktree usage for feature/* and fix/* branches
if [[ "$CURRENT_BRANCH" =~ ^(feature|fix)/ ]]; then
  if [[ "$CURRENT_WORKTREE" != *"/worktrees/"* ]] && [[ "$CURRENT_WORKTREE" != *"/.worktrees/"* ]]; then
    echo "preflight-pr-scope: FATAL: PRs for feature/fix branches must be created from an isolated worktree under '.worktrees/'" >&2
    echo "  Current worktree path: $CURRENT_WORKTREE" >&2
    exit 1
  fi
fi

# Extract scope from Conventional Commit title: type(scope): subject or type(scope)!: subject
# Only the first parenthesised token after the type prefix is treated as a scope.
SCOPE="$(echo "$TITLE" | sed -nE 's/^[a-z]+\(([a-zA-Z0-9][a-zA-Z0-9-]*?)\)[!]?:\s.*/\1/p')"

if [ -z "$SCOPE" ]; then
  echo "preflight-pr-scope: no scope detected → scope-less titles are allowed" >&2
  exit 0
fi

# Ticket number scopes (e.g. T001449) are always allowed.
if [[ "$SCOPE" =~ ^T[0-9]{6}$ ]]; then
  echo "preflight-pr-scope: ticket-number scope '$SCOPE' ✓ (bypasses allowlist)" >&2
  exit 0
fi

# Allowlist aus der SSOT commitlint.config.cjs (T002328). Beide Fehlerfälle
# sind fail-closed: bisher konnte ein leeres Parse-Ergebnis stillschweigend in
# einen Fallback rutschen, wodurch ein echter Config-Defekt unsichtbar blieb.
_ssot_script="$(dirname "$0")/validate-commit-msg.sh"
if [ ! -x "$_ssot_script" ]; then
  echo "preflight-pr-scope: FATAL: '$_ssot_script' nicht gefunden oder nicht ausführbar" >&2
  exit 1
fi

_allowed="$("$_ssot_script" scopes 2>/dev/null || true)"

if [ -z "$_allowed" ]; then
  echo "preflight-pr-scope: FATAL: leere Scope-Allowlist aus commitlint.config.cjs" >&2
  exit 1
fi

if echo "$_allowed" | grep -qxF "$SCOPE"; then
  echo "preflight-pr-scope: scope '$SCOPE' ✓" >&2
  exit 0
fi

echo "preflight-pr-scope: scope '$SCOPE' is NOT in the semantic-PR allowlist" >&2
echo "Allowed scopes (from commitlint.config.cjs):" >&2
echo "$_allowed" | sed 's/^/  /' >&2
exit 1
