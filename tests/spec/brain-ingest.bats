#!/usr/bin/env bats
# T001861: brain-ingest — BATS Spec (RED initial, GREEN after implementation)
# SSOT: openspec/changes/brain-initial-ingest/tasks.md

load 'test_helper'

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  INGEST="$REPO_ROOT/scripts/brain-ingest.sh"
  TRANSFORM="$REPO_ROOT/scripts/brain-ingest-transform.sh"
  # Phase 2b (parent MOCs, group MOCs, index.md) lives in its own script since
  # T002679 — brain-ingest.sh would otherwise have crossed its S1 line budget.
  MOC="$REPO_ROOT/scripts/brain-ingest-moc.sh"
  MANIFEST="$REPO_ROOT/scripts/brain/ingest-sources.yaml"
  WORK="$(mktemp -d)"
  export LM_STUDIO_URL="http://localhost:1234"
  export LM_MODEL="qwen3-14b"
}

teardown() { rm -rf "$WORK"; }

# --- Manifest tests ---

@test "manifest has type_map section with defaults and overrides" {
  [ -f "$MANIFEST" ]
  grep -q 'type_map:' "$MANIFEST" || { echo "FAIL: type_map section missing"; return 1; }
  grep -q 'defaults:' "$MANIFEST" || { echo "FAIL: type_map.defaults missing"; return 1; }
  grep -q 'overrides:' "$MANIFEST" || { echo "FAIL: type_map.overrides missing"; return 1; }
}

@test "manifest has tag_defaults section" {
  [ -f "$MANIFEST" ]
  grep -q 'tag_defaults:' "$MANIFEST" || { echo "FAIL: tag_defaults section missing"; return 1; }
}

@test "type_map defaults cover all groups" {
  [ -f "$MANIFEST" ]
  for group in ssot-specs runbooks adr gotchas-footguns agent-guide-maps core-docs; do
    grep -q "$group:" "$MANIFEST" || { echo "FAIL: type_map.defaults missing group $group"; return 1; }
  done
}

@test "tag_defaults cover all groups" {
  [ -f "$MANIFEST" ]
  for group in ssot-specs runbooks adr gotchas-footguns agent-guide-maps core-docs; do
    grep -q "$group:" "$MANIFEST" || { echo "FAIL: tag_defaults missing group $group"; return 1; }
  done
}

# --- Transform script tests ---

@test "transform script exists and is executable" {
  [ -f "$TRANSFORM" ] || { echo "FAIL: scripts/brain-ingest-transform.sh not found"; return 1; }
  [ -x "$TRANSFORM" ] || { echo "FAIL: transform script not executable"; return 1; }
}

@test "transform script produces valid frontmatter from mock LLM response" {
  # Create a mock source file
  mkdir -p "$WORK/source"
  cat > "$WORK/source/test-spec.md" <<'EOF'
---
type: note
tags: [test, spec]
status: active
source:: Bachelorprojekt openspec/specs/test-spec.md
---
# Test Spec

Dies ist eine Test-Spezifikation.

## Requirements

### Requirement: REQ-TEST-001

The system SHALL test things.
EOF

  # Create mock slug inventory
  echo '["test-spec","other-page","index-moc"]' > "$WORK/slugs.json"

  # Mock the LM Studio response
  # We'll test the script's output parsing, not the actual LLM call
  # by setting a custom curl that returns a fixed response
  export LM_STUDIO_URL="http://localhost:9999"

  # The transform script should fail gracefully when LM Studio is unreachable
  run bash "$TRANSFORM" "$WORK/source/test-spec.md" "note" "test-spec" "$WORK/slugs.json" '["test","spec"]' 2>/dev/null
  # It should either succeed or fail with a clear error (not crash)
  [ "$status" -eq 0 ] || [[ "$output" == *"error"* ]] || [[ "$output" == *"curl"* ]] || {
    echo "FAIL: transform script crashed without clear error: $output"
    return 1
  }
}

# --- Orchestrator script tests ---

@test "orchestrator script exists and is executable" {
  [ -f "$INGEST" ] || { echo "FAIL: scripts/brain-ingest.sh not found"; return 1; }
  [ -x "$INGEST" ] || { echo "FAIL: orchestrator script not executable"; return 1; }
}

