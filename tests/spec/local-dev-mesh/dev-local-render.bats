#!/usr/bin/env bats
# tests/spec/local-dev-mesh/dev-local-render.bats — T900118
# SSOT: specs/local-dev-mesh.md — Profile core/full, "Environment resolution targets devmesh",
#       "GPU inference is reached through a static endpoint"
# Pruefmodus: Ausfuehrung von scripts/devmesh/render-stack.sh und env-resolve.sh; bewertet
# wird das gerenderte Manifest (yq), nicht der Quelltext.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RENDER="$REPO_ROOT/scripts/devmesh/render-stack.sh"
  FIX="$(mktemp -d)"
  export DEVMESH_INVENTORY="$FIX/inventory.yaml"
  printf 'gpu_endpoint:\n  peer: pk-desktop\n  address: 100.101.102.103\n  port: 18235\n' > "$DEVMESH_INVENTORY"
}

teardown() { rm -rf "$FIX"; }

render() { bash "$RENDER" "$1" > "$FIX/$1.yaml" 2> "$FIX/$1.err" || { cat "$FIX/$1.err"; return 1; }; }
deploys() { yq ea -r '[select(.kind == "Deployment") | .metadata.name] | .[]' "$FIX/$1.yaml"; }

@test "env-resolve dev liefert ENV_CONTEXT=devmesh" {
  run bash -c 'source "$1/scripts/env-resolve.sh" dev "$1/environments" && echo "ENV_CONTEXT=$ENV_CONTEXT"' _ "$REPO_ROOT"
  [ "$status" -eq 0 ]
  grep -qx 'ENV_CONTEXT=devmesh' <<<"$output"
}

@test "Profil core enthaelt die Console und keine schweren Dienste" {
  render core
  names="$(deploys core)"
  grep -qx 'sdlc-console' <<<"$names"
  grep -qx 'shared-db' <<<"$names"
  heavy="$(grep -xE 'nextcloud|collabora|spreed-signaling|vaultwarden' <<<"$names" || true)"
  [ -z "$heavy" ]
}

@test "Profil full enthaelt Nextcloud, Collabora, Talk und Vaultwarden" {
  render full
  names="$(deploys full)"
  grep -qx 'sdlc-console' <<<"$names"
  for d in nextcloud collabora spreed-signaling vaultwarden; do grep -qx "$d" <<<"$names"; done
}

@test "core: EndpointSlice traegt Inventar-Adresse und Port als Zahl, Hosts sind aufgeloest" {
  render core
  addr="$(yq ea -r 'select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .endpoints[0].addresses[0]' "$FIX/core.yaml")"
  [ "$addr" = "100.101.102.103" ]
  tag="$(yq ea -r 'select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .ports[0].port | tag' "$FIX/core.yaml")"
  [ "$tag" = "!!int" ]
  hosts="$(yq ea -r 'select(.kind == "Ingress" and .metadata.name == "devmesh-core") | .spec.rules[].host' "$FIX/core.yaml")"
  grep -qx 'web.devmesh.mentolder.de' <<<"$hosts"
  left="$(grep -oE '(^|[^$])\$\{(DEVMESH_DOMAIN|GPU_ENDPOINT_ADDRESS|GPU_ENDPOINT_PORT|POCKET_ID_DOMAIN)\}' "$FIX/core.yaml" || true)"
  [ -z "$left" ]
}

@test "gpu_endpoint ausserhalb 100.64.0.0/10 bricht mit Exit 2 ab" {
  render core
  yq -i '.gpu_endpoint.address = "10.10.0.3"' "$DEVMESH_INVENTORY"
  run bash "$RENDER" core
  [ "$status" -eq 2 ]
  grep -qF 'gpu_endpoint' <<<"$output"
}
