# Schritt 7: Plan & OpenSpec archivieren

Vollständige Mechanik zur Archivierung von Plan & OpenSpec.

```bash
SLUG="<slug>"
BRANCH="feature/<slug>" # oder fix/<slug>
PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")

# 1. Plan-Frontmatter auf completed setzen, BEVOR der Inhalt archiviert wird:
sed -E -i 's/^status: (active|plan_staged|in_progress)$/status: completed/' "$PLAN_FILE"
```

2. tasks.md → postgres (`tickets.ticket_plans`) — **Skript-first**:

```bash
./scripts/ticket.sh archive-plan \
  --id "$TICKET_ID" \
  --slug "$SLUG" \
  --branch "$BRANCH" \
  --plan-file "$PLAN_FILE" \
  --pr "$PR_NUM"
```

> **Warum nicht MCP-first (T002256):** `mcp__ticket-mcp__archive_plan` schlägt aus einem
> Worktree fehl — `plan file does not exist or is empty`, obwohl die Datei dort vorhanden
> ist. Der MCP-Server löst Plan-Pfade relativ zum Haupt-Checkout auf, wo der Change-Ordner
> nur auf dem Branch existiert. Dieselbe Einschränkung gilt für `stage_plan`
> (`does not exist in git`). Da Schritt 7 praktisch immer aus einem Worktree läuft, ist der
> Skript-Aufruf hier der Regelweg. Details: [mcp-tool-guide](mcp-tool-guide.md).
> Aus dem Haupt-Checkout heraus funktioniert
> `mcp__ticket-mcp__archive_plan({ id, slug, branch, plan_file, pr })` weiterhin.

3. OpenSpec-Change archivieren: `openspec/changes/<slug>/` → `openspec/changes/archive/<date>-<slug>/`. Verschiebt proposal.md, tasks.md, specs/, assets/ ins Archiv und aktualisiert den SSOT-Delta.
```bash
bash scripts/openspec.sh archive "$SLUG"
# Alternativ: task openspec:archive -- "$SLUG"
```

> **Querschnittliche Changes ohne Parent-SSOT-Spec (insbesondere Mishap-Bundles):** archivieren mit
> `bash scripts/openspec.sh archive "$SLUG" --create-new`. Ohne das Flag
> bricht `_merge_delta` in `openspec-merge.mjs` mit "Target '...' does not exist" ab, weil ein
> Mishap-Bundle per Definition keine Parent-SSOT-Spec hat. Die resultierende Spec
> `openspec/specs/$SLUG.md` wandert bei der nächsten Archivierung durch
> `mv "$dir" "$dest"` nach `openspec/specs/archive/` (analog zu den bestehenden
> `openspec/specs/archive/*mishap*.md`-Präzedenzfällen).

4. Archivierung committen und via PR mergen (wegen Branch-Protection).

> **Der Archiv-Branch MUSS von `origin/main` abzweigen, nicht vom Fix-Branch (T002256).**
> Schritt 7 läuft, nachdem der Fix-PR gemergt ist, und das Repo nutzt squash-and-merge — der
> Fix-Branch hängt danach am Pre-Squash-Stand. Ein von ihm abgezweigter Archiv-Branch trägt
> Commits, deren Inhalt in `main` bereits unter anderer SHA liegt: der Archiv-PR geht sofort
> auf `mergeStateStatus=DIRTY` und Auto-Merge greift nicht (beobachtet: PR #3302). Der
> Commit entsteht deshalb auf dem Fix-Branch und wird auf den frischen Archiv-Branch
> gecherry-picked; der Archiv-PR zeigt dann garantiert nur die Archiv-Änderungen im Diff.

```bash
# scripts/openspec.sh cmd_archive schreibt website/src/data/openspec-status.json
# NACH dem `mv "$dir" "$dest"` neu. Ohne die Regeneration + das explizite Staging
# bleibt die Datei unstaged, der Archiv-Commit trägt sie nie mit und CI meldet sie
# als stale. Regeneration ist idempotent; die Dateiliste folgt Taskfile
# `freshness:check` Phase 1 (T002252), damit keine zweite Quelle entsteht.
task freshness:regenerate
git add openspec/changes/ openspec/changes/archive/ website/src/data/openspec-status.json
git add -u -- website/src/data website/src/lib website/public/learning-assets docs
git commit -m "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]"
ARCHIVE_COMMIT=$(git rev-parse HEAD)

# Der Branch-Name MUSS die Ticket-ID tragen — .githooks/pre-commit prüft
# [[ "$_bn" =~ T[0-9]{6,} ]] case-sensitive und lehnt sonst jeden Commit ab (T002255).
# $TICKET_ID unverändert einsetzen (großes T); nicht aus einem lowercase-Slug ableiten.
ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}-${TICKET_ID}"

git fetch origin main
git checkout -B "$ARCHIVE_BRANCH" origin/main
git cherry-pick "$ARCHIVE_COMMIT"
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
