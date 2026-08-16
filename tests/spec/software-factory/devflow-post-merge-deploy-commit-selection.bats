#!/usr/bin/env bats

# tests/spec/software-factory/devflow-post-merge-deploy-commit-selection.bats
# T008015-1 (Mishap-Rollup): Deploy-Detection analysierte Archiv-Commit statt
# Feature-Merge (false negative). PRUEFMODUS: Output-Verifikation [T002448-M4]
# im Wegwerf-Fixture — die echte SUT scripts/devflow-post-merge-deploy.sh wird
# ins Fixture kopiert, filter-generated.sh ebenfalls (echtes .gitattributes
# mit linguist-generated-Eintraegen macht die Regeneration der Generierten
# Artefakte nach). Fixture-Vorbild: batch-worktree-guard-tooling-fixes/
# deploy-route-sdlc-exclusion.bats.
#
# Kern: `git log -1 --grep` waehlte den NEUESTEN ticket-referenzierenden
# Commit (chore(plans)-Archiv-Commit, nur openspec/-Dateien) statt des
# Feature-Merge mit den components/website/**-Aenderungen. Der Fix wandert die
# Kandidaten neueste-zuerst und nimmt den ersten mit Deploy-Trigger-Pfaden.

setup() {
  REPO="$(pwd)"
  BATS_TMPDIR=$(mktemp -d)
  FIXTURE="$BATS_TMPDIR/fixture"
  mkdir -p "$FIXTURE"

  cd "$FIXTURE"
  git init
  git config user.email "test@example.com"
  git config user.name "Test User"
  # Commit 0: empty base commit
  touch README.md
  git add README.md
  git commit -m "initial"
  git update-ref refs/remotes/origin/main HEAD

  # Setup .gitattributes to drop generated files
  echo "components/website/src/data/openspec-status.json linguist-generated=true" > .gitattributes
  echo "components/website/src/data/test-inventory.json  linguist-generated=true" >> .gitattributes
  git add .gitattributes
  git commit -m "setup gitattributes"

  # Copy real SUT and helper
  mkdir -p "$FIXTURE/scripts" "$FIXTURE/bin"
  cp "$REPO/scripts/devflow-post-merge-deploy.sh" "$FIXTURE/scripts/devflow-post-merge-deploy.sh"
  cp "$REPO/scripts/filter-generated.sh" "$FIXTURE/scripts/filter-generated.sh"
  chmod +x "$FIXTURE/scripts/filter-generated.sh"

  # Stubs
  echo 'echo "ticket.sh: $*"; exit 0' > "$FIXTURE/scripts/ticket.sh"
  chmod +x "$FIXTURE/scripts/ticket.sh"

  echo 'exit 0' > "$FIXTURE/scripts/devflow-post-merge-ticket-closure.sh"
  chmod +x "$FIXTURE/scripts/devflow-post-merge-ticket-closure.sh"

  echo 'echo "task called: $*"; exit 0' > "$FIXTURE/bin/task"
  chmod +x "$FIXTURE/bin/task"
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "T008015-1: Deploy-Detection waehlt Feature-Merge (Website-Trigger) statt neuestem Archiv-Commit" {
  cd "$FIXTURE"
  
  # Commit A: The actual feature commit (contains deploy trigger)
  mkdir -p components/website/src/pages/sdlc/
  touch components/website/src/pages/sdlc/fixture.astro
  git add components/website/src/pages/sdlc/fixture.astro
  git commit -m "feat(website): fixture feature [T999001]"
  
  # Commit B: The archive commit (NEWEST, contains only non-deploy-trigger files)
  # Fixture-Pfad-Konvention (T002368-Guard): openspec/changes nur unter
  # "$FIXTURE" anlegen — bare relative Pfade wuerden den Guard
  # "kein Test legt ein Change-Verzeichnis im echten openspec/ an" treffen.
  mkdir -p "$FIXTURE/openspec/changes/archive/fixture/"
  touch "$FIXTURE/openspec/changes/archive/fixture/tasks.md"
  mkdir -p components/website/src/data/
  echo "{}" > components/website/src/data/openspec-status.json
  git add "$FIXTURE/openspec/changes/archive/fixture/tasks.md" components/website/src/data/openspec-status.json
  git commit -m "chore(plans): archive fixture [T999001]"
  
  git update-ref refs/remotes/origin/main HEAD

  run env PATH="$FIXTURE/bin:$PATH" bash scripts/devflow-post-merge-deploy.sh T999001
  
  [ "$status" == 0 ]
  [[ "$output" =~ "Website-Image" ]]
  [[ ! "$output" =~ "Keine bekannten Deploy-Trigger" ]]
}

@test "T008015-1: Fallback — nur Archiv-Commit ohne Deploy-Trigger → Keine bekannten Deploy-Trigger" {
  cd "$FIXTURE"
  
  # Commit B (NEWEST): Only the archive commit
  mkdir -p "$FIXTURE/openspec/changes/archive/fixture/"
  touch "$FIXTURE/openspec/changes/archive/fixture/tasks.md"
  mkdir -p components/website/src/data/
  echo "{}" > components/website/src/data/openspec-status.json
  git add "$FIXTURE/openspec/changes/archive/fixture/tasks.md" components/website/src/data/openspec-status.json
  git commit -m "chore(plans): archive fixture [T999001]"
  
  git update-ref refs/remotes/origin/main HEAD

  run env PATH="$FIXTURE/bin:$PATH" bash scripts/devflow-post-merge-deploy.sh T999001
  
  [ "$status" == 0 ]
  [[ "$output" =~ "Keine bekannten Deploy-Trigger" ]]
}
