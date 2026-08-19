#!/usr/bin/env bats
# SSOT-Spec: openspec/specs/brain-foundation.md
# Ticket: T012913

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  METADATA="$REPO_ROOT/scripts/brain-page-metadata.py"
  AUDIT="$REPO_ROOT/scripts/brain-lifecycle-audit.py"
  EXPERTISE="$REPO_ROOT/scripts/brain-expertise.py"
  SRC="$BATS_TEST_TMPDIR/source.md"
  WIKI="$BATS_TEST_TMPDIR/brain/wiki"
  mkdir -p "$WIKI"
  printf 'authoritative source\n' > "$SRC"
}

page() {
  local slug="$1" valid_from="$2" valid_until="$3" claim="$4" source_revision="$5"
  cat > "$WIKI/$slug.md" <<EOF
---
type: note
tags: [test, lifecycle]
status: active
source_kind: "openspec"
source_revision: "$source_revision"
observed_at: "2026-08-19T12:00:00Z"
valid_from: "$valid_from"
valid_until: "$valid_until"
---
# $slug

source:: Bachelorprojekt source.md
claim:: deployment.mode = $claim
EOF
}

wiki_inventory() {
  find "$WIKI" -type f -name '*.md' -print0 | sort -z | xargs -0 sha256sum
}

@test "metadata filter is deterministic and source-derived" {
  local input output1 output2 expected
  input=$'---\ntype: note\ntags: [test]\nstatus: active\n---\n# Body\n\nPreserved.\n'
  expected="$(sha256sum "$SRC" | awk '{print $1}')"

  run bash -c 'printf "%s" "$1" | python3 "$2" --source "$3" --source-kind openspec --observed-at 2026-08-19T12:00:00Z --valid-from 2026-08-19' _ "$input" "$METADATA" "$SRC"
  [ "$status" -eq 0 ]
  output1="$output"
  [[ "$output1" == *"source_revision: \"$expected\""* ]]
  [[ "$output1" == *'source_kind: "openspec"'* ]]
  [[ "$output1" == *'observed_at: "2026-08-19T12:00:00Z"'* ]]
  [[ "$output1" == *'valid_from: "2026-08-19"'* ]]
  [[ "$output1" == *'Preserved.'* ]]

  run bash -c 'printf "%s" "$1" | python3 "$2" --source "$3" --source-kind openspec --observed-at 2026-08-19T12:00:00Z --valid-from 2026-08-19' _ "$output1" "$METADATA" "$SRC"
  [ "$status" -eq 0 ]
  output2="$output"
  [ "$output1" = "$output2" ]

  run bash -c 'printf -- "no frontmatter\n" | python3 "$1" --source "$2" --source-kind unknown --observed-at nope --valid-from 2026-08-19' _ "$METADATA" "$SRC"
  [ "$status" -eq 2 ]
  [ -z "$output" ] || [[ "$output" == error:* ]]
}

@test "lifecycle audit reports temporal provenance and conflicting claims without mutation" {
  local revision before after json
  revision="$(sha256sum "$SRC" | awk '{print $1}')"
  page alpha 2026-01-01 2027-01-01 blue "$revision"
  page beta 2026-06-01 2028-01-01 green deadbeef
  cat >> "$WIKI/beta.md" <<'EOF'
claim-like prose: deployment.mode = ignored
EOF
  cat > "$WIKI/invalid.md" <<'EOF'
---
type: note
tags: [test]
status: active
source_kind: "openspec"
source_revision: "deadbeef"
observed_at: "2026-08-19T12:00:00Z"
valid_from: "2027-01-01"
valid_until: "2026-01-01"
superseded_by: "missing-page"
---
source:: Bachelorprojekt ../outside.md
EOF
  cat > "$WIKI/legacy.md" <<'EOF'
---
type: note
tags: [legacy]
status: active
---
# Legacy
EOF
  before="$(wiki_inventory)"

  run python3 "$AUDIT" --brain-repo "$BATS_TEST_TMPDIR/brain" --source-root "$BATS_TEST_TMPDIR" --as-of 2026-08-19T12:00:00Z --format json
  [ "$status" -eq 1 ]
  json="$output"
  python3 - "$json" <<'PY'
import json, sys
data = json.loads(sys.argv[1])
assert data["schema_version"] == 1
codes = [item["code"] for item in data["findings"]]
for code in ("conflicting_claim", "invalid_interval", "metadata_unknown", "missing_superseded_target", "source_unavailable", "stale_source"):
    assert code in codes, (code, codes)
assert codes == sorted(codes)
assert data["summary"]["finding_count"] == len(data["findings"])
PY
  after="$(wiki_inventory)"
  [ "$before" = "$after" ]

  run python3 "$AUDIT" --brain-repo "$BATS_TEST_TMPDIR/brain" --source-root "$BATS_TEST_TMPDIR" --as-of 2026-08-19T12:00:00Z --format text
  [ "$status" -eq 1 ]
  [[ "$output" == *"findings="* ]]
  [ "$before" = "$(wiki_inventory)" ]
}

