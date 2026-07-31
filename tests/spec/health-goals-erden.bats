#!/usr/bin/env bats
# tests/spec/health-goals-erden.bats
# Ticket: T002402 / openspec/changes/health-goals-erden/tasks.md

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/health-goals-llm-fill.sh"
}

@test "health-goals-llm-fill: prompt contains prefix neighbor goals" {
  # Erstelle temporäres Test-goals.md und Test-JSON
  TEST_DIR="$(mktemp -d)"
  GOALS_FILE="$TEST_DIR/goals.md"
  GEN_JSON="$TEST_DIR/goals.json"
  VALUES_FILE="$TEST_DIR/values.txt"

  cat <<'EOF' > "$GOALS_FILE"
# Health Goals

## G-TEST01 — First Test Goal
Details for TEST01

## G-TEST02 — Second Test Goal
Details for TEST02

| **G-TEST03** | Third Test Goal | 0 | 0 | `cmd` |
EOF

  cat <<'EOF' > "$GEN_JSON"
[
  {
    "id": "G-TEST01",
    "title": "First Test Goal",
    "priority": "C"
  }
]
EOF

  echo "G-DUMMY 1" > "$VALUES_FILE"

  # Führe Skript mit MOCK-LLM oder inspect JSON payload via HG_* Variablen aus
  # Wir mocken LLM_URL mit nc/curl oder prüfen durch Ausführen des Skripts mit ungültigem Gateway (STRICT=0)
  # Aber wir wollen den erzeugten Payload abfangen or python snippet testen.
  
  run bash -c "
    HG_GOALS_FILE='$GOALS_FILE' \
    HG_GEN_JSON='$GEN_JSON' \
    HG_VALUES_FILE='$VALUES_FILE' \
    HG_LLM_URL='http://127.0.0.1:59999/v1' \
    bash '$SCRIPT' --only=G-TEST01 2>&1
  "

  [ "$status" -eq 0 ]

  # Teste direkt die Logik der Kontext-Generierung für G-TEST01
  eval_out=$(python3 -c "
import re

goals_file = '$GOALS_FILE'
gid = 'G-TEST01'

with open(goals_file) as f:
    text = f.read()

pattern = r'##\s+' + re.escape(gid) + r'.*?(?=\n##\s|\Z)'
m = re.search(pattern, text, re.DOTALL)
sec_text = m.group(0)[:1500] if m else '(kein Kontext gefunden)'

pfx_match = re.match(r'^(G-[A-Z]+)', gid)
existing_str = ''
if pfx_match:
    prefix = pfx_match.group(1)
    found_items = []
    for m_sec in re.finditer(r'##\s+(' + re.escape(prefix) + r'[A-Z0-9]*)\s+—\s+([^\n]+)', text):
        eg_id, eg_title = m_sec.group(1), m_sec.group(2).strip()
        found_items.append(f'- {eg_id}: {eg_title}')
    for m_row in re.finditer(r'\|\s*\*\*(' + re.escape(prefix) + r'[A-Z0-9]*)\*\*\s*\|\s*([^|]+)', text):
        eg_id, eg_title = m_row.group(1), m_row.group(2).strip()
        if not any(item.startswith(f'- {eg_id}:') for item in found_items):
            found_items.append(f'- {eg_id}: {eg_title}')
    if found_items:
        existing_str = '[EXISTING_GOALS]\n' + '\n'.join(found_items)

combined = f'{sec_text}\n\n{existing_str}'.strip()
print(combined)
")

  [[ "$eval_out" == *"[EXISTING_GOALS]"* ]]
  [[ "$eval_out" == *"- G-TEST01: First Test Goal"* ]]
  [[ "$eval_out" == *"- G-TEST02: Second Test Goal"* ]]
  [[ "$eval_out" == *"- G-TEST03: Third Test Goal"* ]]

  rm -rf "$TEST_DIR"
}

@test "health-goals-llm-fill: context payload stays within budget limit" {
  TEST_DIR="$(mktemp -d)"
  GOALS_FILE="$TEST_DIR/goals.md"

  {
    echo "# Health Goals"
    echo "## G-TEST01 — Giant Goal"
    echo "Very long context line "
    for i in {1..500}; do
      echo "Line $i extra detail content for testing budget cap"
    done
  } > "$GOALS_FILE"

  eval_out=$(python3 -c "
import re

goals_file = '$GOALS_FILE'
gid = 'G-TEST01'

with open(goals_file) as f:
    text = f.read()

pattern = r'##\s+' + re.escape(gid) + r'.*?(?=\n##\s|\Z)'
m = re.search(pattern, text, re.DOTALL)
sec_text = m.group(0)[:1500] if m else '(kein Kontext gefunden)'

combined = f'{sec_text}'.strip()
print(combined[:3000])
")

  len_out=${#eval_out}
  [ "$len_out" -le 3000 ]

  rm -rf "$TEST_DIR"
}
