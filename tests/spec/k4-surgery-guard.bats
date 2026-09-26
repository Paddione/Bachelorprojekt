#!/usr/bin/env bats
# tests/spec/k4-surgery-guard.bats
# SSOT: openspec/specs/brain-k4-brain-wiki.md (REQ-k4-10), openspec/specs/brain-foundation.md (REQ-BRAIN-FOUNDATION-009), openspec/specs/sdlc-cockpit.md
# Ticket: T900451
# k4-surgery absence guard: pipeline/MCP/cockpit gone (p1/p2), keepers present.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
}

@test "k4(a): pipeline scripts and ingest skill are absent" {
  local rest=0 f
  for f in scripts/brain-ingest.sh scripts/brain-ingest-worklist.sh scripts/brain-ingest-transform.sh scripts/brain-ingest-moc.sh scripts/brain-ingest-prune.sh scripts/brain-ingest-restamp.sh scripts/brain-ingest-swap.sh scripts/brain-ingest-reset.sh scripts/brain-ingest-coverage.sh scripts/brain-group-match.sh scripts/brain-source-provenance.sh scripts/brain-page-metadata.py scripts/brain-lifecycle-audit.py scripts/brain-expertise.py scripts/brain-bootstrap.sh scripts/brain-merge-hook.sh; do
    [ ! -e "$REPO_ROOT/$f" ] || { echo "DEL-REST: $f"; rest=1; }
  done
  [ ! -d "$REPO_ROOT/.agents/skills/brain-ingest" ] || { echo "DEL-REST: skill dir"; rest=1; }
  [ "$rest" -eq 0 ]
}

@test "k4(b): ingest manifest and merge-hook workflow are absent" {
  [ ! -e "$REPO_ROOT/scripts/brain/ingest-sources.yaml" ]
  [ ! -e "$REPO_ROOT/.github/workflows/brain-merge-hook.yml" ]
  [ "$(grep -rln 'ssot-specs' "$REPO_ROOT/scripts" "$REPO_ROOT/taskfiles" 2>/dev/null | wc -l)" -eq 0 ]
}

@test "k4(c): brain-mcp server and registry wiring are absent" {
  [ ! -e "$REPO_ROOT/scripts/brain-mcp-server.py" ]
  [ ! -d "$REPO_ROOT/scripts/brain-mcp-node" ]
  [ "$(grep -rn 'brain-mcp-node' "$REPO_ROOT/.mcp.json" "$REPO_ROOT/.opencode/opencode.jsonc" "$REPO_ROOT/docs/agent-guide/registry/mcp.yaml" "$REPO_ROOT/docs/agent-guide/registry/capabilities.yaml" "$REPO_ROOT/docs/agent-guide/maps/toolset-map.md" 2>/dev/null | wc -l)" -eq 0 ]
  [ "$(grep -rn 'brain_search\|brain_read' "$REPO_ROOT/docs/agent-guide/registry/capabilities.yaml" "$REPO_ROOT/docs/agent-guide/maps/toolset-map.md" 2>/dev/null | wc -l)" -eq 0 ]
}

@test "k4(d): cockpit brain wiring and brain manifests are absent" {
  [ ! -e "$REPO_ROOT/components/website/src/lib/sdlc/brain-links.ts" ]
  [ ! -e "$REPO_ROOT/components/website/src/pages/sdlc/api/cockpit/brain.ts" ]
  [ ! -e "$REPO_ROOT/k3d/brain.yaml" ]
  [ ! -e "$REPO_ROOT/k3d/oauth2-proxy-brain.yaml" ]
  [ "$(grep -n 'brain' "$REPO_ROOT/k3d/ingress.yaml" "$REPO_ROOT/k3d/kustomization.yaml" 2>/dev/null | wc -l)" -eq 0 ]
}

@test "k4(e): G-BRAIN12/13/14 are retired except two history lines" {
  [ "$(grep -c 'G-BRAIN1[234]' "$REPO_ROOT/scripts/health-goals-check.sh")" -eq 0 ]
  [ "$(grep -c 'G-BRAIN1[234]' "$REPO_ROOT/.claude/lib/goals.md")" -eq 2 ]
  grep -q 'Nummerierung ab `G-BRAIN12`' "$REPO_ROOT/.claude/lib/goals.md"
  grep -q 'G-BRAIN13 (`.github/`-Pfade' "$REPO_ROOT/.claude/lib/goals.md"
}

@test "k4(f): pipeline keepers are present" {
  [ -f "$REPO_ROOT/scripts/brain-chunk.sh" ]
  [ -f "$REPO_ROOT/scripts/brain-verify-refs.sh" ]
  [ -f "$REPO_ROOT/scripts/brain-verify-claims.sh" ]
  [ -f "$REPO_ROOT/scripts/brain-retrieval-eval.py" ]
  [ -f "$REPO_ROOT/scripts/brain-index.py" ]
}

@test "k4(g): G-BRAIN15 and the brain seed templates are present" {
  [ "$(grep -c 'G-BRAIN15' "$REPO_ROOT/scripts/health-goals-check.sh")" -ge 1 ]
  [ "$(grep -c 'G-BRAIN15' "$REPO_ROOT/.claude/lib/goals.md")" -ge 1 ]
  [ -d "$REPO_ROOT/templates/brain" ]
  [ -f "$REPO_ROOT/templates/brain/site.Dockerfile" ]
}
