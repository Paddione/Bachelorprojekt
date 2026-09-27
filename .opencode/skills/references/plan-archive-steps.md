# Schritt 7: Plan nach Postgres archivieren + Plan-Ordner entfernen

Vollständige Mechanik zur Plan-Retirement nach dem Merge (seit C7a ohne OpenSpec:
kein Delta-Merge, kein Archiv-Verzeichnis — der Record liegt in Postgres,
der Arbeitsordner wird gelöscht).

> **Reihenfolge-Garantie (T004612):** Schritt 7 läuft VOR Schritt 7.5 (Worktree/Branch-Löschung),
> und der Fix-PR-Merge (Schritt 5) löscht den Branch NICHT mehr (`--delete-branch` entfernt,
> `delete_branch_on_merge=false` repo-seitig). Der Fix-Branch existiert zum Archivzeitpunkt also
> noch. Gelöscht wird er erst in 7.5, NACH diesem Schritt.

```bash
SLUG="<slug>"
BRANCH="feature/<slug>" # oder fix/<slug>
PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
PLAN_DIR=".agents/plans/$SLUG"

# 1. Plan-Frontmatter auf completed setzen, BEVOR der Inhalt archiviert wird:
sed -E -i 's/^status: (active|plan_staged|in_progress|planning)$/status: completed/' "$PLAN_FILE"
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

> **Warum nicht MCP-first (T002256):** `ticket-mcp-node_archive_plan` schlägt aus einem
> Worktree fehl — `plan file does not exist or is empty`, obwohl die Datei dort vorhanden
> ist. Der MCP-Server löst Plan-Pfade relativ zum Haupt-Checkout auf, wo der Plan-Ordner
> nur auf dem Branch existiert. Dieselbe Einschränkung gilt für `stage_plan`
> (`does not exist in git`). Da Schritt 7 praktisch immer aus einem Worktree läuft, ist der
> Skript-Aufruf hier der Regelweg. Details: [mcp-tool-guide](mcp-tool-guide.md).
> Aus dem Haupt-Checkout heraus funktioniert
> `ticket-mcp-node_archive_plan({ id, slug, branch, plan_file, pr })` weiterhin.

3. Plan-Ordner entfernen: `$PLAN_DIR/` per PR löschen. Der Record liegt in Postgres
(Schritt 2) — ein Datei-Archiv gibt es nicht mehr (C7a).

> **T003287: kein SKIP_MAIN_COMMIT_GUARD nötig.** Der pre-commit-Hook
> (.githooks/pre-commit, T002631) blockiert jeden Commit auf main/master ausser
> CI-Runnern. Der Retirement-Commit entsteht deshalb auf einem Archiv-Branch
> (die Vorlage unten) und landet per PR in main — der Weg hier ist der
> sanktionierte Weg OHNE Env-Bypass. `SKIP_MAIN_COMMIT_GUARD=1` bleibt fuer
> den Notfall reserviert und wird im normalen Archiv-Workflow nicht benoetigt.

> **Der Archiv-Branch MUSS von `origin/main` abzweigen, nicht vom Fix-Branch (T002256).**
> Schritt 7 läuft, nachdem der Fix-PR gemergt ist, und das Repo nutzt squash-and-merge — der
> Fix-Branch hängt danach am Pre-Squash-Stand. Ein von ihm abgezweigter Archiv-Branch trägt
> Commits, deren Inhalt in `main` bereits unter anderer SHA liegt: der Archiv-PR geht sofort
> auf `mergeStateStatus=DIRTY` und Auto-Merge greift nicht (beobachtet: PR #3302).

```bash
# Der Branch-Name MUSS die Ticket-ID tragen — .githooks/pre-commit prüft
# [[ "$_bn" =~ T[0-9]{6,} ]] case-sensitive und lehnt sonst jeden Commit ab (T002255).
# $TICKET_ID unverändert einsetzen (großes T); nicht aus einem lowercase-Slug ableiten.
ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}-${TICKET_ID}"

git fetch origin main
git checkout -B "$ARCHIVE_BRANCH" origin/main
[ -d "$PLAN_DIR" ] || { echo "FATAL: Plan-Ordner $PLAN_DIR fehlt auf origin/main" >&2; exit 1; }
git rm -r "$PLAN_DIR"
git commit -m "chore(plans): archive $SLUG → postgres [$TICKET_ID]"
git push -u origin "$ARCHIVE_BRANCH"

# PR-Erstellung mit Assert (verhindert ungebündelte Archiv-Branches, T001331)
ARCHIVE_PR_URL=$(gh pr create \
  --title "chore(plans): archive $SLUG → postgres [$TICKET_ID]" \
  --body "Automatischer Archiv-PR für $SLUG (Ticket $TICKET_ID). Plan wurde nach postgres archiviert, Arbeitsordner entfernt." \
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
# git pull --ff-only scheitert bei globalem pull.rebase=true + unstaged changes
# (T002373-M1). Merge-Pfad ist sicherer: stash, merge --ff-only, stash pop.
git stash -u 2>/dev/null || true
git merge --ff-only origin/main 2>/dev/null || git pull --ff-only
git stash pop 2>/dev/null || true
```
