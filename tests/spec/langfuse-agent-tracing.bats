#!/usr/bin/env bats

# tests/spec/langfuse-agent-tracing.bats
# T900688: self-hosted Langfuse auf devmesh + Tracing der Agent-Harnesses.
# PRUEFMODUS: Output-Verifikation [T002448-M4] — render-stack.sh und die
# scripts/langfuse/*-Skripte AUSFUEHREN und ihre Ausgabe pruefen. Kein Cluster noetig.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  RENDERED="$BATS_FILE_TMPDIR/rendered.yaml"
  if [[ ! -s "$RENDERED" ]]; then
    bash "$REPO/scripts/devmesh/render-stack.sh" core > "$RENDERED" 2>/dev/null \
      || skip "render-stack.sh Vorbedingung fehlt (kubectl/yq/envsubst/Inventar)"
  fi
}

_objects() {
  yq ea -r 'select(.metadata.name | test("^langfuse")) | .kind + "/" + .metadata.name' "$RENDERED"
}

@test "T900688: render-stack core rendert alle Langfuse-Workloads" {
  run _objects
  [ "$status" -eq 0 ]
  for obj in Deployment/langfuse-web Deployment/langfuse-worker StatefulSet/langfuse-clickhouse \
             Deployment/langfuse-valkey StatefulSet/langfuse-minio Job/langfuse-db-init \
             Deployment/langfuse-otel-redact; do
    [[ "$output" == *"$obj"* ]] || { echo "fehlt: $obj"; return 1; }
  done
}

@test "T900688: Ingress routet /api/public/otel auf den Redact-Collector, / auf langfuse-web" {
  run yq ea -r 'select(.kind == "Ingress") | .spec.rules[] | select(.host | test("^langfuse-dev\.")) | .http.paths[] | .path + " " + .backend.service.name' "$RENDERED"
  [ "$status" -eq 0 ]
  [[ "$output" == *"/api/public/otel langfuse-otel-redact"* ]]
  [[ "$output" == *"/ langfuse-web"* ]]
}

@test "T900688: Collector-Config maskiert jeden Secret-Typ aus design.md" {
  run yq ea -r 'select(.kind == "ConfigMap" and .metadata.name == "langfuse-otel-redact-config") | .data."config.yaml"' "$RENDERED"
  [ "$status" -eq 0 ]
  [[ "$output" == *"traces_url_path: /api/public/otel/v1/traces"* ]]
  [[ "$output" == *"context: spanevent"* ]]
  [[ "$output" == *'$$1$$2[REDACTED:kv-secret]'* ]]
  for typ in langfuse anthropic-openai github gitlab aws private-key bearer kv-secret; do
    [[ "$output" == *"[REDACTED:$typ]"* ]] || { echo "fehlt: $typ"; return 1; }
  done
}

@test "T900688: kein gerendertes Objekt enthaelt Langfuse-Key-Literale" {
  run grep -cE '(pk|sk)-lf-[A-Za-z0-9]' "$RENDERED"
  [ "$output" = "0" ]
}

@test "T900688: Langfuse-Images sind gepinnt" {
  run yq ea -r 'select(.metadata.name == "langfuse-web" or .metadata.name == "langfuse-worker") | select(.kind == "Deployment") | .spec.template.spec.containers[].image' "$RENDERED"
  [ "$status" -eq 0 ]
  [[ "$output" != *":latest"* ]]
  [ "$(grep -c ':4\.46\.0$' <<<"$output")" -eq 2 ]
}

_stub_bin() {
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  for b in claude opencode omp codex; do
    printf '#!/bin/sh\nexit 0\n' > "$BATS_TEST_TMPDIR/bin/$b"; chmod +x "$BATS_TEST_TMPDIR/bin/$b"
  done
}

