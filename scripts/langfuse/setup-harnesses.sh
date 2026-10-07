#!/usr/bin/env bash
# Configure installed agent harnesses for the local Langfuse project.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dry=false
[[ "${1:-}" == "--dry-run" ]] && dry=true
env_file="${XDG_CONFIG_HOME:-$HOME/.config}/langfuse/agent-tracing.env"
if ! $dry; then
  [[ -r "$env_file" ]] || { echo "Missing $env_file; run task devmesh:langfuse:setup" >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$env_file"
  : "${LANGFUSE_PUBLIC_KEY:?}" "${LANGFUSE_SECRET_KEY:?}" "${LANGFUSE_BASE_URL:?}"
fi
user_id="$(git -C "$root" config user.email 2>/dev/null || true)"
for harness in claude opencode omp codex; do
  if ! command -v "$harness" >/dev/null 2>&1; then echo "skip $harness: not installed"; continue; fi
  if $dry; then echo "$harness: configure Langfuse observability"; continue; fi
  case "$harness" in
    claude)
      claude plugin marketplace add langfuse/claude-observability-plugin@v1.2.0 >/dev/null
      claude plugin install langfuse-observability@langfuse-observability \
        --config "LANGFUSE_PUBLIC_KEY=$LANGFUSE_PUBLIC_KEY" \
        --config "LANGFUSE_SECRET_KEY=$LANGFUSE_SECRET_KEY" \
        --config "LANGFUSE_BASE_URL=$LANGFUSE_BASE_URL" >/dev/null
      ;;
    opencode)
      config="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode.json"
      mkdir -p "$(dirname "$config")"; [[ -f "$config" ]] || printf '{}\n' > "$config"
      jq --arg plugin '@langfuse/opencode-observability-plugin@0.5.1' '.plugins = (((.plugins // []) - [$plugin]) + [$plugin])' "$config" > "$config.tmp"; mv "$config.tmp" "$config"
      chmod 600 "$config"
      config="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode-langfuse.json"; mkdir -p "$(dirname "$config")"; umask 077
      jq -n --arg p "$LANGFUSE_PUBLIC_KEY" --arg s "$LANGFUSE_SECRET_KEY" --arg b "$LANGFUSE_BASE_URL" --arg u "$user_id" '{publicKey:$p,secretKey:$s,baseUrl:$b,environment:"development",userId:$u}' > "$config"; chmod 600 "$config" ;;
    omp)
      # omp ist pi-Linie (T900793): dasselbe Observability-Plugin, Agent-Home ~/.omp.
      omp install npm:@langfuse/pi-observability-plugin@0.1.2
      omp list 2>/dev/null | grep -q '@langfuse/pi-observability-plugin' \
        || { echo "omp: @langfuse/pi-observability-plugin missing after omp install" >&2; exit 1; }
      config="$HOME/.omp/agent/langfuse.json"; mkdir -p "$(dirname "$config")"; umask 077
      jq -n --arg p "$LANGFUSE_PUBLIC_KEY" --arg s "$LANGFUSE_SECRET_KEY" --arg b "$LANGFUSE_BASE_URL" --arg u "$user_id" '{publicKey:$p,secretKey:$s,baseUrl:$b,userId:$u}' > "$config"; chmod 600 "$config" ;;
    codex)
      codex plugin marketplace add langfuse/codex-observability-plugin --ref v0.4.0 >/dev/null
      config="$HOME/.codex/config.toml"; mkdir -p "$(dirname "$config")"; touch "$config"
      if ! grep -q '^\[features\]' "$config"; then
        printf '\n[features]\nhooks = true\n' >> "$config"
      else
        # Existing [features]: put hooks = true directly under the header, drop any other hooks line.
        awk '/^\[/ { sec = ($0 == "[features]"); print; if (sec) print "hooks = true"; next }
             sec && /^hooks[[:space:]]*=/ { next } { print }' "$config" > "$config.tmp"; mv "$config.tmp" "$config"
      fi
      grep -q '^\[plugins."tracing@codex-observability-plugin"\]' "$config" || printf '\n[plugins."tracing@codex-observability-plugin"]\nenabled = true\n' >> "$config"
      # Enable and trust the plugin's Stop hook; codex skips it without this entry. The hash belongs
      # to the pinned v0.4.0 only, so a plugin update makes codex ask for review again.
      hook='[hooks.state."tracing@codex-observability-plugin:hooks/hooks.json:stop:0:0"]'
      hook_hash='sha256:69a05cbfa6984ec5f1433343b45480d5239c119e7332ae863f9865edc2efec74'
      awk -v h="$hook" '/^\[/ { skip = ($0 == h) } !skip { l[++n] = $0 }
        END { while (n > 0 && l[n] == "") n--; for (i = 1; i <= n; i++) print l[i] }' "$config" > "$config.tmp"; mv "$config.tmp" "$config"
      printf '\n%s\nenabled = true\ntrusted_hash = "%s"\n' "$hook" "$hook_hash" >> "$config"
      config="$HOME/.codex/langfuse.json"; umask 077
      jq -n --arg p "$LANGFUSE_PUBLIC_KEY" --arg s "$LANGFUSE_SECRET_KEY" --arg b "$LANGFUSE_BASE_URL" --arg u "$user_id" '{enabled:true,public_key:$p,secret_key:$s,base_url:$b,userId:$u}' > "$config"; chmod 600 "$config" ;;
  esac
  echo "$harness: configured"
done
