# Schritt 7: Plan & OpenSpec archivieren

Vollständige Mechanik zur Archivierung von Plan & OpenSpec.

```bash
SLUG="<slug>"
BRANCH="feature/<slug>" # oder fix/<slug>
PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")

# 1. Plan-Frontmatter auf completed setzen, BEVOR der Inhalt archiviert wird:
sed -E -i 's/^status: (active|plan_staged|in_progress)$/status: completed/' "$PLAN_FILE"
```

2. tasks.md → postgres (`tickets.ticket_plans`) — **MCP-first** (`ticket-mcp`):
> `mcp__ticket-mcp__archive_plan({ id: "$TICKET_ID", slug: "$SLUG", branch: "$BRANCH", plan_file: "$PLAN_FILE", pr: "$PR_NUM" })`
Fallback (ticket-mcp nicht erreichbar):
```bash
./scripts/ticket.sh archive-plan \
  --id "$TICKET_ID" \
  --slug "$SLUG" \
  --branch "$BRANCH" \
  --plan-file "$PLAN_FILE" \
  --pr "$PR_NUM"
```

3. OpenSpec-Change archivieren: `openspec/changes/<slug>/` → `openspec/changes/archive/<date>-<slug>/`. Verschiebt proposal.md, tasks.md, specs/, assets/ ins Archiv und aktualisiert den SSOT-Delta.
```bash
bash scripts/openspec.sh archive "$SLUG"
# Alternativ: task openspec:archive -- "$SLUG"

# 4. Archivierung committen und via PR mergen (wegen Branch-Protection)
git add openspec/changes/ openspec/changes/archive/
git commit -m "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]"

ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}"
git checkout -b "$ARCHIVE_BRANCH"
git push -u origin "$ARCHIVE_BRANCH"

# PR-Erstellung mit Assert (verhindert ungebündelte Archiv-Branches, T001331)
ARCHIVE_PR_URL=$(gh pr create \
  --title "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]" \
  --body "Automatischer Archiv-PR für $SLUG (Ticket $TICKET_ID). Plan wurde nach postgres archiviert." \
  --head "$ARCHIVE_BRANCH" \
  --base main)
[ -n "$ARCHIVE_PR_URL" ] || { echo "FATAL: gh pr create returned empty URL for $ARCHIVE_BRANCH" >&2; exit 1; }

# Push-Verification vor Auto-Merge (T001268)
REMOTE_SHA=$(git ls-remote origin "refs/heads/$ARCHIVE_BRANCH" | cut -f1)
LOCAL_SHA=$(git rev-parse HEAD)
[ "$REMOTE_SHA" = "$LOCAL_SHA" ] || { echo "FATAL: remote SHA ($REMOTE_SHA) != local SHA ($LOCAL_SHA)" >&2; exit 1; }

# Auto-Merge aktivieren — CI mergt den Archiv-PR, sobald grün
gh pr merge --auto --squash --delete-branch "$ARCHIVE_PR_URL"

# Zurück zum Haupt-Worktree
cd "$MAIN_REPO"
git checkout main
git pull --ff-only
```
