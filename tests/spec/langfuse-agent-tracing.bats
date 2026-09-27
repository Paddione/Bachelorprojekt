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
  run yq ea -r 'select(.kind == "Ingress") | .spec.rules[] | select(.host | test("^langfuse\.")) | .http.paths[] | .path + " " + .backend.service.name' "$RENDERED"
  [ "$status" -eq 0 ]
  [[ "$output" == *"/api/public/otel langfuse-otel-redact"* ]]
  [[ "$output" == *"/ langfuse-web"* ]]
}

@test "T900688: Collector-Config maskiert jeden Secret-Typ aus design.md" {
  run yq ea -r 'select(.kind == "ConfigMap" and .metadata.name == "langfuse-otel-redact-config") | .data."config.yaml"' "$RENDERED"
  [ "$status" -eq 0 ]
  [[ "$output" == *"traces_url_path: /api/public/otel/v1/traces"* ]]
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