@test "T900688: setup-harnesses --dry-run plant alle vier Harnesses und schreibt nichts" {
  _stub_bin
  mkdir -p "$BATS_TEST_TMPDIR/home"
  run env HOME="$BATS_TEST_TMPDIR/home" PATH="$BATS_TEST_TMPDIR/bin:/usr/bin:/bin" \
    bash "$REPO/scripts/langfuse/setup-harnesses.sh" --dry-run
  [ "$status" -eq 0 ]
  for h in claude opencode omp codex; do
    grep -q "^$h: " <<<"$output" || { echo "fehlt: $h"; return 1; }
  done
  [ -z "$(find "$BATS_TEST_TMPDIR/home" -type f)" ]
}

@test "T900688: setup-harnesses --dry-run ohne Harnesses meldet skip fuer alle vier" {
  mkdir -p "$BATS_TEST_TMPDIR/home" "$BATS_TEST_TMPDIR/empty"
  run env HOME="$BATS_TEST_TMPDIR/home" PATH="$BATS_TEST_TMPDIR/empty:/usr/bin:/bin" \
    bash "$REPO/scripts/langfuse/setup-harnesses.sh" --dry-run
  [ "$status" -eq 0 ]
  [ "$(grep -c 'not installed$' <<<"$output")" -eq 4 ]
}

@test "T900688: client-env.sh ohne devmesh-Context endet mit Exit 2" {
  run env KUBECONFIG=/dev/null bash "$REPO/scripts/langfuse/client-env.sh"
  [ "$status" -eq 2 ]
}

# T900690: Setup gegen echte Vorzustaende — nur die jeweils gestubbte Harness liegt im PATH.
_setup_env() {
  mkdir -p "$BATS_TEST_TMPDIR/home" "$BATS_TEST_TMPDIR/xdg/langfuse" "$BATS_TEST_TMPDIR/bin"
  printf 'LANGFUSE_PUBLIC_KEY=pk-test\nLANGFUSE_SECRET_KEY=sk-test\nLANGFUSE_BASE_URL=https://langfuse.example.test\n' \
    > "$BATS_TEST_TMPDIR/xdg/langfuse/agent-tracing.env"
}

_run_setup() {
  run env HOME="$BATS_TEST_TMPDIR/home" XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/xdg" \
    PATH="$BATS_TEST_TMPDIR/bin:/usr/bin:/bin" bash "$REPO/scripts/langfuse/setup-harnesses.sh"
}

@test "T900690: codex bekommt hooks = true auch bei bestehender [features]-Sektion" {
  _setup_env
  printf '#!/bin/sh\nexit 0\n' > "$BATS_TEST_TMPDIR/bin/codex"; chmod +x "$BATS_TEST_TMPDIR/bin/codex"
  mkdir -p "$BATS_TEST_TMPDIR/home/.codex"
  printf '[features]\nprevent_idle_sleep = true\n\n[mcp_servers.x]\nurl = "http://localhost"\n' \
    > "$BATS_TEST_TMPDIR/home/.codex/config.toml"
  _run_setup
  [ "$status" -eq 0 ]
  cfg="$BATS_TEST_TMPDIR/home/.codex/config.toml"
  [ "$(grep -c '^\[features\]' "$cfg")" -eq 1 ]
  run awk '/^\[/{s=$0} s=="[features]" && /^hooks *= *true/' "$cfg"
  [ -n "$output" ]
}

@test "T900690: omp-Setup scheitert laut, wenn das Plugin nach omp install fehlt" {
  _setup_env
  printf '#!/bin/sh\n[ "$1" = list ] && echo "No packages installed."\nexit 0\n' > "$BATS_TEST_TMPDIR/bin/omp"
  chmod +x "$BATS_TEST_TMPDIR/bin/omp"
  _run_setup
  [ "$status" -ne 0 ]
  [[ "$output" == *"pi-observability-plugin"* ]]
}
# T900691: Langfuse oeffentlich als langfuse-dev.<prod-domain> — fleet terminiert TLS mit dem
# Wildcard und leitet per Tailscale an devmesh-Traefik (web-Entrypoint, Port 80) weiter.
@test "T900691: devmesh-Ingress fuer langfuse-dev lauscht auf dem web-Entrypoint" {
  run yq ea -r 'select(.kind == "Ingress" and (.spec.rules[].host | test("^langfuse-dev\\."))) | .metadata.annotations."traefik.ingress.kubernetes.io/router.entrypoints"' "$RENDERED"
  [ "$status" -eq 0 ]
  [ "$output" = "web" ]
}

