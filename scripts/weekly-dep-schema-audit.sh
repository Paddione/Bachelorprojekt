#!/usr/bin/env bash
set -euo pipefail
# Weekly dependency + schema audit (runs every Monday 07:00)
# Creates branch, audits, commits changes, pushes, and creates PR.

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo "/home/patrick/Bachelorprojekt")"

SLUG="weekly-dep-schema-audit"
BRANCH="chore/${SLUG}"
WORKTREE=".worktrees/${SLUG}"
TICKET_TITLE="chore: weekly dep + schema audit $(date +%Y-%m-%d)"

# Sync main
git fetch origin main
if git diff --quiet HEAD; then
  git pull --rebase origin main
else
  git stash && git pull --rebase origin main && git stash pop || true
fi

# Create worktree
bash scripts/worktree-create.sh "$BRANCH" "$WORKTREE"
cd "$WORKTREE"

# Create audit ticket
TICKET_RESULT=$(./scripts/ticket.sh create --type task --brand mentolder --title "$TICKET_TITLE" --status done --description "Branch: $BRANCH"$'\n'"Kein Plan — direktes Chore.")
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)

# === AUDIT ===
CHANGED=false

# 1. Schema audit: check ${VAR} refs in manifests vs schema.yaml
SCHEMA_VARS=$(grep -E '^\s+- name: ' environments/schema.yaml | sed 's/.*name: //' | sort -u)
UNREGISTERED=$(grep -rnoP '\$\{([A-Z_][A-Z0-9_]*)\}' k3d/ prod-fleet/ prod-mentolder/ prod-korczewski/ --include='*.yaml' --include='*.yml' 2>/dev/null | sed 's/.*${\([A-Z_][A-Z0-9_]*\)}.*/\1/' | sort -u | while read var; do
  if ! echo "$SCHEMA_VARS" | grep -qx "$var"; then
    echo "$var"
  fi
done)

NEW_MISSING=$(echo "$UNREGISTERED" | grep -v -E '^(API|ARCH|ARENA_WS_URL|AUTH|BACKUP_DIR|BRAND|CLIENTS_INTERNALSECRET|COLLABORA_INGRESS_MIDDLEWARES|COLLABORA_INGRESS_MIDDLEWARES_2|COLLABORA_TLS_SECRET_2|DOCS|DOMAIN|DUMP|FAILED|FILEN_DEFAULT_UPLOAD_PATH|FILEN_PATH|IP|IP_4|IP_6|IP_8|KC|KSA_DIR|LABEL|MOUNTER|NC|OFFICE|OUT|PASS|POCKET_ID_SMTP_TLS|SCHEME|SESSION_BLOCKKEY|SESSION_HASHKEY|SIZE|SRC|STAMP|STATUS|SUFFIX|TURN_APIKEY|UPLOAD_PATH|VAR|VW_AFFINITY|VW_CLAIM|WEB|WEBSITE_PRIMARY_SERVICE)$' || true)

if [ -n "$NEW_MISSING" ]; then
  echo "New unregistered vars found: $NEW_MISSING"
  CHANGED=true
fi

# 2. Lockfile drift
npm ls 2>/dev/null | grep -q "invalid" && CHANGED=true || true

# 3. Dep updates — log only
npm outdated --prefix . 2>/dev/null | tail -n +2 || true

# 4. Freshness regeneration (always — baseline shifts weekly)
task freshness:regenerate 2>/dev/null

if [ "$CHANGED" = false ]; then
  echo "No actionable changes found — skipping PR."
  cd /home/patrick/Bachelorprojekt
  git worktree remove "$WORKTREE" --force 2>/dev/null || true
  git branch -D "$BRANCH" 2>/dev/null || true
  exit 0
fi

# Commit and push
BASE_SHA="$(git rev-parse "@{upstream}" 2>/dev/null || git rev-parse origin/main)"
git add -A
git commit -m "chore(infra): $TICKET_TITLE [$TICKET_EXT_ID]"
HEAD_SHA="$(git rev-parse HEAD)"
if [ "$HEAD_SHA" = "$BASE_SHA" ]; then
  echo "FATAL: commit did not land"
  exit 1
fi
git push origin "$BRANCH"

# Create PR
gh pr create --title "chore(infra): $TICKET_TITLE [$TICKET_EXT_ID]" --body "Weekly dep + schema audit (automated)

Ticket: $TICKET_EXT_ID

Changes:
- Schema drift fixes
- Lockfile resolution
- Freshness baseline update" --base main

# Set auto-merge
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && gh pr merge --auto --squash --delete-branch 2>/dev/null) || true

# Cleanup
cd "$MAIN_REPO"
git worktree remove "$WORKTREE" --force 2>/dev/null || true
git branch -D "$BRANCH" 2>/dev/null || true
