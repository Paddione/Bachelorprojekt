setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR" || exit
  git init --initial-branch main && git config user.email test@test && git config user.name test
  mkdir -p docs/code-quality
  echo '{"generated":true}' > docs/code-quality/repo-index.json
  echo 'docs/code-quality/repo-index.json merge=ours linguist-generated=true' >> .gitattributes
  git add -A && git commit -m 'base with gitattributes'
  git checkout -b pr1 && echo 'change1' > docs/code-quality/repo-index.json && git commit -am 'pr1 change'
  git checkout main && git checkout -b pr2 && echo 'change2' > docs/code-quality/repo-index.json && git commit -am 'pr2 change'
  git checkout main && git checkout -b pr3 && echo 'change3' > docs/code-quality/repo-index.json && git commit -am 'pr3 change'
  git checkout main
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "T002423-M3: generated files erzeugen keinen Cluster; Positiv-Anker: nicht-generated feuert" {
  DETECT="$REPO/scripts/arbitration/detect.sh"
  PATH_STUB="$TMPDIR/stub"; mkdir -p "$PATH_STUB"

  cat > "$PATH_STUB/gh-axi" <<'STUB'
#!/usr/bin/env bash
echo '[
  {"number":3001,"headRefName":"pr1","headRefOid":"HEAD","isDraft":false,"labels":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr1 [T0001]"},
  {"number":3002,"headRefName":"pr2","headRefOid":"HEAD","isDraft":false,"labels":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr2 [T0002]"},
  {"number":3003,"headRefName":"pr3","headRefOid":"HEAD","isDraft":false,"labels":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr3 [T0003]"}
]'
STUB
  chmod +x "$PATH_STUB/gh-axi"
  cd "$TMPDIR" || exit
  PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi run bash "$DETECT"
  echo "output (generated)=$output"
  JSON=$(echo "$output" | grep -v '^DEBUG')
  CLUSTER_COUNT=$(echo "$JSON" | jq '. | length')
  [ "$CLUSTER_COUNT" -eq 0 ]

  mkdir -p scripts
  echo 'change' > scripts/agent-lock.sh && git add scripts/agent-lock.sh && git commit -m 'add agent-lock.sh'
  git checkout -b pr4 && echo 'change4' > scripts/agent-lock.sh && git commit -am 'pr4 change'
  git checkout main && git checkout -b pr5 && echo 'change5' > scripts/agent-lock.sh && git commit -am 'pr5 change'
  git checkout main && git checkout -b pr6 && echo 'change6' > scripts/agent-lock.sh && git commit -am 'pr6 change'
  git checkout main

  cat > "$PATH_STUB/gh-axi" <<'STUB2'
#!/usr/bin/env bash
echo '[
  {"number":4001,"headRefName":"pr4","headRefOid":"HEAD","isDraft":false,"labels":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr4 [T0004]"},
  {"number":4002,"headRefName":"pr5","headRefOid":"HEAD","isDraft":false,"labels":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr5 [T0005]"},
  {"number":4003,"headRefName":"pr6","headRefOid":"HEAD","isDraft":false,"labels":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"title":"fix: pr6 [T0006]"}
]'
STUB2
  PATH="$PATH_STUB:$PATH" GH_AXI=gh-axi run bash "$DETECT"
  echo "output (non-generated)=$output"
  JSON2=$(echo "$output" | grep -v '^DEBUG')
  CLUSTER_COUNT2=$(echo "$JSON2" | jq '. | length')
  [ "$CLUSTER_COUNT2" -eq 1 ]
}
