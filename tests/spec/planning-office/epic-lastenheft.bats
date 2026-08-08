#!/usr/bin/env bats
# bats file_tags=offline
# tests/spec/planning-office/epic-lastenheft.bats
# SSOT: openspec/specs/planning-office.md — "Epics durchlaufen das Lastenheft-Gate".
#
# Der CLI-Lock-Pfad (`ticket.sh lastenheft lock`) ist typunabhängig: er adressiert
# das Ticket per external_id, nicht per Typ. Damit ein Epic (`type=project`) über
# dasselbe Gate laufen kann wie ein Feature, darf der Lock-Pfad keine Typ-Bindung
# einführen. Die Tests prüfen das am gemockten kubectl (kein Live-Cluster):
#
#   Positiv-Anker (zuerst):  Lock mit >=1 Requirement endet mit Exit null und
#                            setzt lastenheft_locked:true + Status-Forwarding.
#   Negativ-Aussage:         Derselbe Pfad ohne Requirement endet mit Exit != 0
#                            und nennt das leere Lastenheft.

setup() {
  TICKET="$BATS_TEST_DIRNAME/../../../scripts/ticket.sh"
  MOCKDIR="$(mktemp -d)"
  CAP="$MOCKDIR/captured.sql"
  cat > "$MOCKDIR/kubectl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then echo "# kubectl $*" >> "$CAP"; cat >> "$CAP"; echo "1"; exit 0; fi
exit 0
EOF
  chmod +x "$MOCKDIR/kubectl"
  PATH="$MOCKDIR:$PATH"
  export PATH CAP
}

teardown() { rm -rf "$MOCKDIR"; }

@test "epic-lastenheft: lastenheft lock on a project ticket with >=1 requirement ends with exit 0" {
  run bash "$TICKET" lastenheft lock --id T000440
  [ "$status" -eq 0 ]
  grep -q '"lastenheft_locked":true' "$CAP"
  grep -q "COALESCE(readiness,'{}'::jsonb) ||" "$CAP"
  grep -q "status    = CASE WHEN status IN ('triage','planning','plan_staged') THEN 'backlog' ELSE status END" "$CAP"
}

@test "epic-lastenheft: the lock SQL is not bound to a ticket type (project covered)" {
  run bash "$TICKET" lastenheft lock --id T000440
  [ "$status" -eq 0 ]
  # A type restriction would silently exclude type=project epics from the gate.
  grep -qiE "WHERE .*external_id.*AND.*type" "$CAP" && return 1
  grep -q "WHERE external_id = :'ext_id'" "$CAP"
}

@test "epic-lastenheft: lastenheft lock without a requirement ends with exit != 0 and names the empty Lastenheft" {
  cat > "$MOCKDIR/kubectl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then echo "0"; exit 0; fi
exit 0
EOF
  chmod +x "$MOCKDIR/kubectl"
  run bash "$TICKET" lastenheft lock --id T000440
  [ "$status" -ne 0 ]
  [[ "$output" == *"Lastenheft is empty"* ]]
}
