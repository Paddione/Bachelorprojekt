#!/usr/bin/env bats
# scripts/hooks/mishap-tracker.sh — records process frictions to a ticket comment
# (via ticket.sh add-comment) or, with no --ticket, to a local .mishaps.log.
# Also tests scripts/mishap-categorize.sh — Mishap Auto-Kategorisierung.

setup() {
  TRACKER="$BATS_TEST_DIRNAME/../../scripts/hooks/mishap-tracker.sh"
  CATEGORIZE="$BATS_TEST_DIRNAME/../../scripts/mishap-categorize.sh"
  KEYWORDS="$BATS_TEST_DIRNAME/../../scripts/mishap-keywords.json"
  WORK="$(mktemp -d)"
  cd "$WORK"
}

teardown() { rm -rf "$WORK"; }

# ── mishap-tracker.sh tests ──────────────────────────────────

@test "no --ticket writes to .mishaps.log" {
  run bash "$TRACKER" --friction "ENV var missing" --severity minor
  [ "$status" -eq 0 ]
  [ -f .mishaps.log ]
  grep -q "ENV var missing" .mishaps.log
  grep -q "minor" .mishaps.log
}

@test "missing --friction fails with usage" {
  run bash "$TRACKER" --severity major
  [ "$status" -ne 0 ]
  [[ "$output" == *"--friction is required"* ]]
}

@test "default severity is minor" {
  run bash "$TRACKER" --friction "no severity given"
  [ "$status" -eq 0 ]
  grep -q "minor" .mishaps.log
}

# ── mishap-categorize.sh tests ───────────────────────────────

_categorize_setup() {
  MOCKDIR="$(mktemp -d)"
  cp "$KEYWORDS" "$MOCKDIR/mishap-keywords.json"
  # Use the real keywords file but ensure the script can find it relative to itself
  # We symlink the categorize script into MOCKDIR so the dirname resolves correctly
  cp "$CATEGORIZE" "$MOCKDIR/mishap-categorize.sh"
  # Mock kubectl — captures SQL UPDATE to a file
  CAPFILE="$MOCKDIR/captured.sql"
  cat > "$MOCKDIR/kubectl" <<MOCK
#!/usr/bin/env bash
if [[ "\$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "\$*" == *"exec"* ]]; then cat >> "$CAPFILE"; echo ""; exit 0; fi
exit 0
MOCK
  chmod +x "$MOCKDIR/kubectl"
  PATH="$MOCKDIR:$PATH"
  export PATH CAPFILE MOCKDIR
}

@test "categorize: requires 3 args" {
  run bash "$CATEGORIZE" T001
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage"* ]]
}

@test "categorize: empty title+description → Sonstige" {
  _categorize_setup
  run bash "$MOCKDIR/mishap-categorize.sh" "T001" "" ""
  echo "STATUS=$status OUTPUT=$output" >&2
  [ "$status" -eq 0 ]
  [[ "$output" == *"Sonstige"* ]]
}

@test "categorize: CI-Konflikt via keyword merge conflict" {
  _categorize_setup
  run bash "$MOCKDIR/mishap-categorize.sh" "T002" \
    "CI merge conflict on PR" \
    "CONFLICTING state blocked rebase"
  echo "STATUS=$status OUTPUT=$output" >&2
  [ "$status" -eq 0 ]
  [[ "$output" == *"CI-Konflikt"* ]]
}

@test "categorize: Deploy-Fehler via keyword CrashLoopBackOff" {
  _categorize_setup
  run bash "$MOCKDIR/mishap-categorize.sh" "T003" \
    "Pod CrashLoopBackOff" \
    "rollout failed with ErrImagePull"
  echo "STATUS=$status OUTPUT=$output" >&2
  [ "$status" -eq 0 ]
  [[ "$output" == *"Deploy-Fehler"* ]]
}

@test "categorize: Sonstige when no keyword matches" {
  _categorize_setup
  run bash "$MOCKDIR/mishap-categorize.sh" "T004" \
    "random stuff" \
    "nothing matches any keyword here"
  echo "STATUS=$status OUTPUT=$output" >&2
  [ "$status" -eq 0 ]
  [[ "$output" == *"Sonstige"* ]]
}

@test "categorize: DB INSERT called with correct category (kind tag)" {
  _categorize_setup
  run bash "$MOCKDIR/mishap-categorize.sh" "T005" \
    "API 429 rate limit timeout" \
    "upstream connection refused"
  echo "STATUS=$status OUTPUT=$output CAPFILE=$(cat "$CAPFILE" 2>/dev/null)" >&2
  [ "$status" -eq 0 ]
  [[ "$output" == *"API-Fehler"* ]]
  if [[ -f "$CAPFILE" ]]; then
    grep -q "INSERT INTO tickets.tags" "$CAPFILE"
    grep -q "INSERT INTO tickets.ticket_tags" "$CAPFILE"
  fi
}
