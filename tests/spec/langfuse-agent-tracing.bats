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
  for b in claude opencode pi codex; do
    printf '#!/bin/sh\nexit 0\n' > "$BATS_TEST_TMPDIR/bin/$b"; chmod +x "$BATS_TEST_TMPDIR/bin/$b"
  done
}

@test "T900688: setup-harnesses --dry-run plant alle vier Harnesses und schreibt nichts" {
  _stub_bin
  mkdir -p "$BATS_TEST_TMPDIR/home"
  run env HOME="$BATS_TEST_TMPDIR/home" PATH="$BATS_TEST_TMPDIR/bin:/usr/bin:/bin" \
    bash "$REPO/scripts/langfuse/setup-harnesses.sh" --dry-run
  [ "$status" -eq 0 ]
  for h in claude opencode pi codex; do
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

@test "T900690: pi-Setup scheitert laut, wenn das Plugin nach pi install fehlt" {
  _setup_env
  printf '#!/bin/sh\n[ "$1" = list ] && echo "No packages installed."\nexit 0\n' > "$BATS_TEST_TMPDIR/bin/pi"
  chmod +x "$BATS_TEST_TMPDIR/bin/pi"
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