@test "lifecycle audit returns zero for a clean fixture and two for malformed pages" {
  local revision
  revision="$(sha256sum "$SRC" | awk '{print $1}')"
  page clean 2026-01-01 2027-01-01 blue "$revision"
  run python3 "$AUDIT" --brain-repo "$BATS_TEST_TMPDIR/brain" --source-root "$BATS_TEST_TMPDIR" --as-of 2026-08-19 --format json
  [ "$status" -eq 0 ]

  printf '%s\n' '---' 'nested:' '  forbidden: true' '---' > "$WIKI/bad.md"
  run python3 "$AUDIT" --brain-repo "$BATS_TEST_TMPDIR/brain" --source-root "$BATS_TEST_TMPDIR" --format json
  [ "$status" -eq 2 ]
}

@test "lifecycle audit ignores contradictory claims on draft and archived pages" {
  local revision json
  revision="$(sha256sum "$SRC" | awk '{print $1}')"
  page active-page 2026-01-01 2027-01-01 blue "$revision"
  page draft-page 2026-01-01 2027-01-01 green "$revision"
  page archived-page 2026-01-01 2027-01-01 red "$revision"
  sed -i 's/status: active/status: draft/' "$WIKI/draft-page.md"
  sed -i 's/status: active/status: archived/' "$WIKI/archived-page.md"

  run python3 "$AUDIT" --brain-repo "$BATS_TEST_TMPDIR/brain" --source-root "$BATS_TEST_TMPDIR" --as-of 2026-08-19 --format json
  [ "$status" -eq 0 ]
  json="$output"
  python3 - "$json" <<'PY'
import json, sys
assert all(item["code"] != "conflicting_claim" for item in json.loads(sys.argv[1])["findings"])
PY
}

@test "expertise fetch stage approve is explicit scoped redacted and allowlisted" {
  local stub="$BATS_TEST_TMPDIR/bin" state="$BATS_TEST_TMPDIR/state" repo="$BATS_TEST_TMPDIR/repo"
  local sha="0123456789abcdef0123456789abcdef01234567"
  mkdir -p "$stub" "$repo/docs/brain-expertise/approved" "$repo/scripts/brain"
  cp "$REPO_ROOT/scripts/brain/ingest-sources.yaml" "$repo/scripts/brain/ingest-sources.yaml"
  cat > "$stub/gh" <<'SH'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$GH_LOG"
case "$*" in
  'api repos/Paddione/Bachelorprojekt/pulls/123')
    printf '%s\n' '{"number":123,"html_url":"https://github.com/Paddione/Bachelorprojekt/pull/123","title":"Decision","body":"mail a@b.test token=ghp_abcdefghijklmnopqrstuvwxyz123456","head":{"sha":"0123456789abcdef0123456789abcdef01234567"},"user":{"login":"private-user"}}' ;;
  'api --paginate repos/Paddione/Bachelorprojekt/pulls/123/files')
    printf '%s\n' '[{"filename":"scripts/a.py","status":"modified","patch":"+ Authorization: Bearer abc.def.ghi"}]'
    printf '%s\n' '[{"filename":"scripts/b.py","status":"added","patch":"+ bounded second page"}]' ;;
  'api --paginate repos/Paddione/Bachelorprojekt/pulls/123/reviews')
    printf '%s\n' '[{"id":91,"html_url":"https://github.com/x/r/91","state":"APPROVED","body":"use bounded scope","user":{"login":"reviewer-name"}}]'
    printf '%s\n' '[{"id":93,"html_url":"https://github.com/x/r/93","state":"COMMENTED","body":"second page review"}]' ;;
  'api --paginate repos/Paddione/Bachelorprojekt/issues/123/comments')
    printf '%s\n' '[{"id":92,"html_url":"https://github.com/x/c/92","body":"password=hunter2","user":{"login":"commenter-name"}}]' ;;
  *) exit 90 ;;
