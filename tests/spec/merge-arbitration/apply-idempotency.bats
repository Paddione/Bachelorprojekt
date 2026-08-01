setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR" || exit
  git init --initial-branch main && git config user.email test@test && git config user.name test
  echo 'base' > file-a.ts && git add -A && git commit -m 'base'
  git checkout -b pr1 && echo 'change1' > file-a.ts && git commit -am 'pr1 change'
  git checkout main && git checkout -b pr2 && echo 'change2' > file-a.ts && git commit -am 'pr2 change'
  git checkout main && git checkout -b pr3 && echo 'change3' > file-a.ts && git commit -am 'pr3 change'
  git checkout main
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "T002423-M5: zweiter Lauf ohne Push tut nichts; head-SHA-Wechsel arbitriert erneut" {
  APPLY="$REPO/scripts/arbitration/apply.sh"
  PATH_STUB="$TMPDIR/stub"; mkdir -p "$PATH_STUB"

  cat > "$TMPDIR/synthesize-stub.mjs" <<'JS'
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const cluster = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const file = cluster.files[0];
  const merged = {};
  merged[file] = 'merged content\n';
  process.stdout.write(JSON.stringify({
    merged, confidence: 0.95, rationale: 'ok', per_pr_notes: {},
  }));
});
JS

  cluster_json() {
    local key="$1" sha_a="$2" sha_b="$3" sha_c="$4"
    jq -n --arg key "$key" --arg sa "$sha_a" --arg sb "$sha_b" --arg sc "$sha_c" '
      { cluster_key: $key,
        files: ["file-a.ts"],
        eligible_prs: [
          {number:9001, head_sha:$sa, branch:"pr1", ticket:"T0001", title:"fix: pr1"},
          {number:9002, head_sha:$sb, branch:"pr2", ticket:"T0002", title:"fix: pr2"},
          {number:9003, head_sha:$sc, branch:"pr3", ticket:"T0003", title:"fix: pr3"}
        ],
        ineligible_prs: [] }'
  }

  KEY_V1="1111111111111111111111111111111111111111111111111111111111111111"
  KEY_V1="${KEY_V1:0:64}"
  CLUSTER_V1="$(cluster_json "$KEY_V1" shaA shaB shaC)"

  # --- Erster Lauf: keine offene Arbitrierung -> APPLIED ---
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

  run env PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi TICKET_SH=/bin/true \
    SYNTHESIZE="$TMPDIR/synthesize-stub.mjs" SHARED_STATE=/dev/null \
    bash "$APPLY" <<< "$CLUSTER_V1"
  echo "output(1st run)=$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"APPLIED"* ]]
  git checkout main -q
  run git rev-parse --verify "chore/merge-arbitration-${KEY_V1:0:12}"
  [ "$status" -eq 0 ]

  # --- Zweiter Lauf, GLEICHER cluster_key: gh-axi meldet jetzt einen
  #     offenen arbitration-PR mit diesem Key im Titel -> IDEMPOTENT, kein
  #     zusaetzlicher Branch. ---
  cat > "$PATH_STUB/gh-axi" <<STUB
#!/usr/bin/env bash
case "\$1 \$2" in
  "pr list") echo '[{"number":9999,"headRefName":"chore/merge-arbitration-${KEY_V1:0:12}","labels":[{"name":"arbitration"}],"title":"merge-arbitration [${KEY_V1:0:12}]"}]' ;;
  "pr create") echo "SHOULD NOT BE CALLED"; exit 1 ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$PATH_STUB/gh-axi"

  run env PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi TICKET_SH=/bin/true \
    SYNTHESIZE="$TMPDIR/synthesize-stub.mjs" SHARED_STATE=/dev/null \
    bash "$APPLY" <<< "$CLUSTER_V1"
  echo "output(2nd run, same key)=$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"IDEMPOTENT"* ]]
  [[ "$output" != *"APPLIED"* ]]

  # --- Positiv-Anker: nach simuliertem head-SHA-Wechsel aendert sich der
  #     cluster_key -> keine Idempotenz-Kollision -> wieder APPLIED. ---
  KEY_V2="2222222222222222222222222222222222222222222222222222222222222222"
  KEY_V2="${KEY_V2:0:64}"
  CLUSTER_V2="$(cluster_json "$KEY_V2" shaA2 shaB shaC)"

  cat > "$PATH_STUB/gh-axi" <<STUB
#!/usr/bin/env bash
case "\$1 \$2" in
  "pr list") echo '[{"number":9999,"headRefName":"chore/merge-arbitration-${KEY_V1:0:12}","labels":[{"name":"arbitration"}],"title":"merge-arbitration [${KEY_V1:0:12}]"}]' ;;
  "pr create") echo "https://example.invalid/pr/2"; exit 0 ;;
  "pr comment") exit 0 ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$PATH_STUB/gh-axi"

  run env PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi TICKET_SH=/bin/true \
    SYNTHESIZE="$TMPDIR/synthesize-stub.mjs" SHARED_STATE=/dev/null \
    bash "$APPLY" <<< "$CLUSTER_V2"
  echo "output(3rd run, changed key)=$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"APPLIED"* ]]
  git checkout main -q
  run git rev-parse --verify "chore/merge-arbitration-${KEY_V2:0:12}"
  [ "$status" -eq 0 ]
}
