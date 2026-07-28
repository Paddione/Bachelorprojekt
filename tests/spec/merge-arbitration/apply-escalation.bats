setup() {
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR" || exit
  git init --initial-branch main && git config user.email test@test && git config user.name test
  mkdir -p website/src/lib scripts/factory
  echo 'base' > website/src/lib/x.ts
  echo 'k3d/' > scripts/factory/shared-state-paths.txt
  echo 'prod' >> scripts/factory/shared-state-paths.txt
  git add -A && git commit -m 'base'
  git checkout -b pr1 && echo 'change1' > website/src/lib/x.ts && git commit -am 'pr1 change'
  git checkout main && git checkout -b pr2 && echo 'change2' > website/src/lib/x.ts && git commit -am 'pr2 change'
  git checkout main && git checkout -b pr3 && echo 'change3' > website/src/lib/x.ts && git commit -am 'pr3 change'
  git checkout main
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "T002423-M4: k3d-Pfad eskaliert bei confidence 0.99; Positiv-Anker: website-Pfad oeffnet PR" {
  skip "benötigt apply.sh + gh-axi stub — später implementiert"
}
