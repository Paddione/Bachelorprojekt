setup() {
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
  skip "benötigt apply.sh + gh-axi stub — später implementiert"
}
