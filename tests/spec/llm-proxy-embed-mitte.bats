#!/usr/bin/env bats
# llm-proxy-embed-mitte.bats — Spec fuer T901560 (llm-proxy :18235 als Mitte).
# Stub-frei: reine Datei-Assertions, kein Cluster noetig.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "alle environments/*.yaml: EMBED- und RERANKER-URL teilen denselben Basis-Host" {
  for f in "$REPO_ROOT"/environments/dev.yaml "$REPO_ROOT"/environments/fleet-mentolder.yaml "$REPO_ROOT"/environments/mentolder.yaml "$REPO_ROOT"/environments/staging.yaml "$REPO_ROOT"/environments/korczewski.yaml "$REPO_ROOT"/environments/fleet-korczewski.yaml; do
    embed=$(grep -E '^\s*LLM_EMBED_URL:' "$f" | sed -E 's/.*"(http[^"]*)".*/\1/')
    rerank=$(grep -E '^\s*LLM_RERANKER_URL:' "$f" | sed -E 's/.*"(http[^"]*)".*/\1/')
    [ -n "$embed" ] || { echo "$f: LLM_EMBED_URL fehlt"; return 1; }
    [ -n "$rerank" ] || { echo "$f: LLM_RERANKER_URL fehlt"; return 1; }
    embed_host=$(printf '%s' "$embed" | sed -E 's#^https?://([^/:]+).*#\1#')
    rerank_host=$(printf '%s' "$rerank" | sed -E 's#^https?://([^/:]+).*#\1#')
    [ "$embed_host" = "$rerank_host" ] || { echo "$f: Split-Hosts ($embed_host vs $rerank_host)"; return 1; }
  done
}

@test "probe.sh enthaelt 18235" {
  grep -q '18235' "$REPO_ROOT/scripts/mcp-gateway/probe.sh"
}

@test "watchdog-check.sh erwaehnt 18235" {
  grep -q '18235' "$REPO_ROOT/scripts/mcp-gateway/watchdog-check.sh"
}
