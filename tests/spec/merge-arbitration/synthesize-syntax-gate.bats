setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR" || exit
  git init --initial-branch main && git config user.email test@test && git config user.name test
  mkdir -p scripts/lib
  echo 'base' > scripts/lib/util.js
  git add -A && git commit -m 'base'
  git checkout -b pr1 && echo 'change1' > scripts/lib/util.js && git commit -am 'pr1 change'
  git checkout main && git checkout -b pr2 && echo 'change2' > scripts/lib/util.js && git commit -am 'pr2 change'
  git checkout main && git checkout -b pr3 && echo 'change3' > scripts/lib/util.js && git commit -am 'pr3 change'
  git checkout main
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "T002423-M6: kaputtes JS in LLM-Antwort fuehrt zu Eskalation; valides JS oeffnet PR" {
  APPLY="$REPO/scripts/arbitration/apply.sh"
  PATH_STUB="$TMPDIR/stub"; mkdir -p "$PATH_STUB"

  cat > "$PATH_STUB/gh-axi" <<'STUB'
#!/usr/bin/env bash
case "$1 $2" in
  "pr list") echo '[]' ;;
  "pr create") echo "https://example.invalid/pr/1"; exit 0 ;;
  "pr comment") exit 0 ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$PATH_STUB/gh-axi"

  CLUSTER="$(jq -n '
    { cluster_key: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      files: ["scripts/lib/util.js"],
      eligible_prs: [
        {number:7001, head_sha:"sha1", branch:"pr1", ticket:"T0001", title:"fix: pr1"},
        {number:7002, head_sha:"sha2", branch:"pr2", ticket:"T0002", title:"fix: pr2"},
        {number:7003, head_sha:"sha3", branch:"pr3", ticket:"T0003", title:"fix: pr3"}
      ],
      ineligible_prs: [] }')"

  # --- Fall 1: manipulierte LLM-Antwort mit kaputtem JS -> Syntax-Gate rot -> Eskalation ---
  cat > "$TMPDIR/synthesize-broken.mjs" <<'JS'
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({
    merged: { "scripts/lib/util.js": "function broken( {\n  return 1\n" },
    confidence: 0.95,
    rationale: 'kaputte Syntax zu Testzwecken',
    per_pr_notes: {},
  }));
});
JS

  run env PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi TICKET_SH=/bin/true \
    SYNTHESIZE="$TMPDIR/synthesize-broken.mjs" SHARED_STATE=/dev/null \
    bash "$APPLY" <<< "$CLUSTER"
  echo "output(broken)=$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ESCALATE"* ]]
  [[ "$output" == *"syntax_gate"* ]]
  [[ "$output" != *"APPLIED"* ]]
  run git rev-parse --verify "chore/merge-arbitration-abcdefabcdef"
  [ "$status" -ne 0 ]

  # --- Positiv-Anker: valides JS derselben Antwortform -> Syntax-Gate gruen -> PR ---
  cat > "$TMPDIR/synthesize-valid.mjs" <<'JS'
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({
    merged: { "scripts/lib/util.js": "function ok() {\n  return 1;\n}\n" },
    confidence: 0.95,
    rationale: 'valide Syntax',
    per_pr_notes: {},
  }));
});
JS

  run env PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi TICKET_SH=/bin/true \
    SYNTHESIZE="$TMPDIR/synthesize-valid.mjs" SHARED_STATE=/dev/null \
    bash "$APPLY" <<< "$CLUSTER"
  echo "output(valid)=$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"APPLIED"* ]]
  [[ "$output" != *"ESCALATE"* ]]
  git checkout main -q
  run git rev-parse --verify "chore/merge-arbitration-abcdefabcdef"
  [ "$status" -eq 0 ]
}
