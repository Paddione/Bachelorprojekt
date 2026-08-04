#!/usr/bin/env bats
# tests/spec/unsloth-training-env/measure-corpus.bats — scripts/finetune/measure_corpus.py [T002587]
#
# Pruefmodus: command output verification (T002448-M4). Die Tests fuehren das Skript AUS
# und pruefen $status/$output/den geschriebenen JSON-Bericht; sie greppen nicht den
# Quelltext.
#
# Kein GPU/transformers in dieser Umgebung: das Skript faellt ohne `transformers` auf eine
# heuristische Laengenschaetzung zurueck (dokumentierte Abweichung, siehe measure_corpus.py
# Docstring) — der Vertrag hier ist die JSON-Form und die Vorbedingungspruefung, nicht die
# exakte Tokenzahl.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/finetune/measure_corpus.py"
  WORKDIR="${BATS_TEST_TMPDIR}"
  CORPUS="$WORKDIR/mini_corpus.jsonl"
  TEMPLATE="$WORKDIR/template.jinja"
  OUT="$WORKDIR/report.json"

  cat > "$CORPUS" <<'EOF'
{"messages": [{"role": "user", "content": "Wie deploye ich die Website?"}, {"role": "assistant", "content": "Nutze task workspace:deploy ENV=mentolder."}]}
{"messages": [{"role": "user", "content": "Was ist ein SealedSecret?"}, {"role": "assistant", "content": "Ein verschluesseltes Kubernetes-Secret, das im Repo committet werden darf."}]}
{"messages": [{"role": "user", "content": "Erklaere Flux."}, {"role": "assistant", "content": "Flux reconciled das Cluster pull-based gegen ein OCI-Artefakt aus main."}]}
EOF

  cat > "$TEMPLATE" <<'EOF'
{%- for message in messages -%}
<start_of_turn>{{ message['role'] }}
{{ message['content'] }}<end_of_turn>
{% endfor -%}
{%- if add_generation_prompt -%}
<start_of_turn>model
{%- endif -%}
EOF
}

@test "measure-corpus: Messlauf gegen Mini-Korpus liefert JSON mit allen Perzentilen" {
  run python3 "$SCRIPT" --corpus "$CORPUS" --model demo-model --template-file "$TEMPLATE" --out "$OUT"
  [ "$status" -eq 0 ]
  [ -f "$OUT" ]

  run python3 -c "
import json
d = json.load(open('$OUT'))
for k in ('median', 'p90', 'p95', 'p99', 'max'):
    assert k in d['lengths'], k
assert isinstance(d['candidates'], list) and len(d['candidates']) > 0
assert 'feasibility' in d
print('ok')
"
  [ "$status" -eq 0 ]
  [[ "$output" == "ok" ]]
}

@test "measure-corpus: Trainingsstart ohne Messbericht bricht mit Exit ungleich null ab" {
  # Positiv-Anker zuerst: ein vorhandener Bericht laesst die Vorbedingungspruefung durchlaufen.
  run python3 "$SCRIPT" --corpus "$CORPUS" --model demo-model --template-file "$TEMPLATE" --out "$OUT"
  [ "$status" -eq 0 ]
  run python3 "$SCRIPT" --check-report "$OUT"
  [ "$status" -eq 0 ]

  # Negativ-Aussage: ein fehlender Bericht meldet Exit ungleich null.
  run python3 "$SCRIPT" --check-report "$WORKDIR/does-not-exist.json"
  [ "$status" -ne 0 ]
}
