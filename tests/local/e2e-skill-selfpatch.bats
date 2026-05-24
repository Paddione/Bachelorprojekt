#!/usr/bin/env bats
# tests/local/e2e-skill-selfpatch.bats — unit tests for e2e-skill-selfpatch.sh
# These tests stub kubectl/gh so they run fully offline.

setup() {
  export BATS_TMPDIR="$(mktemp -d)"
  # Stub kubectl and gh before real binaries
  mkdir -p "$BATS_TMPDIR/stubs"
  cat > "$BATS_TMPDIR/stubs/kubectl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then
  echo "pod/shared-db-0"
elif [[ "$*" == *"psql"* ]]; then
  echo "1"
fi
EOF
  chmod +x "$BATS_TMPDIR/stubs/kubectl"
  cat > "$BATS_TMPDIR/stubs/gh" <<'EOF'
#!/usr/bin/env bash
echo "[stub-gh] $*"
EOF
  chmod +x "$BATS_TMPDIR/stubs/gh"
  export PATH="$BATS_TMPDIR/stubs:$PATH"
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "e2e-skill-selfpatch: exits 2 with no args" {
  run bash scripts/e2e-skill-selfpatch.sh
  [ "$status" -eq 2 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "e2e-skill-selfpatch: --list-trivial exits 0 when no pod found" {
  cat > "$BATS_TMPDIR/stubs/kubectl" <<'EOF'
#!/usr/bin/env bash
echo ""
EOF
  chmod +x "$BATS_TMPDIR/stubs/kubectl"
  run bash scripts/e2e-skill-selfpatch.sh --list-trivial
  [ "$status" -eq 0 ]
}

@test "e2e-skill-selfpatch: trivial classification regex matches command errors" {
  run bash -c '
    echo "wrong command flag --headed missing" \
      | grep -qiE "command|flag|example|typo|wrong.*path|missing.*step|exit.?code|add.*check" \
      && echo "trivial" || echo "structural"
  '
  [ "$status" -eq 0 ]
  [ "$output" = "trivial" ]
}

@test "e2e-skill-selfpatch: trivial classification regex rejects structural description" {
  run bash -c '
    echo "Step 5 should be moved before Step 3 to match routing order" \
      | grep -qiE "command|flag|example|typo|wrong.*path|missing.*step|exit.?code|add.*check" \
      && echo "trivial" || echo "structural"
  '
  [ "$status" -eq 0 ]
  [ "$output" = "structural" ]
}

@test "e2e-skill-selfpatch: --commit requires two args" {
  run bash scripts/e2e-skill-selfpatch.sh --commit
  [ "$status" -ne 0 ]
}

@test "e2e-skill-selfpatch: --defer-structural exits 0 when no pod" {
  cat > "$BATS_TMPDIR/stubs/kubectl" <<'EOF'
#!/usr/bin/env bash
echo ""
EOF
  chmod +x "$BATS_TMPDIR/stubs/kubectl"
  run bash scripts/e2e-skill-selfpatch.sh --defer-structural
  [ "$status" -eq 0 ]
}
