# Plan: p2-update-dev-flow-execute

## Goal
Update `dev-flow-execute` documentation to address Mishap 3 (Safe Main-Branch Sync).

## Implementation
1. Open `.opencode/skills/opencode-flow-execute/SKILL.md`.
2. Find the "Schritt 0" section.
3. Replace the current shell snippet for updating the main repo with:
   ```bash
   MAIN_BRANCH=$(cd "$MAIN_REPO" && git rev-parse --abbrev-ref HEAD)
   if [ "$MAIN_BRANCH" = "main" ]; then
     (cd "$MAIN_REPO" && git fetch origin main && git pull --rebase origin main)
   else
     (cd "$MAIN_REPO" && git fetch origin main:main) || echo "Hauptcheckout auf $MAIN_BRANCH - nur fetch, kein pull"
   fi
   ```
4. Add a note about how this prevents rebasing remote branches.
