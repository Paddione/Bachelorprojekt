#!/usr/bin/env bats
# bats file_tags=offline
# Offline test: `ticket.sh lastenheft` lock/unlock + `plan-meta --requirements`, and the
# queue.sh autopilot gate. Arg-validation runs before any cluster access; SQL shape is
# asserted against captured psql input. kubectl is mocked; no live cluster.

setup() {
  TICKET="$BATS_TEST_DIRNAME/../../scripts/ticket.sh"
  QUEUE="$BATS_TEST_DIRNAME/../../scripts/factory/queue.sh"
  MOCKDIR="$(mktemp -d)"
  CAP="$MOCKDIR/captured.sql"
  # Default mock: any exec (count SELECT + UPDATE) returns "1" so lock precondition passes.
  cat > "$MOCKDIR/kubectl" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "\$*" == *"exec"* ]]; then echo "# kubectl \$*" >> "$CAP"; cat >> "$CAP"; echo "1"; exit 0; fi
exit 0
EOF
  chmod +x "$MOCKDIR/kubectl"
  PATH="$MOCKDIR:$PATH"
  export PATH CAP
}

teardown() { rm -rf "$MOCKDIR"; }

@test "lastenheft requires a subaction (deterministic exit 2 without a cluster)" {
  run bash "$TICKET" lastenheft
  [ "$status" -eq 2 ]
  [[ "$output" == *"lock|unlock"* ]]
}

@test "lastenheft rejects an unknown subaction" {
  run bash "$TICKET" lastenheft frobnicate --id T000123
  [ "$status" -eq 2 ]
  [[ "$output" == *"lock|unlock"* ]]
}

@test "lastenheft lock requires --id" {
  run bash "$TICKET" lastenheft lock
  [ "$status" -eq 2 ]
  [[ "$output" == *"--id is required"* ]]
}

@test "lastenheft lock sets the flag (true) and forward-transitions status to backlog" {
  run bash "$TICKET" lastenheft lock --id T000123
  [ "$status" -eq 0 ]
  grep -q '"lastenheft_locked":true' "$CAP"
  grep -q "COALESCE(readiness,'{}'::jsonb) ||" "$CAP"
  grep -q "status    = CASE WHEN status IN ('triage','planning','plan_staged') THEN 'backlog' ELSE status END" "$CAP"
}

@test "lastenheft lock refuses an empty Lastenheft (exit 3)" {
  # Override the mock so the requirements-count SELECT returns 0.
  cat > "$MOCKDIR/kubectl" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "\$*" == *"exec"* ]]; then echo "0"; exit 0; fi
exit 0
EOF
  chmod +x "$MOCKDIR/kubectl"
  run bash "$TICKET" lastenheft lock --id T000123
  [ "$status" -eq 3 ]
  [[ "$output" == *"Lastenheft is empty"* ]]
}

@test "lastenheft unlock clears the flag (false) and does NOT transition status" {
  run bash "$TICKET" lastenheft unlock --id T000123
  [ "$status" -eq 0 ]
  grep -q '"lastenheft_locked":false' "$CAP"
  ! grep -q "THEN 'backlog'" "$CAP"
}

@test "plan-meta --requirements writes requirements_list, preserving commas (pipe-separated)" {
  run bash "$TICKET" plan-meta set --id T000123 --requirements 'Login via SSO|Export, als PDF'
  [ "$status" -eq 0 ]
  grep -q "requirements_list = COALESCE(ARRAY\['Login via SSO','Export, als PDF'\], requirements_list)" "$CAP"
}

@test "queue.sh gates the autopilot on a locked Lastenheft (fail-closed)" {
  grep -q "COALESCE((readiness->>'lastenheft_locked')::boolean, false) = true" "$QUEUE"
}
