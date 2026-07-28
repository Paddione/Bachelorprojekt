setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR" || exit
  git init --initial-branch main && git config user.email test@test && git config user.name test
  mkdir -p website/src/lib scripts/factory k3d
  echo 'base' > website/src/lib/x.ts
  echo 'base: true' > k3d/foo.yaml
  printf 'k3d/\nprod\n' > scripts/factory/shared-state-paths.txt
  git add -A && git commit -m 'base'
  git checkout -b pr1 && echo 'change1' > website/src/lib/x.ts && echo 'change1: true' > k3d/foo.yaml && git commit -am 'pr1 change'
  git checkout main && git checkout -b pr2 && echo 'change2' > website/src/lib/x.ts && echo 'change2: true' > k3d/foo.yaml && git commit -am 'pr2 change'
  git checkout main && git checkout -b pr3 && echo 'change3' > website/src/lib/x.ts && echo 'change3: true' > k3d/foo.yaml && git commit -am 'pr3 change'
  git checkout main
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "T002423-M4: k3d-Pfad eskaliert bei confidence 0.99; Positiv-Anker: website-Pfad oeffnet PR" {
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

  cat > "$PATH_STUB/ticket-sh-stub" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
  chmod +x "$PATH_STUB/ticket-sh-stub"

  cluster_for() {
    local file="$1" num_a="$2" num_b="$3" num_c="$4"
    jq -n --arg f "$file" --argjson a "$num_a" --argjson b "$num_b" --argjson c "$num_c" '
      { cluster_key: ("k" + ($a|tostring) + ($b|tostring) + ($c|tostring) + ("0" * 60)),
        files: [$f],
        eligible_prs: [
          {number:$a, head_sha:"sha1", branch:"pr1", ticket:"T0001", title:"fix: pr1"},
          {number:$b, head_sha:"sha2", branch:"pr2", ticket:"T0002", title:"fix: pr2"},
          {number:$c, head_sha:"sha3", branch:"pr3", ticket:"T0003", title:"fix: pr3"}
        ],
        ineligible_prs: [] }'
  }

  # SYNTHESIZE-Stub: liefert immer confidence 0.99 + validen Inhalt fuer die
  # angefragte Datei (Schema-konform, kein Netzwerk noetig).
  cat > "$TMPDIR/synthesize-stub.mjs" <<'JS'
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const cluster = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const file = cluster.files[0];
  const merged = {};
  merged[file] = file.endsWith('.yaml') ? 'merged: true\n' : 'merged content\n';
  process.stdout.write(JSON.stringify({
    merged,
    confidence: 0.99,
    rationale: 'synthetisierte Testversion',
    per_pr_notes: {},
  }));
});
JS

  # --- Fall 1: Risiko-Pfad k3d/foo.yaml -> Eskalation trotz confidence 0.99 ---
  CLUSTER_K3D="$(cluster_for "k3d/foo.yaml" 101 102 103)"
  run env PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi TICKET_SH="$PATH_STUB/ticket-sh-stub" \
    SYNTHESIZE="$TMPDIR/synthesize-stub.mjs" SHARED_STATE="$TMPDIR/scripts/factory/shared-state-paths.txt" \
    bash "$APPLY" <<< "$CLUSTER_K3D"
  echo "output(k3d)=$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ESCALATE"* ]]
  [[ "$output" == *"risk_path"* ]]
  [[ "$output" != *"APPLIED"* ]]
  K3D_KEY="$(jq -r '.cluster_key' <<< "$CLUSTER_K3D")"
  run git rev-parse --verify "chore/merge-arbitration-${K3D_KEY:0:12}"
  [ "$status" -ne 0 ]

  # --- Positiv-Anker: website/src/lib/x.ts ist NICHT auf der Risiko-Liste -> PR ---
  CLUSTER_WEB="$(cluster_for "website/src/lib/x.ts" 201 202 203)"
  run env PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi TICKET_SH="$PATH_STUB/ticket-sh-stub" \
    SYNTHESIZE="$TMPDIR/synthesize-stub.mjs" SHARED_STATE="$TMPDIR/scripts/factory/shared-state-paths.txt" \
    bash "$APPLY" <<< "$CLUSTER_WEB"
  echo "output(website)=$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"APPLIED"* ]]
  [[ "$output" != *"ESCALATE"* ]]
  git checkout main -q
  WEB_KEY="$(jq -r '.cluster_key' <<< "$CLUSTER_WEB")"
  run git rev-parse --verify "chore/merge-arbitration-${WEB_KEY:0:12}"
  [ "$status" -eq 0 ]
}