esac
SH
  chmod +x "$stub/gh"
  export GH_LOG="$BATS_TEST_TMPDIR/gh.log"

  run env PATH="$stub:$PATH" python3 "$EXPERTISE" --repo-root "$repo" --state-dir "$state" fetch --repo Paddione/Bachelorprojekt --pr 123 --revision "$sha"
  [ "$status" -eq 0 ]
  [ "$(wc -l < "$GH_LOG")" -eq 4 ]
  ! grep -Eq 'search|pr list|orgs/' "$GH_LOG"
  ! grep -R -E 'private-user|reviewer-name|commenter-name|a@b.test|hunter2|ghp_' "$state"
  grep -R -q '\[REDACTED:' "$state"
  grep -R -q 'scripts/b.py' "$state"
  grep -R -q '"id": 93' "$state"
  [ "$(find "$state" -type d -printf '%m\n' | sort -u)" = 700 ]
  [ "$(find "$state" -type f -printf '%m\n' | sort -u)" = 600 ]

  run python3 "$EXPERTISE" --repo-root "$repo" --state-dir "$state" stage --repo Paddione/Bachelorprojekt --pr 123 --revision "$sha"
  [ "$status" -eq 0 ]
  grep -R -q 'status: staged' "$state/staged"
  [ -z "$(find "$repo/docs/brain-expertise/approved" -type f -print -quit)" ]
  mkdir -p "$repo/docs/brain-expertise/staged"
  printf 'not approved\n' > "$repo/docs/brain-expertise/staged/candidate.md"
  run bash "$REPO_ROOT/scripts/brain-ingest-worklist.sh" --root "$repo" --manifest "$REPO_ROOT/scripts/brain/ingest-sources.yaml"
  [ "$status" -eq 0 ]
  [[ "$output" != *'staged/candidate.md'* ]]

  printf 'APPROVE Paddione/Bachelorprojekt#123@%s review-gated-brain-ingest\n' "$sha" > "$BATS_TEST_TMPDIR/approval.txt"
  run python3 "$EXPERTISE" --repo-root "$repo" --state-dir "$state" approve --repo Paddione/Bachelorprojekt --pr 123 --revision "$sha" --slug review-gated-brain-ingest --approval-file "$BATS_TEST_TMPDIR/approval.txt"
  [ "$status" -eq 0 ]
  local approved
  approved="$(find "$repo/docs/brain-expertise/approved" -type f -name '*.md')"
  [ -f "$approved" ]
  grep -q 'source_kind: github-reviewed' "$approved"
  grep -q "upstream_revision: $sha" "$approved"
  ! grep -q '^source_revision:' "$approved"
  grep -q 'review_ids: \[91, 93\]' "$approved"
  run bash "$REPO_ROOT/scripts/brain-ingest-worklist.sh" --root "$repo" --manifest "$REPO_ROOT/scripts/brain/ingest-sources.yaml"
  [ "$status" -eq 0 ]
  [[ "$output" == *$'\tgithub-reviewed'* ]]

  run python3 "$EXPERTISE" --repo-root "$repo" --state-dir "$state" approve --repo Paddione/Bachelorprojekt --pr 123 --revision "$sha" --slug review-gated-brain-ingest --approval-file "$BATS_TEST_TMPDIR/approval.txt"
  [ "$status" -eq 0 ]

  run python3 "$EXPERTISE" --repo-root "$repo" --state-dir "$repo/state" stage --repo Paddione/Bachelorprojekt --pr 123 --revision "$sha"
  [ "$status" -eq 2 ]

  run python3 "$EXPERTISE" --repo-root "$repo" --state-dir "$state" fetch --repo ../Bachelorprojekt --pr 123 --revision "$sha"
  [ "$status" -eq 2 ]

  local compiled="$BATS_TEST_TMPDIR/compiled.md" local_hash response
  local_hash="$(sha256sum "$approved" | awk '{print $1}')"
  printf '%s\n' '---' 'type: note' 'tags: [github-reviewed, expertise]' 'status: active' '---' 'bounded expertise evidence' \
    | python3 "$METADATA" --source "$approved" --source-kind github-reviewed \
        --upstream-revision "$sha" --observed-at 2026-08-19T12:00:00Z --valid-from 2026-08-19 > "$compiled"
  grep -q "source_revision: \"$local_hash\"" "$compiled"
  grep -q "upstream_revision: \"$sha\"" "$compiled"
  mkdir -p "$BATS_TEST_TMPDIR/retrieval-wiki"
  cp "$compiled" "$BATS_TEST_TMPDIR/retrieval-wiki/reviewed.md"
  response="$(BRAIN_WIKI_DIR="$BATS_TEST_TMPDIR/retrieval-wiki" python3 "$REPO_ROOT/scripts/brain-mcp-server.py" <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"brain_search","arguments":{"query":"bounded expertise","source_kind":"github-reviewed"}}}
EOF
)"
  [[ "$response" == *"$local_hash"* ]]
  [[ "$response" == *"$sha"* ]]
}
