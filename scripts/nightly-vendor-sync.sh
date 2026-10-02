#!/usr/bin/env bash
# scripts/nightly-vendor-sync.sh — Schritt 7 von nightly-update.sh: Vendor-Skills und
# -Plugins des Repos anheben, ohne den Hauptcheckout zu beruehren. [T900454]
#
# Die Updater (skills-CLI, vendor-sync.py) schreiben in ihr Arbeitsverzeichnis. Bis
# T900454 war das der Hauptcheckout: die Aenderungen blieben dort uncommittet liegen
# (Befund 2026-09-30, sieben abweichende Dateien). Dieses Skript legt einen eigenen
# Worktree von origin/main an, laesst die Updater dort laufen und reicht das Ergebnis
# als PR ein. Der Worktree liegt ausserhalb von .worktrees/, damit fremde Cleanups ihn
# nicht mitten im Lauf entfernen.
#
# Usage:
#   bash scripts/nightly-vendor-sync.sh
#
# Env:
#   REPO_DIR            Hauptcheckout (Default: Elternverzeichnis dieses Skripts)
#   NIGHTLY_WT_DIR      Worktree-Pfad (Default: ~/runs/nightly-vendor-sync)
#   NIGHTLY_UPDATE_CMD  Test-Override: ersetzt die Updater-Aufrufe im Worktree
#
# Exit: 0 = PR eingereicht, nichts zu tun oder ein Nightly-PR ist noch offen
#       1 = Fehler (der Hauptcheckout bleibt in jedem Fall unberuehrt)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(dirname "$SCRIPT_DIR")}"
WT="${NIGHTLY_WT_DIR:-${HOME}/runs/nightly-vendor-sync}"
BRANCH_PREFIX="chore/nightly-vendor-sync-T900454"
TODAY="$(date -u +%Y-%m-%d)"
BRANCH="${BRANCH_PREFIX}-$(date -u +%Y%m%d)"

log() {
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [nightly-vendor-sync] $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

# Der Branch liegt nach dem Push auf origin; lokal wird er nicht mehr gebraucht.
cleanup() {
  cd "$REPO_DIR" 2>/dev/null || return 0
  # worktree-create.sh sperrt den Worktree; ohne unlock scheitert remove.
  git worktree unlock "$WT" >/dev/null 2>&1 || true
  git worktree remove --force "$WT" >/dev/null 2>&1 || true
  git worktree prune >/dev/null 2>&1 || true
  git branch -D "$BRANCH" >/dev/null 2>&1 || true
}

run_updates() {
  if [ -n "${NIGHTLY_UPDATE_CMD:-}" ]; then
    bash -c "$NIGHTLY_UPDATE_CMD"
    return
  fi

  log "Updating project skills via skills CLI..."
  npx -y skills update -y || log "WARNING: npx skills update failed"

  if [ -f "scripts/vendor-sync.py" ]; then
    log "Updating external vendor skills and plugins via vendor-sync.py..."
    python3 scripts/vendor-sync.py update --report /tmp/vendor-report.json || log "WARNING: vendor-sync update reported findings"
    python3 scripts/vendor-sync.py check || log "WARNING: vendor-sync check reported drift"
  fi

  if [ -f "scripts/agent-skills/project.mjs" ]; then
    node scripts/agent-skills/project.mjs --check || log "WARNING: agent-skills projection drift detected"
  fi
}

[ -d "$REPO_DIR/.git" ] || fail "$REPO_DIR ist kein Git-Checkout"

git -C "$REPO_DIR" fetch --quiet origin main || fail "git fetch origin main fehlgeschlagen"

# Ein noch offener Nightly-PR wartet auf CI oder auf einen Menschen. Ein zweiter PR
# daneben wuerde dieselben Dateien anfassen und sich mit ihm ueberschneiden.
open_heads="$(cd "$REPO_DIR" && gh pr list --state open --limit 100 --json headRefName --jq '.[].headRefName')" \
  || fail "gh pr list fehlgeschlagen"
if grep -q "^${BRANCH_PREFIX}-" <<<"$open_heads"; then
  log "Offener Nightly-PR vorhanden ($(grep "^${BRANCH_PREFIX}-" <<<"$open_heads" | head -1)) — kein neuer Lauf"
  exit 0
fi

# ls-remote --exit-code: 0 = Branch vorhanden, 2 = nicht vorhanden, sonst Fehler.
remote_rc=0
git -C "$REPO_DIR" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1 || remote_rc=$?
case "$remote_rc" in
  0) log "Branch $BRANCH liegt bereits auf origin — der Lauf von heute ist eingereicht"; exit 0 ;;
  2) ;;
  *) fail "git ls-remote origin fehlgeschlagen (rc=$remote_rc)" ;;
esac

# Reste eines abgebrochenen Laufs entfernen, dann frisch von origin/main anlegen.
cleanup
mkdir -p "$(dirname "$WT")" || fail "Worktree-Elternverzeichnis nicht anlegbar: $(dirname "$WT")"
trap cleanup EXIT
(cd "$REPO_DIR" && bash "$SCRIPT_DIR/worktree-create.sh" --unattended --no-main-sync "$BRANCH" "$WT") \
  || fail "worktree-create.sh fehlgeschlagen"
cd "$WT" || fail "Worktree $WT nicht betretbar"

run_updates

if [ -z "$(git status --porcelain)" ]; then
  log "Keine Upstream-Aenderungen — kein PR"
  exit 0
fi

# environments/.secrets ist git-crypt-verwaltet und gehoert nie in einen Bot-Commit.
git add -A -- . ':!environments/.secrets' || fail "git add fehlgeschlagen"
git diff --cached --quiet && { log "Nur ausgeschlossene Pfade geaendert — kein PR"; exit 0; }

title="chore(T900454): nightly vendor-sync ${TODAY} [T900454]"
git commit -q -m "$title" || fail "git commit fehlgeschlagen"

body_file="$(mktemp)"
{
  echo "Automatischer Lauf von \`scripts/nightly-vendor-sync.sh\` (${TODAY})."
  echo
  echo '```'
  git show --stat --format= HEAD
  echo '```'
  echo
  echo "Ticket: T900454"
} > "$body_file"

git push --quiet -u origin "$BRANCH" || { rm -f "$body_file"; fail "git push fehlgeschlagen"; }
pr_url="$(gh pr create --base main --head "$BRANCH" --title "$title" --body-file "$body_file")" \
  || { rm -f "$body_file"; fail "gh pr create fehlgeschlagen"; }
rm -f "$body_file"

log "PR eingereicht: $pr_url"
