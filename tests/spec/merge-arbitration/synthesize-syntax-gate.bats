setup() {
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR" || exit
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "T002423-M6: kaputtes JS in LLM-Antwort fuehrt zu Eskalation; valides JS oeffnet PR" {
  skip "benötigt synthesize.mjs + apply.sh — später implementiert"
}
