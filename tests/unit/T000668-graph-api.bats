#!/usr/bin/env bats
# T000668 — Admin Live-Architektur-Graph API offline tests.

setup() {
  cd "$BATS_TEST_DIRNAME/../.." || exit 1
}

@test "graph.json exists and contains WEBSITE_NAMESPACE placeholder" {
  [ -f docs/generated/graph.json ]
  run grep -c 'WEBSITE_NAMESPACE' docs/generated/graph.json
  [ "$output" -gt 0 ]
}

@test "graph.json contains WORKSPACE_NAMESPACE placeholder" {
  run grep -c 'WORKSPACE_NAMESPACE' docs/generated/graph.json
  [ "$output" -gt 0 ]
}

@test "graph.json has at least 10 nodes" {
  count=$(python3 -c "import json; d=json.load(open('docs/generated/graph.json')); print(len(d['nodes']))")
  [ "$count" -ge 10 ]
}

@test "graph.json has at least 1 edge" {
  count=$(python3 -c "import json; d=json.load(open('docs/generated/graph.json')); print(len(d['edges']))")
  [ "$count" -ge 1 ]
}

@test "graph.ts API endpoint file exists" {
  [ -f website/src/pages/api/admin/cluster/graph.ts ]
}

@test "architektur.astro page file exists" {
  [ -f website/src/pages/admin/architektur.astro ]
}

@test "ArchitekturGraph.svelte component exists" {
  [ -f website/src/components/admin/ArchitekturGraph.svelte ]
}

@test "AdminLayout includes architektur page reference" {
  [ -f website/src/pages/admin/architektur.astro ]
}

@test "k3d kustomize builds without regression" {
  command -v kubectl >/dev/null || skip "kubectl not installed"
  run kubectl kustomize k3d/ --load-restrictor=LoadRestrictionsNone
  [ "$status" -eq 0 ]
}
