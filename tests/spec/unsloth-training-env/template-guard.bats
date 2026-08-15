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

@test "template-guard: generation-Marker-Template ist byte-identisch und warnt nicht" {
  # Der `{% generation %}`-Tag (transformers-AssistantTracker-Semantik) muss als
  # Pass-through geparst werden koennen — ohne die Extension bricht der Guard beim
  # Rendern des gepatchten Templates ab, statt zu vergleichen (Falle 1/2 im Docstring).
  # Konforme Form: Header AUSSERHALB des Blocks, Marker mit Whitespace-Kontrolle.
  cat > "$WORKDIR/hub_gen.jinja" <<'EOF'
{%- for message in messages -%}
{%- if message['role'] == 'user' -%}
{{- '<start_of_turn>user\n' + message['content'] + '<end_of_turn>\n' -}}
{%- elif message['role'] == 'assistant' -%}
{{- '<start_of_turn>model\n' + message['content'] + '<end_of_turn>\n' -}}
{%- endif -%}
{%- endfor -%}
EOF
  cat > "$WORKDIR/patched_gen.jinja" <<'EOF'
{%- for message in messages -%}
{%- if message['role'] == 'user' -%}
{{- '<start_of_turn>user\n' + message['content'] + '<end_of_turn>\n' -}}
{%- elif message['role'] == 'assistant' -%}
{{- '<start_of_turn>model\n' -}}
{%- generation -%}
{{- message['content'] -}}
{%- endgeneration -%}
{{- '<end_of_turn>\n' -}}
{%- endif -%}
{%- endfor -%}
EOF

  # Positiv-Anker: Marker-Template rendert byte-identisch -> Exit null.
  run python3 "$SCRIPT" --hub-template "$WORKDIR/hub_gen.jinja" --patched-template "$WORKDIR/patched_gen.jinja" --corpus "$CORPUS"
  [ "$status" -eq 0 ]

  # Negativ-Aussage: die konforme Markerform loest die Falle-2-Warnung NICHT aus.
  [[ "$output" != *"WARNUNG"* ]]
}

@test "template-guard: generation-Marker ohne Whitespace-Kontrolle loest die Falle-2-Warnung aus" {
  # Positiv-Anker zuerst (siehe Test zuvor): die konforme Form warnt nicht.
  cat > "$WORKDIR/hub_gen.jinja" <<'EOF'
{%- for message in messages -%}
{%- if message['role'] == 'user' -%}
{{- '<start_of_turn>user\n' + message['content'] + '<end_of_turn>\n' -}}
{%- elif message['role'] == 'assistant' -%}
{{- '<start_of_turn>model\n' + message['content'] + '<end_of_turn>\n' -}}
{%- endif -%}
{%- endfor -%}
EOF
  cat > "$WORKDIR/patched_gen.jinja" <<'EOF'
{%- for message in messages -%}
{%- if message['role'] == 'user' -%}
{{- '<start_of_turn>user\n' + message['content'] + '<end_of_turn>\n' -}}
{%- elif message['role'] == 'assistant' -%}
{{- '<start_of_turn>model\n' -}}
{%- generation -%}
{{- message['content'] -}}
{%- endgeneration -%}
{{- '<end_of_turn>\n' -}}
{%- endif -%}
{%- endfor -%}
EOF
  run python3 "$SCRIPT" --hub-template "$WORKDIR/hub_gen.jinja" --patched-template "$WORKDIR/patched_gen.jinja" --corpus "$CORPUS"
  [ "$status" -eq 0 ]
  [[ "$output" != *"WARNUNG"* ]]

  # Negativ-Aussage: `{% generation %}` ohne `{%-` wird statisch angemahnt
  # (Falle 2: Whitespace-Kontrolle; der Marker selbst ist byte-erhaltend, die Warnung
  # ist die durchsetzbare Oberflaeche — Exit bleibt 0 bei identischen Bytes).
  cat > "$WORKDIR/patched_lint.jinja" <<'EOF'
{%- for message in messages -%}
{%- if message['role'] == 'user' -%}
{{- '<start_of_turn>user\n' + message['content'] + '<end_of_turn>\n' -}}
{%- elif message['role'] == 'assistant' -%}
{{- '<start_of_turn>model\n' -}}
{% generation %}
{{- message['content'] -}}
{% endgeneration %}
{{- '<end_of_turn>\n' -}}
{%- endif -%}
{%- endfor -%}
EOF
  run python3 "$SCRIPT" --hub-template "$WORKDIR/hub_gen.jinja" --patched-template "$WORKDIR/patched_lint.jinja" --corpus "$CORPUS"
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARNUNG"* ]]
}
