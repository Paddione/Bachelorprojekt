#!/usr/bin/env bats
# Tests: batch-gap-analysis.sh — offline mit gemocktem kubectl

setup() {
  # Mock kubectl: gibt ein Ticket als JSON zurück
  MOCK_DIR="$(mktemp -d)"
  cat > "$MOCK_DIR/kubectl" << 'MOCK'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then
  echo "pod/shared-db-dev-0"
elif [[ "$*" == *"psql"* ]]; then
  echo '[{"external_id":"T000601","title":"Test Ticket","description":"Baue eine Funktion","brand":"mentolder","priority":"mittel","severity":null}]'
elif [[ "$*" == *"exec"* ]]; then
  echo '[{"external_id":"T000601","title":"Test Ticket","description":"Baue eine Funktion","brand":"mentolder","priority":"mittel","severity":null}]'
fi
MOCK
  chmod +x "$MOCK_DIR/kubectl"
  export PATH="$MOCK_DIR:$PATH"
  SCRIPT="$BATS_TEST_DIRNAME/../../scripts/batch-gap-analysis.sh"
}

teardown() { rm -rf "$MOCK_DIR"; }

@test "gibt valides JSON-Array zurueck" {
  result=$(bash "$SCRIPT" 2>/dev/null)
  echo "$result" | jq -e '. | type == "array"'
}

@test "jedes Element hat external_id und description" {
  result=$(bash "$SCRIPT" 2>/dev/null)
  count=$(echo "$result" | jq '[.[] | select(.external_id and .description)] | length')
  [[ "$count" -gt 0 ]]
}

@test "leeres Ergebnis wenn keine planning-Tickets" {
  # Mock gibt leeres Array zurück
  cat > "$MOCK_DIR/kubectl" << 'MOCK'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then
  echo "pod/shared-db-dev-0"
elif [[ "$*" == *"exec"* ]] || [[ "$*" == *"psql"* ]]; then
  echo '[]'
fi
MOCK
  result=$(bash "$SCRIPT" 2>/dev/null)
  [[ "$result" == "[]" ]] || [[ "$result" == "" ]]
}