@test "T900691: devmesh rendert keinen langfuse.<devmesh-domain>-Host mehr und NEXTAUTH_URL zeigt auf langfuse-dev" {
  run yq ea -r 'select(.kind == "Ingress") | .spec.rules[].host' "$RENDERED"
  [ "$status" -eq 0 ]
  [[ "$output" == *"langfuse-dev."* ]]
  ! grep -q '^langfuse\.' <<<"$output"
  run yq ea -r 'select(.kind == "Deployment" and .metadata.name == "langfuse-web") | .spec.template.spec.containers[].env[] | select(.name == "NEXTAUTH_URL") | .value' "$RENDERED"
  [[ "$output" == https://langfuse-dev.* ]]
}

_render_fleet_proxy() {
  WORKSPACE_NAMESPACE=workspace PROD_DOMAIN=mentolder.example TLS_SECRET_NAME=workspace-wildcard-tls \
    envsubst '$WORKSPACE_NAMESPACE $PROD_DOMAIN $TLS_SECRET_NAME' < "$REPO/prod-fleet/mentolder/langfuse-dev-proxy.yaml"
}

@test "T900691: fleet-Ingress langfuse-dev nutzt das Wildcard-TLS und den Proxy-Service" {
  [ -f "$REPO/prod-fleet/mentolder/langfuse-dev-proxy.yaml" ]
  out="$(_render_fleet_proxy)"
  run yq ea -r 'select(.kind == "Ingress") | .spec.tls[0].secretName + " " + .spec.rules[0].host + " " + .spec.rules[0].http.paths[0].backend.service.name' - <<<"$out"
  [ "$output" = "workspace-wildcard-tls langfuse-dev.mentolder.example langfuse-dev-proxy" ]
}

@test "T900691: EndpointSlice zeigt auf die drei devmesh-Tailscale-Adressen, Port 80" {
  out="$(_render_fleet_proxy)"
  run yq ea -r 'select(.kind == "EndpointSlice") | (.metadata.labels."kubernetes.io/service-name") + " " + (.ports[0].port | tostring) + " " + ([.endpoints[].addresses[0]] | sort | join(","))' - <<<"$out"
  [ "$output" = "langfuse-dev-proxy 80 100.115.236.87,100.120.125.39,100.126.111.105" ]
}

@test "T900691: fleet-Overlay bindet den Langfuse-Proxy ein" {
  run kubectl kustomize "$REPO/prod-fleet/mentolder"
  [ "$status" -eq 0 ]
  [[ "$output" == *"name: langfuse-dev-proxy"* ]]
}

@test "T900692: Collector-Batch behaelt den Authorization-Kontext fuer headers_setter" {
  run yq ea -r 'select(.kind == "ConfigMap" and .metadata.name == "langfuse-otel-redact-config") | .data."config.yaml"' "$RENDERED"
  [ "$status" -eq 0 ]
  run yq -r '.processors.batch.metadata_keys[]' <<<"$output"
  [ "$output" = "authorization" ]
}

@test "T900693: codex-Stop-Hook ist aktiviert und fuer v0.4.0 freigegeben, zweiter Lauf aendert nichts" {
  _setup_env
  printf '#!/bin/sh\nexit 0\n' > "$BATS_TEST_TMPDIR/bin/codex"; chmod +x "$BATS_TEST_TMPDIR/bin/codex"
  mkdir -p "$BATS_TEST_TMPDIR/home/.codex"
  cfg="$BATS_TEST_TMPDIR/home/.codex/config.toml"
  printf '[features]\nhooks = true\n\n[hooks.state."tracing@codex-observability-plugin:hooks/hooks.json:stop:0:0"]\ntrusted_hash = "sha256:alt"\n\n[mcp_servers.x]\nurl = "http://localhost"\n' > "$cfg"
  _run_setup
  [ "$status" -eq 0 ]
  sec='[hooks.state."tracing@codex-observability-plugin:hooks/hooks.json:stop:0:0"]'
  [ "$(grep -cF "$sec" "$cfg")" -eq 1 ]
  run awk -v s="$sec" '/^\[/{in_s=($0==s)} in_s && /^(enabled|trusted_hash)/' "$cfg"
  [[ "$output" == *'enabled = true'* ]]
  [[ "$output" == *'trusted_hash = "sha256:69a05cbfa6984ec5f1433343b45480d5239c119e7332ae863f9865edc2efec74"'* ]]
  grep -q '^\[mcp_servers.x\]' "$cfg"
  before="$(md5sum < "$cfg")"
  _run_setup
  [ "$(md5sum < "$cfg")" = "$before" ]
}

# T900750: Langfuse-Agent-Tracing fertigstellen (design.md D1–D7).
# Pruefmodus wie oben: Befehle AUSFUEHREN und Ausgaben pruefen, kein Cluster, kein Netzwerk.

@test "T900750: ClickHouse-Limit ist 8Gi" {
  run yq ea -r 'select(.kind=="StatefulSet" and .metadata.name=="langfuse-clickhouse") | .spec.template.spec.containers[0].resources.limits.memory' "$RENDERED"
  [ "$status" -eq 0 ]
  [ "$output" = "8Gi" ]
}

@test "T900750: Collector setzt fehlendes Environment auf development" {
  run yq ea -r 'select(.kind == "ConfigMap" and .metadata.name == "langfuse-otel-redact-config") | .data."config.yaml"' "$RENDERED"
  [ "$status" -eq 0 ]
  [[ "$output" == *'set(resource.attributes["langfuse.environment"], "development") where resource.attributes["langfuse.environment"] == nil'* ]]
}

@test "T900750: CronJob langfuse-export mountet das Export-Skript" {
  run yq ea -r 'select(.kind == "CronJob" and .metadata.name == "langfuse-export") | .spec.jobTemplate.spec.template.spec.volumes[0].configMap.name' "$RENDERED"
  [ "$status" -eq 0 ]
  [ "$output" = "langfuse-export-script" ]
  run yq ea -r 'select(.kind == "ConfigMap" and .metadata.name == "langfuse-export-script") | .data | keys | .[]' "$RENDERED"
  [ "$status" -eq 0 ]
  [[ "$output" == *"export_traces.py"* ]]
}

@test "T900750: export_traces.py --print-key" {
  run python3 "$REPO/scripts/langfuse/export_traces.py" --print-key --date 2026-09-27
  [ "$status" -eq 0 ]
  [ "$output" = "exports/observations/2026-09-27.jsonl" ]
}

@test "T900750: export_traces.py ohne Env endet mit 2" {
  run env -i PATH="$PATH" python3 "$REPO/scripts/langfuse/export_traces.py" --date 2026-09-27
  [ "$status" -eq 2 ]
}

_t900750_check_env() {
  mkdir -p "$BATS_TEST_TMPDIR/stubbin" "$BATS_TEST_TMPDIR/xdg" "$BATS_TEST_TMPDIR/cache"
  printf '#!/bin/sh\nexit 0\n' > "$BATS_TEST_TMPDIR/stubbin/opencode"
  chmod +x "$BATS_TEST_TMPDIR/stubbin/opencode"
}

_t900750_write_cache() {
  local tool_traces="$1" gap="$2"
  mkdir -p "$BATS_TEST_TMPDIR/cache/langfuse"
  printf '{"refreshed_at":"%s","tool_traces":%s,"last_claude_trace":null,"export_gap_session":%s}' \
    "$(date -u +%FT%TZ)" "$tool_traces" "$gap" > "$BATS_TEST_TMPDIR/cache/langfuse/tracing-status.json"
  touch "$BATS_TEST_TMPDIR/cache/langfuse/tracing-status.json"
}

@test "T900750: tracing-status check meldet fehlende Harness-Config" {
  _t900750_check_env
  run env HOME="$BATS_TEST_TMPDIR" XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/xdg" XDG_CACHE_HOME="$BATS_TEST_TMPDIR/cache" \
    PATH="$BATS_TEST_TMPDIR/stubbin:/usr/bin:/bin" bash "$REPO/scripts/langfuse/tracing-status.sh" check
  [ "$status" -eq 0 ]
  [[ "$output" == *"opencode tracet nicht"* ]]
}

@test "T900750: Finetune-Erinnerung ab 3000 Tool-Traces" {
  _t900750_check_env
  _t900750_write_cache 3000 null
  run env HOME="$BATS_TEST_TMPDIR" XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/xdg" XDG_CACHE_HOME="$BATS_TEST_TMPDIR/cache" \
    PATH="$BATS_TEST_TMPDIR/stubbin:/usr/bin:/bin" bash "$REPO/scripts/langfuse/tracing-status.sh" check
  [ "$status" -eq 0 ]
  [[ "$output" == *"docs/runbooks/qwen35-mtp-subagent-finetuning.md"* ]]
}

@test "T900750: keine Finetune-Erinnerung bei 2999" {
  _t900750_check_env
  _t900750_write_cache 2999 null
  run env HOME="$BATS_TEST_TMPDIR" XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/xdg" XDG_CACHE_HOME="$BATS_TEST_TMPDIR/cache" \
    PATH="$BATS_TEST_TMPDIR/stubbin:/usr/bin:/bin" bash "$REPO/scripts/langfuse/tracing-status.sh" check
  [ "$status" -eq 0 ]
  [[ "$output" != *"docs/runbooks/qwen35-mtp-subagent-finetuning.md"* ]]
}

@test "T900750: Exportluecke nennt den Backfill-Befehl" {
  _t900750_check_env
  _t900750_write_cache 0 '"322c4ec8-dd16-4f01-8b9c-7726559d91f3"'
  run env HOME="$BATS_TEST_TMPDIR" XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/xdg" XDG_CACHE_HOME="$BATS_TEST_TMPDIR/cache" \
    PATH="$BATS_TEST_TMPDIR/stubbin:/usr/bin:/bin" bash "$REPO/scripts/langfuse/tracing-status.sh" check
  [ "$status" -eq 0 ]
  [[ "$output" == *"task devmesh:langfuse:backfill SESSION=322c4ec8-dd16-4f01-8b9c-7726559d91f3"* ]]
}

@test "T900750: check --hook liefert SessionStart-JSON" {
  _t900750_check_env
  _t900750_write_cache 3000 null
  run env HOME="$BATS_TEST_TMPDIR" XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/xdg" XDG_CACHE_HOME="$BATS_TEST_TMPDIR/cache" \
    PATH="$BATS_TEST_TMPDIR/stubbin:/usr/bin:/bin" bash "$REPO/scripts/langfuse/tracing-status.sh" check --hook
  [ "$status" -eq 0 ]
  run jq -r '.hookSpecificOutput.hookEventName' <<<"$output"
  [ "$output" = "SessionStart" ]
}

@test "T900750: backfill-claude.sh lehnt ungueltige Session-ID ab" {
  run bash "$REPO/scripts/langfuse/backfill-claude.sh" nope
  [ "$status" -eq 2 ]
}

@test "T900750: Taskfile kennt status und backfill" {
  command -v task >/dev/null 2>&1 || skip "task binary not installed"
  cd "$REPO"
  run task --list
  [ "$status" -eq 0 ]
  [[ "$output" == *"devmesh:langfuse:status"* ]]
  [[ "$output" == *"devmesh:langfuse:backfill"* ]]
}
