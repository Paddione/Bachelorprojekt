#!/usr/bin/env bats
# tests/spec/unsloth-training-env/factory-traces.bats — scripts/finetune/collect_factory_traces.py [T002587]
#
# Pruefmodus: command output verification (T002448-M4). Der Kollektor liest im echten
# Betrieb tickets.factory_phase_events per MCP-Pfad (siehe
# .claude/skills/references/mcp-tool-guide.md); fuer den Test liefert --fixture bereits
# abgerufene Zeilen, damit kein Live-Cluster/DB-Zugriff noetig ist (dieselbe Fixture-Form
# dokumentiert die erwartete Zeilenstruktur fuer den echten DB-Pfad).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/finetune/collect_factory_traces.py"
  WORKDIR="${BATS_TEST_TMPDIR}"
  FIXTURE="$WORKDIR/fixture.json"
  OUT="$WORKDIR/traces.jsonl"

  cat > "$FIXTURE" <<'JSON'
[
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "phase": "implement", "state": "done", "detail": "wrote scripts/foo.sh", "at": "2026-01-01T10:00:00Z"},
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "phase": "verify", "state": "pass", "detail": "tests green, token ghp_abcdefghijklmnopqrstuvwxyz012345", "at": "2026-01-01T10:05:00Z"},
  {"ticket_id": 2, "external_id": "T009002", "title": "Gescheiterter Lauf", "phase": "implement", "state": "done", "detail": "wrote scripts/bar.sh", "at": "2026-01-02T10:00:00Z"},
  {"ticket_id": 2, "external_id": "T009002", "title": "Gescheiterter Lauf", "phase": "verify", "state": "fail", "detail": "tests red", "at": "2026-01-02T10:05:00Z"}
]
JSON
}

@test "factory-traces: liefert genau den erfolgreichen Lauf" {
  run python3 "$SCRIPT" --fixture "$FIXTURE" --out "$OUT"
  [ "$status" -eq 0 ]
  [ -f "$OUT" ]

  # Positiv-Anker zuerst: der erfolgreiche Lauf ist im Korpus.
  run grep -c "Erfolgreicher Lauf" "$OUT"
  [ "$output" -eq 1 ]

  # Negativ-Aussage: der gescheiterte Lauf ist NICHT enthalten.
  run grep -c "Gescheiterter Lauf" "$OUT"
  [ "$output" -eq 0 ]
}

@test "factory-traces: Ausgabe enthaelt keine Secret-Muster" {
  # Positiv-Anker zuerst: die Ausgabedatei enthaelt ueberhaupt Inhalt.
  run python3 "$SCRIPT" --fixture "$FIXTURE" --out "$OUT"
  [ "$status" -eq 0 ]
  run grep -c "tests green" "$OUT"
  [ "$output" -eq 1 ]

  # Negativ-Aussage: das GitHub-Token-Muster aus dem Fixture-Detail darf nicht durchsickern.
  run grep -c "ghp_abcdefghijklmnopqrstuvwxyz012345" "$OUT"
  [ "$output" -eq 0 ]
}

@test "factory-traces: Ausgabeformat ist mit measure_corpus.py kompatibel" {
  run python3 "$SCRIPT" --fixture "$FIXTURE" --out "$OUT"
  [ "$status" -eq 0 ]

  cat > "$WORKDIR/template.jinja" <<'TPL'
{%- for message in messages -%}
<start_of_turn>{{ message['role'] }}
{{ message['content'] }}<end_of_turn>
{% endfor -%}
TPL
  run python3 "$REPO_ROOT/scripts/finetune/measure_corpus.py" --corpus "$OUT" --model demo --template-file "$WORKDIR/template.jinja" --out "$WORKDIR/report.json"
  [ "$status" -eq 0 ]
}