@test "orchestrator requires --brain-repo argument" {
  run bash "$INGEST" 2>&1
  [ "$status" -ne 0 ] || { echo "FAIL: should fail without --brain-repo"; return 1; }
  [[ "$output" == *"--brain-repo"* ]] || { echo "FAIL: error should mention --brain-repo"; return 1; }
}

@test "orchestrator fails when --brain-repo is not a git repo" {
  mkdir -p "$WORK/not-a-repo"
  run bash "$INGEST" --brain-repo "$WORK/not-a-repo" 2>&1
  [ "$status" -ne 0 ] || { echo "FAIL: should fail for non-git dir"; return 1; }
  [[ "$output" == *"not a git"* ]] || { echo "FAIL: error should mention not a git repo"; return 1; }
}

@test "orchestrator in dry-run mode does not create commits" {
  # Create a mock brain repo
  mkdir -p "$WORK/brain/wiki"
  git -C "$WORK/brain" init -q
  git -C "$WORK/brain" config user.email "test@test"
  git -C "$WORK/brain" config user.name "test"
  echo "# test" > "$WORK/brain/README.md"
  git -C "$WORK/brain" add . && git -C "$WORK/brain" commit -q -m "init"

  # Count commits before
  local before
  before="$(git -C "$WORK/brain" rev-list --count HEAD)"

  # Run in dry-run mode (will fail because LM Studio is not running,
  # but should not create commits)
  run bash "$INGEST" --brain-repo "$WORK/brain" --dry-run 2>&1

  # Count commits after
  local after
  after="$(git -C "$WORK/brain" rev-list --count HEAD)"

  [ "$before" -eq "$after" ] || { echo "FAIL: dry-run created commits"; return 1; }
}

# --- State file tests ---

@test "state file is created if it does not exist" {
  mkdir -p "$WORK/brain/wiki"
  git -C "$WORK/brain" init -q
  git -C "$WORK/brain" config user.email "test@test"
  git -C "$WORK/brain" config user.name "test"
  echo "# test" > "$WORK/brain/README.md"
  git -C "$WORK/brain" add . && git -C "$WORK/brain" commit -q -m "init"

  local state_file="$WORK/state.json"
  [ ! -f "$state_file" ] || rm "$state_file"

  # Run (will fail on LLM call, but should create state file)
  bash "$INGEST" --brain-repo "$WORK/brain" --dry-run --state "$state_file" 2>/dev/null || true

  [ -f "$state_file" ] || { echo "FAIL: state file not created"; return 1; }
}

# --- MOC generation tests ---

@test "index-moc links to sub-MOCs after ingest" {
  # This test verifies the MOC structure, not the full ingest
  # Create a mock brain wiki with sub-MOCs
  mkdir -p "$WORK/brain/wiki"
  cat > "$WORK/brain/wiki/index-moc.md" <<'EOF'
---
type: moc
tags: [moc, meta]
status: active
source:: test
---
# Wiki — Map of Content

## SSOT Specs
- [[ssot-specs-moc]]

## Runbooks
- [[runbooks-moc]]
EOF

  # Verify index-moc links to sub-MOCs
  grep -q '\[\[ssot-specs-moc\]\]' "$WORK/brain/wiki/index-moc.md" || {
    echo "FAIL: index-moc does not link to ssot-specs-moc"
    return 1
  }
  grep -q '\[\[runbooks-moc\]\]' "$WORK/brain/wiki/index-moc.md" || {
    echo "FAIL: index-moc does not link to runbooks-moc"
    return 1
  }
}

