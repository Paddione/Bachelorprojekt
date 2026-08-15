#!/usr/bin/env bats
# tests/spec/unsloth-training-env/factory-traces.bats — scripts/finetune/collect_factory_traces.py [T002587]
#
# Pruefmodus: command output verification (T002448-M4). Der Kollektor liest im echten
# Betrieb tickets.factory_phase_events per MCP-Pfad (siehe
# .claude/skills/references/mcp-tool-guide.md); fuer den Test liefert --fixture bereits
# abgerufene Zeilen, damit kein Live-Cluster/DB-Zugriff noetig ist (dieselbe Fixture-Form
# dokumentiert die erwartete Zeilenstruktur fuer den echten DB-Pfad).
#
# State-Werte im Fixture folgen der Aufnahme-Mechanik (record_phase_event: entered|done|blocked,
# vgl. software-factory REQ-SF-EXECUTOR-002). Erfolgssignal ist ein verify/done-Event
# (Messung 2026-08-15: 408x done, 266x entered, 0x pass); verify/entered gilt als
# nicht abgeschlossen (T006282).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/finetune/collect_factory_traces.py"
  WORKDIR="${BATS_TEST_TMPDIR}"
  FIXTURE="$WORKDIR/fixture.json"
  OUT="$WORKDIR/traces.jsonl"

  cat > "$FIXTURE" <<'JSON'
[
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "phase": "implement", "state": "done", "detail": "wrote scripts/foo.sh", "at": "2026-01-01T10:00:00Z"},
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "phase": "verify", "state": "done", "detail": "tests green, token ghp_abcdefghijklmnopqrstuvwxyz012345", "at": "2026-01-01T10:05:00Z"},
  {"ticket_id": 2, "external_id": "T009002", "title": "Nicht abgeschlossener Lauf", "phase": "implement", "state": "done", "detail": "wrote scripts/bar.sh", "at": "2026-01-02T10:00:00Z"},
  {"ticket_id": 2, "external_id": "T009002", "title": "Nicht abgeschlossener Lauf", "phase": "verify", "state": "entered", "detail": "verify nie abgeschlossen", "at": "2026-01-02T10:05:00Z"}
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

  # Negativ-Aussage: der nicht abgeschlossene Lauf ist NICHT enthalten.
  run grep -c "Nicht abgeschlossener Lauf" "$OUT"
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

@test "factory-traces: --with-context ergaenzt Kontext-Turns mit E7-Rollen" {
  cat > "$WORKDIR/fixture-ctx.json" <<'JSON'
[
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "description": "Beschreibung: Ticket-Kontext fuer das Training", "phase": "implement", "state": "done", "detail": "wrote scripts/foo.sh", "at": "2026-01-01T10:00:00Z"},
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "description": "Beschreibung: Ticket-Kontext fuer das Training", "phase": "verify", "state": "done", "detail": "tests green", "at": "2026-01-01T10:05:00Z"}
]
JSON
  cat > "$WORKDIR/fixture-ctx-comments.json" <<'JSON'
[
  {"ticket_id": 1, "author": "factory", "body": "Entscheidung: LoRA-Rank 16", "created_at": "2026-01-01T11:00:00Z"},
  {"ticket_id": 1, "author": "claude-code", "body": "Befund: Template byte-identisch", "created_at": "2026-01-01T11:05:00Z"},
  {"ticket_id": 1, "author": "patrick", "body": "Freigabe erteilt", "created_at": "2026-01-01T11:10:00Z"}
]
JSON

  # Positiv-Anker (Default unveraendert): derselbe Datensatz ohne Flag liefert den Lauf.
  run python3 "$SCRIPT" --fixture "$WORKDIR/fixture-ctx.json" --out "$OUT"
  [ "$status" -eq 0 ]
  run grep -c "Erfolgreicher Lauf" "$OUT"
  [ "$output" -eq 1 ]
  # Negativ-Aussage: ohne Flag erscheint kein Kontext-Inhalt (Flag steuert, nicht die Daten).
  run grep -c "Entscheidung: LoRA-Rank 16" "$OUT"
  [ "$output" -eq 0 ]

  # Mit Flag: Kontext-Turns kommen hinzu (Positiv-Anker zuerst). Kommentarzeilen
  # kommen als eigene Datei via --comments-json (p1-Schnittstelle, Design Schritt 2:
  # zwei SQL-Aufrufe -> zwei Dateien; --with-context ohne --comments-json ist fail-fast).
  run python3 "$SCRIPT" --fixture "$WORKDIR/fixture-ctx.json" --comments-json "$WORKDIR/fixture-ctx-comments.json" --with-context --out "$OUT"
  [ "$status" -eq 0 ]
  run grep -c "Entscheidung: LoRA-Rank 16" "$OUT"
  [ "$output" -eq 1 ]
  run grep -c "Beschreibung: Ticket-Kontext" "$OUT"
  [ "$output" -eq 1 ]

  # E7-Rollen-Mapping (semantische Pruefung ueber das gerenderte Chat-Format).
  cat > "$WORKDIR/assert_roles.py" <<'PY'
import json, sys

with open(sys.argv[1]) as fh:
    convo = json.loads(fh.readline())
turns = [(m["role"], m["content"]) for m in convo["messages"]]
assistant = [c for r, c in turns if r == "assistant"]
user = [c for r, c in turns if r == "user"]
assert any("Entscheidung: LoRA-Rank 16" in c for c in assistant), "factory-Kommentar muss assistant-Turn sein"
assert any("Befund: Template byte-identisch" in c for c in assistant), "claude-code-Kommentar muss assistant-Turn sein"
assert any("Freigabe erteilt" in c for c in user), "Fremdautor-Kommentar muss user-Turn sein"
PY
  run python3 "$WORKDIR/assert_roles.py" "$OUT"
  [ "$status" -eq 0 ]
}

@test "factory-traces: --with-context redigiert Secrets auch im Kommentar-Body" {
  cat > "$WORKDIR/fixture-ctx-secret.json" <<'JSON'
[
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "phase": "implement", "state": "done", "detail": "wrote scripts/foo.sh", "at": "2026-01-01T10:00:00Z"},
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "phase": "verify", "state": "done", "detail": "tests green", "at": "2026-01-01T10:05:00Z"}
]
JSON
  cat > "$WORKDIR/fixture-ctx-secret-comments.json" <<'JSON'
[
  {"ticket_id": 1, "author": "factory", "body": "Deploy-Token: ghp_abcdefghijklmnopqrstuvwxyz012345", "created_at": "2026-01-01T11:00:00Z"}
]
JSON

  run python3 "$SCRIPT" --fixture "$WORKDIR/fixture-ctx-secret.json" --comments-json "$WORKDIR/fixture-ctx-secret-comments.json" --with-context --out "$OUT"
  [ "$status" -eq 0 ]

  # Positiv-Anker zuerst: der Kommentar ist im Korpus (sonst waere die Negativ-Aussage vakuos).
  # Anker ist "Deploy", nicht "Deploy-Token": der Redaktions-Label-Pattern
  # (?i)(…|token|…)\s*[:=]\s*\S+ frisst "Token: ghp_…" -> "Deploy-[REDACTED]".
  run grep -F -c "Deploy" "$OUT"
  [ "$output" -eq 1 ]

  # Negativ-Aussage: das Secret-Muster erscheint nicht im Klartext.
  run grep -F -c "ghp_abcdefghijklmnopqrstuvwxyz012345" "$OUT"
  [ "$output" -eq 0 ]

  # Redaktion ist nachweislich aktiv.
  run grep -F -c "[REDACTED]" "$OUT"
  [ "$output" -ge 1 ]
}
