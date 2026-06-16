#!/usr/bin/env bats
# Offline test: `ticket.sh grill` — arg validation (Exit 2 w/o cluster), JSON build
# from --answer pairs, and the per-question merge SQL shape (ADD COLUMN IF NOT EXISTS +
# COALESCE(...) || jsonb_build_object(...)). kubectl is mocked; no live cluster.

setup() {
  TICKET="$BATS_TEST_DIRNAME/../../scripts/ticket.sh"
  MOCKDIR="$(mktemp -d)"
  CAP="$MOCKDIR/captured.sql"
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

@test "grill requires --id (deterministic exit 2 without a cluster)" {
  run bash "$TICKET" grill --answer q1=foo
  [ "$status" -eq 2 ]
  [[ "$output" == *"--id is required"* ]]
}

@test "grill requires an answer source" {
  run bash "$TICKET" grill --id T000123
  [ "$status" -eq 2 ]
  [[ "$output" == *"one answer source is required"* ]]
}

@test "grill rejects more than one answer source" {
  run bash "$TICKET" grill --id T000123 --json '{"q1":"a"}' --answer q2=b
  [ "$status" -eq 2 ]
  [[ "$output" == *"exactly one of"* ]]
}

@test "grill rejects a malformed --answer pair" {
  run bash "$TICKET" grill --id T000123 --answer noequalshere
  [ "$status" -eq 2 ]
  [[ "$output" == *"<qid>=<text>"* ]]
}

@test "grill builds {\"q1\":\"foo\",\"q2\":\"bar\"} from repeated --answer" {
  run bash "$TICKET" grill --id T000123 --answer q1=foo --answer q2=bar
  [ "$status" -eq 0 ]
  # The answers JSON is bound as a psql -v param echoed into the captured SQL invocation;
  # assert the merge target carries both pairs.
  grep -q '"q1":"foo"' "$CAP"
  grep -q '"q2":"bar"' "$CAP"
}

@test "grill emits idempotent ADD COLUMN + per-question merge SQL" {
  run bash "$TICKET" grill --id T000123 --answer q1=foo
  [ "$status" -eq 0 ]
  grep -q "ADD COLUMN IF NOT EXISTS grilling_answers JSONB" "$CAP"
  grep -q "UPDATE tickets.tickets" "$CAP"
  grep -q "jsonb_build_object" "$CAP"
  grep -q "COALESCE(grilling_answers" "$CAP"
}

@test "grill --no-comment skips the timeline comment insert" {
  run bash "$TICKET" grill --id T000123 --answer q1=foo --no-comment
  [ "$status" -eq 0 ]
  ! grep -q "INSERT INTO tickets.ticket_comments" "$CAP"
}

@test "grill (default) writes a grilling-authored timeline comment" {
  run bash "$TICKET" grill --id T000123 --answer q1=foo
  [ "$status" -eq 0 ]
  grep -q "INSERT INTO tickets.ticket_comments" "$CAP"
  grep -q "'grilling'" "$CAP"
}

@test "grill --grilling-doc rejects a missing file" {
  run bash "$TICKET" grill --id T000999 --grilling-doc /no/such/file.md
  [ "$status" -eq 2 ]
  [[ "$output" == *"grilling doc missing or empty"* ]]
}

@test "grill --grilling-doc conflicts with --json (exactly one source)" {
  doc="$BATS_TEST_TMPDIR/g.md"; printf '## Q?\n' > "$doc"
  run bash "$TICKET" grill --id T000999 --grilling-doc "$doc" --json '{"q1":"x"}'
  [ "$status" -eq 2 ]
  [[ "$output" == *"exactly one of"* ]]
}

@test "grill --grilling-doc --dry-run-json splits answered vs unanswered" {
  doc="$BATS_TEST_TMPDIR/g.md"
  cat > "$doc" <<'MD'
---
questionnaire: gekko-x
title: Gekko X
---
## Frage eins?
Antwort: Antwort eins.
## Frage zwei?
## Frage drei? {#drei}
A: —
MD
  run bash "$TICKET" grill --id T000999 --grilling-doc "$doc" --dry-run-json
  [ "$status" -eq 0 ]
  [[ "$output" == *'"questionnaireId":"gekko-x"'* ]]
  echo "$output" | grep -q '"answers":{"q1":"Antwort eins."}'
  echo "$output" | grep -q '"id":"drei"'
  ! echo "$output" | grep -q '"drei":'
}

@test "grill --grilling-doc auto-assigns q1..qN and accepts numbered markers" {
  doc="$BATS_TEST_TMPDIR/n.md"
  printf '1. Erste?\nAntwort: A.\n2) Zweite?\n' > "$doc"
  run bash "$TICKET" grill --id T000999 --grilling-doc "$doc" --dry-run-json
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"answers":{"q1":"A."}'
  echo "$output" | grep -q '"id":"q2"'
}