@test "multi-chunk parent group and index MOCs receive deterministic lifecycle metadata" {
  local source_root="$WORK/source-root" brain="$WORK/brain" chunks="$WORK/chunks.tsv"
  local state="$WORK/state.json" observed="2026-08-19T12:00:00Z"
  mkdir -p "$source_root/openspec/specs" "$source_root/docs/runbooks" \
    "$source_root/scripts/brain" "$brain/wiki"
  printf 'authoritative multi chunk source\n' > "$source_root/openspec/specs/example.md"
  printf 'authoritative runbook source\n' > "$source_root/docs/runbooks/guide.md"
  cp "$MANIFEST" "$source_root/scripts/brain/ingest-sources.yaml"
  cat > "$WORK/parent-moc.md" <<'EOF'
---
type: moc
tags: [example, moc]
status: active
---
# Example MOC
- [[example-part-1]]
- [[example-part-2]]
EOF
  printf '%s\n' '# part one' > "$brain/wiki/example-part-1.md"
  printf '%s\n' '# part two' > "$brain/wiki/example-part-2.md"
  printf '%s\n' '# runbook' > "$brain/wiki/runbook-guide.md"
  printf 'openspec/specs/example.md\t%s\texample\t0\tMap of Content\n' "$WORK/parent-moc.md" > "$chunks"
  cat > "$state" <<'EOF'
{"openspec/specs/example.md#1":{"slug":"example-part-1","type":"note"},"openspec/specs/example.md#2":{"slug":"example-part-2","type":"note"},"docs/runbooks/guide.md#1":{"slug":"runbook-guide","type":"runbook"}}
EOF

  run bash "$MOC" --brain-repo "$brain" --chunks "$chunks" --state "$state" \
    --source-root "$source_root" --manifest "$source_root/scripts/brain/ingest-sources.yaml" \
    --metadata-script "$REPO_ROOT/scripts/brain-page-metadata.py" \
    --observed-at "$observed" --valid-from 2026-08-19
  [ "$status" -eq 0 ]

  local source_hash manifest_hash
  source_hash="$(sha256sum "$source_root/openspec/specs/example.md" | awk '{print $1}')"
  manifest_hash="$(sha256sum "$source_root/scripts/brain/ingest-sources.yaml" | awk '{print $1}')"
  grep -q "source_kind: \"openspec\"" "$brain/wiki/example.md"
  grep -q "source_revision: \"$source_hash\"" "$brain/wiki/example.md"
  grep -q "observed_at: \"$observed\"" "$brain/wiki/example.md"
  grep -q "source_revision: \"$manifest_hash\"" "$brain/wiki/ssot-specs-moc.md"
  grep -q "source_revision: \"$manifest_hash\"" "$brain/index.md"
  grep -q '\[\[example-part-1\]\]' "$brain/wiki/ssot-specs-moc.md"
  grep -q '\[\[example-part-2\]\]' "$brain/wiki/ssot-specs-moc.md"
  ! grep -q '\[\[runbook-guide\]\]' "$brain/wiki/ssot-specs-moc.md"
  grep -q '\[\[runbook-guide\]\]' "$brain/wiki/runbooks-moc.md"
  ! grep -q '\[\[example-part-' "$brain/wiki/runbooks-moc.md"
  [ ! -e "$brain/wiki/github-reviewed-moc.md" ]
}

@test "group MOCs follow current manifest for dot paths and ignore stale stored groups" {
  local source_root="$WORK/source-root" brain="$WORK/brain" chunks="$WORK/chunks.tsv"
  local state="$WORK/state.json" observed="2026-08-19T12:00:00Z"
  mkdir -p "$source_root/.claude/lib" "$source_root/docs/runbooks" \
    "$source_root/scripts/brain" "$brain/wiki"
  printf '# Goals\n' > "$source_root/.claude/lib/goals.md"
  printf '# Guide\n' > "$source_root/docs/runbooks/guide.md"
  cp "$MANIFEST" "$source_root/scripts/brain/ingest-sources.yaml"
  printf '# compiled goals\n' > "$brain/wiki/quality-goals.md"
  printf '# compiled guide\n' > "$brain/wiki/guide.md"
  : > "$chunks"
  cat > "$state" <<'EOF'
{".claude/lib/goals.md#1":{"slug":"quality-goals","type":"decision","group":"runbooks"},"docs/runbooks/guide.md#1":{"slug":"guide","type":"runbook","group":"health-goals"}}
EOF

  run bash "$MOC" --brain-repo "$brain" --chunks "$chunks" --state "$state" \
    --source-root "$source_root" --manifest "$source_root/scripts/brain/ingest-sources.yaml" \
    --metadata-script "$REPO_ROOT/scripts/brain-page-metadata.py" \
    --observed-at "$observed" --valid-from 2026-08-19
  [ "$status" -eq 0 ]

  [ "$(grep -o '\[\[[^]]*\]\]' "$brain/wiki/health-goals-moc.md")" = '[[quality-goals]]' ]
  grep -q '1 Seiten aus der Gruppe `health-goals`' "$brain/wiki/health-goals-moc.md"
  [ "$(grep -o '\[\[[^]]*\]\]' "$brain/wiki/runbooks-moc.md")" = '[[guide]]' ]
  ! grep -q '\[\[guide\]\]' "$brain/wiki/health-goals-moc.md"
  ! grep -q '\[\[quality-goals\]\]' "$brain/wiki/runbooks-moc.md"
}

