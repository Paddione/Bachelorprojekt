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

@test "T002423-M2: 2 stimmberechtigte PRs → kein Cluster; Positiv-Anker: 3 PRs feuert" {
  DETECT="$REPO/scripts/arbitration/detect.sh"
  PATH_STUB="$TMPDIR/stub"; mkdir -p "$PATH_STUB"

  cat > "$PATH_STUB/gh-axi" <<'STUB'
#!/usr/bin/env bash
echo '[
  {"number":2001,"headRefName":"pr1","headRefOid":"HEAD","isDraft":false,"labels":{"nodes":[]},"statusCheckRollup":{"state":"SUCCESS"},"title":"fix: pr1 [T0001]"},
  {"number":2002,"headRefName":"pr2","headRefOid":"HEAD","isDraft":false,"labels":{"nodes":[]},"statusCheckRollup":{"state":"SUCCESS"},"title":"fix: pr2 [T0002]"}
]'
STUB
  chmod +x "$PATH_STUB/gh-axi"
  PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi GIT_ATTR=/dev/null run bash "$DETECT"
  echo "output (2 PRs)=$output"
  [ "$status" -eq 0 ]
  JSON=$(echo "$output" | grep -v '^DEBUG' | grep -v '^BW01')
  CLUSTER_COUNT=$(echo "$JSON" | jq '. | length')
  [ "$CLUSTER_COUNT" -eq 0 ]

  cat > "$PATH_STUB/gh-axi" <<'STUB3'
#!/usr/bin/env bash
echo '[
  {"number":2001,"headRefName":"pr1","headRefOid":"HEAD","isDraft":false,"labels":{"nodes":[]},"statusCheckRollup":{"state":"SUCCESS"},"title":"fix: pr1 [T0001]"},
  {"number":2002,"headRefName":"pr2","headRefOid":"HEAD","isDraft":false,"labels":{"nodes":[]},"statusCheckRollup":{"state":"SUCCESS"},"title":"fix: pr2 [T0002]"},
  {"number":2003,"headRefName":"pr3","headRefOid":"HEAD","isDraft":false,"labels":{"nodes":[]},"statusCheckRollup":{"state":"SUCCESS"},"title":"fix: pr3 [T0003]"}
]'
STUB3
  PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi GIT_ATTR=/dev/null run bash "$DETECT"
  echo "output (3 PRs)=$output"
  JSON3=$(echo "$output" | grep -v '^DEBUG' | grep -v '^BW01')
  CLUSTER_COUNT3=$(echo "$JSON3" | jq '. | length')
  [ "$CLUSTER_COUNT3" -eq 1 ]
}
