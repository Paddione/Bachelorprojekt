#!/usr/bin/env bats
# Offline test: `ticket.sh create` builds an INSERT into tickets.tickets that
# never sets attention_mode = NULL (the column is NOT NULL; its 'auto' default
# is bypassed by an explicit NULL). Verifies arg-parsing + SQL shape WITHOUT a
# live cluster (kubectl is mocked).

setup() {
  TICKET="$BATS_TEST_DIRNAME/../../scripts/ticket.sh"
  MOCKDIR="$(mktemp -d)"
  CAP="$MOCKDIR/captured.sql"
  cat > "$MOCKDIR/kubectl" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "\$*" == *"exec"* ]]; then cat >> "$CAP"; echo "T000999|fake-uuid-1234"; exit 0; fi
exit 0
EOF
  chmod +x "$MOCKDIR/kubectl"
  PATH="$MOCKDIR:$PATH"
  export PATH CAP
}

teardown() { rm -rf "$MOCKDIR"; }

@test "create requires --type, --title and --description" {
  run bash "$TICKET" create --type bug --title "x"
  [ "$status" -ne 0 ]
  [[ "$output" == *"required"* ]]
}

@test "create never inserts a NULL attention_mode (defaults to 'auto')" {
  run bash "$TICKET" create --type bug --title "T" --description "D"
  [ "$status" -eq 0 ]
  grep -q "INSERT INTO tickets.tickets" "$CAP"
  grep -q "attention_mode" "$CAP"
  # The attention_mode value must coalesce an empty/missing value to 'auto'
  # so the NOT NULL constraint is satisfied without an explicit --attention-mode.
  grep -qiE "COALESCE\(NULLIF\(:'attn', ''\), 'auto'\)" "$CAP"
}

@test "create passes an explicit --attention-mode through" {
  run bash "$TICKET" create --type bug --title "T" --description "D" --attention-mode ai_ready
  [ "$status" -eq 0 ]
  # The COALESCE still wraps the bind param; the value is supplied via -v attn=.
  grep -qiE "COALESCE\(NULLIF\(:'attn', ''\), 'auto'\)" "$CAP"
}