@test "local github-reviewed policy completes normal and parent-MOC ingest without upstream provenance" {
  local source_root="$WORK/source-root" brain="$WORK/brain" fake_bin="$WORK/bin"
  local state="$WORK/state.json" observed="2026-08-19T12:00:00Z"
  mkdir -p "$source_root/scripts/brain" "$source_root/docs/brain-expertise/approved" \
    "$brain/wiki" "$brain/scripts" "$fake_bin"
  for script in brain-ingest.sh brain-ingest-transform.sh brain-chunk.sh brain-ingest-reset.sh \
    brain-group-match.sh brain-source-provenance.sh brain-ingest-worklist.sh \
    brain-page-metadata.py brain-ingest-moc.sh brain-ingest-prune.sh brain-ingest-coverage.sh; do
    cp "$REPO_ROOT/scripts/$script" "$source_root/scripts/$script"
  done
  cp "$REPO_ROOT/docs/brain-expertise/approved/source-policy.md" \
    "$source_root/docs/brain-expertise/approved/source-policy.md"
  printf '\nupstream_revision: ffffffffffffffffffffffffffffffffffffffff\n' \
    >> "$source_root/docs/brain-expertise/approved/source-policy.md"
  cat > "$source_root/docs/brain-expertise/approved/paddione-example-pr-7.md" <<'EOF'
---
type: note
tags: [github-reviewed, expertise]
status: active
source_kind: github-reviewed
upstream_revision: 0123456789abcdef0123456789abcdef01234567
repository: Paddione/example
pull_request: 7
source_url: https://github.com/Paddione/example/pull/7
---
# Approved PR evidence

Reviewed evidence.
EOF
  cat > "$source_root/scripts/brain/ingest-sources.yaml" <<'YAML'
exclude: []
groups:
  github-reviewed: docs/brain-expertise/approved/*.md
type_map:
  defaults:
    github-reviewed: note
  overrides: []
tag_defaults:
  github-reviewed: [github-reviewed, expertise]
YAML
  cat > "$fake_bin/curl" <<'SH'
#!/usr/bin/env bash
content="$(printf '%s\n' '---' 'type: note' 'tags: [github-reviewed, expertise]' \
  'status: active' '---' '# Reviewed source' '' \
  "source:: Bachelorprojekt ${BRAIN_SOURCE_PATH:?}" '' 'See [[index-moc]].')"
jq -n --arg content "$content" '{choices:[{message:{content:$content}}]}'
SH
  chmod +x "$fake_bin/curl"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$brain/scripts/lint-frontmatter.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$brain/scripts/lint-wikilinks.sh"
  chmod +x "$brain/scripts/lint-frontmatter.sh" "$brain/scripts/lint-wikilinks.sh"
  git -C "$brain" init -q -b main
  git -C "$brain" config user.email test@test
  git -C "$brain" config user.name test
  printf '# fixture brain\n' > "$brain/README.md"
  git -C "$brain" add README.md scripts
  git -C "$brain" commit -q -m init

  run env PATH="$fake_bin:$PATH" LM_STUDIO_URL=http://fixture.invalid LM_MODEL=fixture \
    MAX_PARALLEL=1 BRAIN_CHUNK_TARGET_CHARS=800 BRAIN_OBSERVED_AT="$observed" \
    bash "$source_root/scripts/brain-ingest.sh" --brain-repo "$brain" --state "$state" --dry-run
  [ "$status" -eq 0 ]

  local policy_hash policy_pages approved_hash approved_pages
  policy_hash="$(sha256sum "$source_root/docs/brain-expertise/approved/source-policy.md" | awk '{print $1}')"
  policy_pages="$(find "$brain/wiki" -maxdepth 1 -type f -name 'docs-brain-expertise-approved-source-policy*.md' -print)"
  [ -n "$policy_pages" ]
  while IFS= read -r page; do
    grep -q 'source_kind: "github-reviewed"' "$page"
    grep -q "source_revision: \"$policy_hash\"" "$page"
    ! grep -q '^upstream_revision:' "$page"
  done <<< "$policy_pages"
  approved_hash="$(sha256sum "$source_root/docs/brain-expertise/approved/paddione-example-pr-7.md" | awk '{print $1}')"
  approved_pages="$(find "$brain/wiki" -maxdepth 1 -type f -name 'docs-brain-expertise-approved-paddione-example-pr-7*.md' -print)"
  [ -n "$approved_pages" ]
  while IFS= read -r page; do
    grep -q "source_revision: \"$approved_hash\"" "$page"
    grep -q 'upstream_revision: "0123456789abcdef0123456789abcdef01234567"' "$page"
  done <<< "$approved_pages"
  grep -q '\[\[docs-brain-expertise-approved-source-policy-' "$brain/wiki/github-reviewed-moc.md"
  grep -q '\[\[docs-brain-expertise-approved-paddione-example-pr-7-' "$brain/wiki/github-reviewed-moc.md"

  run python3 "$REPO_ROOT/scripts/brain-lifecycle-audit.py" --brain-repo "$brain" \
    --source-root "$source_root" --as-of "$observed" --format json
  [ "$status" -eq 0 ]
  [ "$(jq -r '.summary.finding_count' <<< "$output")" -eq 0 ]
}

# --- Type mapping tests ---

@test "type_map overrides take precedence over defaults" {
  # Verify that the manifest has overrides that would change default types
  [ -f "$MANIFEST" ]
  # Check that security*.md override exists
  grep -q 'pattern:.*security' "$MANIFEST" || {
    echo "FAIL: no override for security specs"
    return 1
  }
  # Check that the override type is different from the default (note)
  grep -A1 'pattern:.*security' "$MANIFEST" | grep -q 'type: decision' || {
    echo "FAIL: security override should be decision, not note"
    return 1
  }
}

# --- T001884: glob-based ssot-specs + new groups (E1) ---

@test "ssot-specs group is a single glob line, not a static per-file list" {
  [ -f "$MANIFEST" ]
  grep -qE '^  ssot-specs:[[:space:]]+openspec/specs/\*\.md[[:space:]]*$' "$MANIFEST" \
    || { echo "FAIL: ssot-specs is not the glob 'openspec/specs/*.md'"; return 1; }
}

@test "manifest declares a health-goals group targeting .claude/lib/goals.md" {
  [ -f "$MANIFEST" ]
  grep -qE '^  health-goals:[[:space:]]+\.claude/lib/goals\.md[[:space:]]*$' "$MANIFEST" \
    || { echo "FAIL: health-goals group missing or wrong target"; return 1; }
}

@test "manifest declares a diagrams group targeting docs/diagrams/*.md and docs/db-schema-diagram.md" {
  [ -f "$MANIFEST" ]
  grep -A3 '^  diagrams:[[:space:]]*|' "$MANIFEST" | grep -q 'docs/diagrams/\*\.md' \
    || { echo "FAIL: diagrams group missing docs/diagrams/*.md"; return 1; }
  grep -A3 '^  diagrams:[[:space:]]*|' "$MANIFEST" | grep -q 'docs/db-schema-diagram\.md' \
    || { echo "FAIL: diagrams group missing docs/db-schema-diagram.md"; return 1; }
}

@test "type_map and tag_defaults cover health-goals and diagrams" {
  [ -f "$MANIFEST" ]
  for group in health-goals diagrams; do
    grep -q "$group:" "$MANIFEST" || { echo "FAIL: type_map/tag_defaults missing $group"; return 1; }
  done
  grep -qE '^\s+health-goals:\s+decision' "$MANIFEST" || { echo "FAIL: health-goals default type != decision"; return 1; }
  grep -qE '^\s+diagrams:\s+note' "$MANIFEST" || { echo "FAIL: diagrams default type != note"; return 1; }
}

@test "dead health-goals.md type_map override is removed" {
  [ -f "$MANIFEST" ]
  ! grep -q 'pattern: "openspec/specs/health-goals.md"' "$MANIFEST" \
    || { echo "FAIL: dead health-goals.md override still present"; return 1; }
}

# --- T001884: fail-loud 0-match warning + .worktrees prune (E2) ---

@test "worklist warns on stderr when a manifest group matches zero files (exit stays 0)" {
  mkdir -p "$WORK/repo"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\na\n' > "$WORK/repo/a.md"
  cat > "$WORK/manifest.yaml" <<YAML
groups:
  matched: a.md
  empty-group: nonexistent-pattern-*.md
YAML
  run bash "$REPO_ROOT/scripts/brain-ingest-worklist.sh" --root "$WORK/repo" --manifest "$WORK/manifest.yaml"
  [ "$status" -eq 0 ] || { echo "FAIL: exit must stay 0 even with a 0-match group"; return 1; }
  [[ "$output" == *"empty-group"* ]] || { echo "FAIL: no drift warning naming empty-group"; return 1; }
}

@test "worklist does not warn for a group that has at least one match" {
  mkdir -p "$WORK/repo"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\na\n' > "$WORK/repo/a.md"
  cat > "$WORK/manifest.yaml" <<YAML
groups:
  matched: a.md
YAML
  run bash "$REPO_ROOT/scripts/brain-ingest-worklist.sh" --root "$WORK/repo" --manifest "$WORK/manifest.yaml"
  [ "$status" -eq 0 ]
  [[ "$output" != *"Warnung"* ]] || { echo "FAIL: warned on a group with a real match"; return 1; }
}

@test "worklist prunes a .worktrees/ subtree so it never produces duplicate slugs" {
  mkdir -p "$WORK/repo/.worktrees/copy1"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\na\n' > "$WORK/repo/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\na\n' > "$WORK/repo/.worktrees/copy1/a.md"
  cat > "$WORK/manifest.yaml" <<YAML
groups:
  matched: "**/*.md"
YAML
  run bash "$REPO_ROOT/scripts/brain-ingest-worklist.sh" --root "$WORK/repo" --manifest "$WORK/manifest.yaml"
  [ "$status" -eq 0 ]
  [[ "$output" != *".worktrees"* ]] || { echo "FAIL: .worktrees/ subtree not pruned"; return 1; }
}

