#!/usr/bin/env bats
# tests/spec/unsloth-training-env/template-guard.bats — scripts/finetune/template_guard.py [T002587]
#
# Pruefmodus: command output verification (T002448-M4).
#
# Referenz ist im echten Betrieb das HUB-Template (vom Hugging Face Hub geladen), nicht das
# vom Trainings-Framework in ein Adapterverzeichnis geschriebene Template — die unterschieden
# sich im Vorversuch um ueber 1000 Zeichen. Fuer den Test wird "--hub-template" per Datei
# gesetzt (kein Netzwerkzugriff noetig); die Rolle der Datei bleibt dieselbe.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/finetune/template_guard.py"
  WORKDIR="${BATS_TEST_TMPDIR}"
  CORPUS="$WORKDIR/mini_corpus.jsonl"

  cat > "$CORPUS" <<'EOF'
{"messages": [{"role": "user", "content": "Hallo"}, {"role": "assistant", "content": "Hi"}]}
EOF

  cat > "$WORKDIR/hub.jinja" <<'EOF'
{%- for message in messages -%}
<start_of_turn>{{ message['role'] }}
{{ message['content'] }}<end_of_turn>
{% endfor -%}
{%- if add_generation_prompt -%}
<start_of_turn>model
{%- endif -%}
EOF
}

@test "template-guard: identische Templates ergeben Exit null" {
  cp "$WORKDIR/hub.jinja" "$WORKDIR/patched_same.jinja"
  run python3 "$SCRIPT" --hub-template "$WORKDIR/hub.jinja" --patched-template "$WORKDIR/patched_same.jinja" --corpus "$CORPUS"
  [ "$status" -eq 0 ]
}

@test "template-guard: ein um genau ein Zeichen veraendertes Template ergibt Exit ungleich null und nennt die Position" {
  # Positiv-Anker zuerst (siehe Test oben): identische Templates sind grundsaetzlich grün.
  cp "$WORKDIR/hub.jinja" "$WORKDIR/patched_same.jinja"
  run python3 "$SCRIPT" --hub-template "$WORKDIR/hub.jinja" --patched-template "$WORKDIR/patched_same.jinja" --corpus "$CORPUS"
  [ "$status" -eq 0 ]

  # Negativ-Aussage: eine einzelne Byte-Abweichung im Template selbst (ein zusaetzliches
  # Leerzeichen vor der Rollenkennung) muss auffallen.
  sed 's/<start_of_turn>{{ message/<start_of_turn> {{ message/' "$WORKDIR/hub.jinja" > "$WORKDIR/patched_diff.jinja"
  run python3 "$SCRIPT" --hub-template "$WORKDIR/hub.jinja" --patched-template "$WORKDIR/patched_diff.jinja" --corpus "$CORPUS"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Position"* ]]
}
