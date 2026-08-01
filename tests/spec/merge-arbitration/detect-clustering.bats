setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR" || exit
  git init --initial-branch main && git config user.email test@test && git config user.name test
  echo 'base' > file-a.ts && git add -A && git commit -m 'base'
  git checkout -b pr1 && echo 'change1' > file-a.ts && git commit -am 'pr1 change'
  git checkout main && git checkout -b pr2 && echo 'change2' > file-a.ts && git commit -am 'pr2 change'
  git checkout main && git checkout -b pr3 && echo 'change3' > file-a.ts && git commit -am 'pr3 change'
  git checkout main && git checkout -b pr4 && echo 'change4' > file-a.ts && git commit -am 'pr4 change'
  git checkout main && git checkout -b pr5 && echo 'change5' > file-a.ts && git commit -am 'pr5 change'
  git checkout main
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "T002423-M1: detect.sh findet 3er-Cluster und ignoriert Draft/arbitration" {
  PATH_STUB="$TMPDIR/stub"; mkdir -p "$PATH_STUB"
  cat > "$PATH_STUB/gh-axi" <<'STUB'
#!/usr/bin/env bash
echo '[
  {"number":1001,"headRefName":"pr1","headRefOid":"HEAD","isDraft":false,"labels":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr1 [T0001]"},
  {"number":1002,"headRefName":"pr2","headRefOid":"HEAD","isDraft":false,"labels":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr2 [T0002]"},
  {"number":1003,"headRefName":"pr3","headRefOid":"HEAD","isDraft":false,"labels":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr3 [T0003]"},
  {"number":1004,"headRefName":"pr4","headRefOid":"HEAD","isDraft":true,"labels":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr4 [T0004]"},
  {"number":1005,"headRefName":"pr5","headRefOid":"HEAD","isDraft":false,"labels":[{"name":"arbitration"}],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr5 [T0005]"}
]'
STUB
  chmod +x "$PATH_STUB/gh-axi"
  DETECT="$REPO/scripts/arbitration/detect.sh"
  PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi GIT_ATTR=/dev/null run bash "$DETECT"
  echo "output=$output"
  echo "status=$status"

  [ "$status" -eq 0 ]
  JSON=$(echo "$output" | grep -v '^DEBUG')
  CLUSTER_COUNT=$(echo "$JSON" | jq '. | length')
  [ "$CLUSTER_COUNT" -eq 1 ]

  CLUSTER_KEY=$(echo "$output" | jq -r '.[0].cluster_key')
  [ -n "$CLUSTER_KEY" ] && [ ${#CLUSTER_KEY} -eq 64 ]

  ELIGIBLE=$(echo "$output" | jq '.[0].eligible_prs | length')
  [ "$ELIGIBLE" -eq 3 ]

  INELIGIBLE=$(echo "$output" | jq '.[0].ineligible_prs | length')
  [ "$INELIGIBLE" -eq 2 ]
}