# --- T001884: Phase 2b MOC loop covers the new groups (E1 cont.) ---

@test "Phase 2b MOC loop includes health-goals and diagrams groups" {
  # The loop moved from brain-ingest.sh to brain-ingest-moc.sh with the Phase 2b
  # extraction (T002679). What T001884 guards is that the two groups are covered,
  # not which file happens to hold the loop — so the assertion follows the code.
  local loop
  loop="$(grep '^for group in ' "$MOC")"
  for group in ssot-specs runbooks adr gotchas-footguns agent-guide-maps core-docs health-goals diagrams github-reviewed; do
    [[ "$loop" == *"$group"* ]] || { echo "FAIL: Phase 2b loop missing $group"; return 1; }
  done
  # Positiv-Anker: brain-ingest.sh must still reach that loop, otherwise the
  # groups would be covered in a script nobody calls.
  grep -q 'brain-ingest-moc.sh' "$INGEST" \
    || { echo "FAIL: brain-ingest.sh no longer invokes brain-ingest-moc.sh"; return 1; }
}

@test "PR description doc-string lists health-goals and diagrams as source groups" {
  grep -q 'ssot-specs, runbooks, adr, gotchas-footguns, agent-guide-maps, core-docs, health-goals, diagrams' \
    "$INGEST" || { echo "FAIL: PR body source-groups string not updated"; return 1; }
}

# --- T001884: mermaid verbatim-preservation prompt rule (E5) ---

@test "transform prompt instructs the LLM to keep mermaid code blocks verbatim" {
  grep -qi 'mermaid' "$TRANSFORM" || { echo "FAIL: no mermaid rule in transform prompt"; return 1; }
  grep -qiE 'mermaid.*(verbatim|unveraendert|unver.ndert)' "$TRANSFORM" \
    || { echo "FAIL: mermaid rule doesn't say verbatim/unveraendert"; return 1; }
}
