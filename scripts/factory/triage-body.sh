#!/usr/bin/env bash
# scripts/factory/triage-body.sh — Request-Body fuer die KI-Triage [T002501]
#
# Bewusst eine eigene, SOURCEBARE Datei ohne Seiteneffekte: auto-triage.sh hat
# keinen Sourcing-Guard. Argument-Parsing und die BRAND-Pflicht laufen dort beim
# Sourcen sofort los, danach folgt der DB-Zugriff — die Funktion waere aus einem
# Offline-Test nicht erreichbar. Hier gibt es nur die Definition.

# _is_local_llm_url <base_url>
# Wahr, wenn die URL auf diesen Host zeigt. Das ist das richtige Kriterium fuer
# das Thinking-Gate: nicht der Modellname entscheidet, sondern ob lokal serviert
# wird. Jedes lokal servierte hybride Reasoning-Modell verbrennt max_tokens im
# reasoning_content, bevor content beginnt — Gemma 4 genauso wie Qwen3. Und
# umgekehrt ist chat_template_kwargs bei remote APIs ein UNBEKANNTES Feld, das
# abgelehnt werden kann; es dort mitzuschicken waere ein neuer Fehler.
_is_local_llm_url() {
  case "${1:-}" in
    http://127.0.0.1[:/]*|http://127.0.0.1|\
    http://localhost[:/]*|http://localhost|\
    http://0.0.0.0[:/]*|http://0.0.0.0|\
    http://\[::1\][:/]*) return 0 ;;
    *) return 1 ;;
  esac
}

# _build_triage_body <model> <base_url> <system> <user> <schema_json>
_build_triage_body() {
  local model="$1" base_url="$2" system_prompt="$3" user_prompt="$4" schema="$5"
  local thinking_off=false
  _is_local_llm_url "$base_url" && thinking_off=true

  # response_format json_schema (nicht json_object): llama.cpp und LM Studio
  # constrainen damit schon beim Sampling auf die enum-gueltigen Werte, statt
  # erst hinterher in validate_triage() zu pruefen.
  jq -n \
    --arg model "$model" \
    --arg sys "$system_prompt" \
    --arg user "$user_prompt" \
    --argjson schema "$schema" \
    --argjson thinking_off "$thinking_off" \
    '{
      model: $model,
      messages: [
        {role: "system", content: $sys},
        {role: "user", content: $user}
      ],
      temperature: 0.2,
      max_tokens: 512,
      response_format: {type: "json_schema", json_schema: $schema}
    }
    + (if $thinking_off then {chat_template_kwargs: {enable_thinking: false}} else {} end)'
}
