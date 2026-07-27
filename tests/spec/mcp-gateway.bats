#!/usr/bin/env bats
# tests/spec/mcp-gateway.bats
# SSOT: openspec/specs/mcp-gateway.md
#
# Covers: OAuth2 proxy MCP bypass, MCP server registration, ops agent output-trust.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── OAuth2 Proxy MCP Path Bypass ──────────────────────────────────────

@test "oauth2-proxy-dev.yaml exists" {
  [ -f "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml" ]
}

@test "oauth2-proxy-dev.yaml has --skip-auth-route for MCP paths" {
  run grep -q 'skip-auth-route' "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml"
  [ "$status" -eq 0 ]
}

@test "oauth2-proxy-dev.yaml bypass includes kubernetes MCP path" {
  run grep -q 'kubernetes' "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml"
  [ "$status" -eq 0 ]
}

@test "oauth2-proxy-dev.yaml bypass includes postgres MCP path" {
  run grep -q 'postgres' "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml"
  [ "$status" -eq 0 ]
}

# ── MCP Registry SSOT (abgelöst: hartcodierte .mcp.json-Tests) ──────────

@test "SSOT registry mcp.yaml exists with clients and cluster" {
  [ -f "$REPO/docs/agent-guide/registry/mcp.yaml" ]
  run bash -c "node -e \"const fs=require('fs'),y=require('yaml');const d=y.parse(fs.readFileSync('$REPO/docs/agent-guide/registry/mcp.yaml','utf8'));console.log(Object.keys(d.clients).length,Object.keys(d.cluster).length)\""
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+[[:space:]]+[0-9]+ ]]
}

@test "mcp-sync.sh check passes (registry matches generated configs)" {
  run bash "$REPO/scripts/mcp-sync.sh" check
  echo "output: $output"
  [ "$status" -eq 0 ]
}

@test "mcp-sync.sh check is read-only (never writes)" {
  local before_sum after_sum
  before_sum=$(md5sum "$REPO/.mcp.json" "$REPO/.opencode/opencode.jsonc" 2>/dev/null | md5sum)
  run bash "$REPO/scripts/mcp-sync.sh" check
  after_sum=$(md5sum "$REPO/.mcp.json" "$REPO/.opencode/opencode.jsonc" 2>/dev/null | md5sum)
  echo "before: $before_sum after: $after_sum"
  [ "$before_sum" = "$after_sum" ]
}

@test "mcp-sync.sh check skips agy target with visible message" {
  if [ -f "$HOME/.gemini/config/mcp_config.json" ]; then
    skip "agy target exists on this machine — test only applies in CI"
  fi
  run bash "$REPO/scripts/mcp-sync.sh" check
  echo "output: $output"
  [[ "$output" =~ skipped ]]
}

# ── mcp-postgres Brand-Bindung (T002278) ──────────────────────────────
# Der Server auf :13001 haengt fest an der mentolder-DB. `external_id` ist nur
# pro Brand eindeutig, eine Abfrage nach einer korczewski-ID liefert daher still
# das gleichnamige mentolder-Ticket. Die Bindung muss maschinenlesbar in der
# Registry stehen und in der Prosa-SSOT als Routing-Regel dokumentiert sein.

@test "registry declares mcp-postgres brand binding and target database" {
  run bash -c "node -e \"const fs=require('fs'),y=require('yaml');const d=y.parse(fs.readFileSync('$REPO/docs/agent-guide/registry/mcp.yaml','utf8'));const c=d.clients['mcp-postgres'];if(c.brand!=='mentolder')process.exit(1);if(!c.database)process.exit(1);console.log('ok')\""
  echo "output: $output"
  [ "$status" -eq 0 ]
}

@test "registry names the sanctioned korczewski read path for mcp-postgres" {
  run bash -c "node -e \"const fs=require('fs'),y=require('yaml');const d=y.parse(fs.readFileSync('$REPO/docs/agent-guide/registry/mcp.yaml','utf8'));const c=d.clients['mcp-postgres'];if(!c.korczewski_path)process.exit(1);if(!/workspace-korczewski/.test(c.korczewski_path))process.exit(1);console.log('ok')\""
  echo "output: $output"
  [ "$status" -eq 0 ]
}

@test "mcp-tool-guide warns that mcp-postgres is brand-scoped to mentolder" {
  run grep -qi 'brand-gebunden\|brand-scoped\|nur die mentolder-DB' \
    "$REPO/.claude/skills/references/mcp-tool-guide.md"
  [ "$status" -eq 0 ]
}

@test "mcp-tool-guide routes ticket reads to ticket-mcp with explicit brand" {
  run grep -q 'T002278' "$REPO/.claude/skills/references/mcp-tool-guide.md"
  [ "$status" -eq 0 ]
}

@test "CLAUDE.md routing table no longer sells mcp-postgres as the ticket-query path" {
  run grep -q 'mcp-postgres` (localhost:13001) — Ticket-Queries' "$REPO/CLAUDE.md"
  [ "$status" -ne 0 ]
}

@test "cluster container names match deployment manifest" {
  run grep -c '"name": "keycloak"\|"name": "playwright"\|"name": "github"' \
    "$REPO/k3d/default/claude-code-mcp-monolith-deploy.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 3 ]
}

# ── Ops Agent Output-Trust Guardrails ─────────────────────────────────

@test "bachelorprojekt-ops.md exists" {
  [ -f "$REPO/.claude/agents/bachelorprojekt-ops.md" ]
}

@test "ops agent has Output trust & shell-session integrity section" {
  run grep -qi 'output.*trust\|shell.*session.*integrity' "$REPO/.claude/agents/bachelorprojekt-ops.md"
  [ "$status" -eq 0 ]
}

@test "ops agent warns against fabricating diagnosis from unverified output" {
  run grep -qi 'fabricate\|do not conclude\|never.*diagnose.*unverified' "$REPO/.claude/agents/bachelorprojekt-ops.md"
  [ "$status" -eq 0 ]
}

@test "ops agent prescribes kubectl get nodes as verification probe" {
  run grep -q 'kubectl get nodes' "$REPO/.claude/agents/bachelorprojekt-ops.md"
  [ "$status" -eq 0 ]
}

# ── repo-built MCP servers: PATH name, not absolute path (T002301) ────

@test "T002301: no repo-built MCP server is referenced by an absolute home path" {
  local reg="$REPO/docs/agent-guide/registry/mcp.yaml"
  [ -f "$reg" ]
  # Nur Server, die AUS DIESEM REPO gebaut werden — sie koennen per Build-Task auf den
  # PATH installiert werden. Fremde Server (task-master-ai = npm-Paket, codebase-memory-mcp
  # = extern nach ~/.local/bin installiert) sind ausgenommen: ihr Pfad ist nicht durch
  # einen Build-Schritt dieses Repos beeinflussbar.
  local server fail=0
  for server in ticket-mcp mcp-task-runner factory-mcp; do
    local block hits
    block="$(awk -v s="^  ${server}:$" '$0 ~ s {f=1; next} f && /^  [a-z]/ {exit} f' "$reg")"
    hits="$(printf '%s\n' "$block" | grep -nE '^\s*command: */home/' || true)"
    [ -z "$hits" ] || { echo "$server wird ueber einen absoluten Home-Pfad gestartet:"; echo "$hits"; fail=1; }
  done
  [ "$fail" -eq 0 ]
}

@test "T002301: ticket-mcp is referenced by PATH name" {
  local reg="$REPO/docs/agent-guide/registry/mcp.yaml"
  run grep -A3 '^  ticket-mcp:' "$reg"
  [ "$status" -eq 0 ]
  [[ "$output" == *"command: ticket-mcp-go"* ]] \
    || { echo "ticket-mcp wird nicht ueber den PATH-Namen referenziert:"; echo "$output"; return 1; }
}

@test "T002301: ticket-mcp:build installs onto the PATH like mcp-task-runner" {
  # Ohne Install-Schritt bleibt das Binary im Repo liegen und der PATH-Name greift ins Leere.
  run grep -A12 '^  ticket-mcp:build:' "$REPO/Taskfile.yml"
  [ "$status" -eq 0 ]
  [[ "$output" == *"/usr/local/bin"* ]] \
    || { echo "ticket-mcp:build installiert nicht auf den PATH:"; echo "$output"; return 1; }
}

# ── MCP Postgres Bridge Child-Process Containment (T002321) ────────────
#
# Der postgres-Container wurde 56x OOMKilled: supergateway --stateless spawnt
# pro MCP-Request einen mcp-server-postgres-Kindprozess (~54Mi RSS) und reaped
# ihn nie; die RSS-Summe erreicht nach ~10h das 2Gi-cgroup-Limit.

MONOLITH_MANIFEST_REL="k3d/default/claude-code-mcp-monolith-deploy.yaml"

# Startkommando (args[0]) des postgres-Containers aus dem JSON-Manifest.
pg_container_args() {
  jq -r '.spec.template.spec.containers[] | select(.name=="postgres") | .args[0]' \
    "$REPO/$MONOLITH_MANIFEST_REL"
}

pg_memory_limit() {
  jq -r '.spec.template.spec.containers[] | select(.name=="postgres") | .resources.limits.memory' \
    "$REPO/$MONOLITH_MANIFEST_REL"
}

@test "monolith deployment manifest exists" {
  [ -f "$REPO/$MONOLITH_MANIFEST_REL" ]
}

@test "postgres container reaps accumulated mcp-server-postgres children" {
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq 'reap|REAP'"
  [ "$status" -eq 0 ]
}

@test "postgres container pins supergateway to an explicit version" {
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq 'supergateway@[0-9]+\.[0-9]+\.[0-9]+'"
  [ "$status" -eq 0 ]
}

@test "postgres container pins @modelcontextprotocol/server-postgres to an explicit version" {
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq '@modelcontextprotocol/server-postgres@[0-9]+\.[0-9]+\.[0-9]+'"
  [ "$status" -eq 0 ]
}

@test "postgres container logs child count so growth is visible before the kill" {
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq 'child|children'"
  [ "$status" -eq 0 ]
}

@test "postgres memory limit is below 2Gi so a regression surfaces in hours" {
  limit="$(pg_memory_limit)"
  # Erwartet: Mi-Wert unter 2048Mi. 2Gi versteckt den Leak ~10h lang.
  [[ "$limit" =~ ^([0-9]+)Mi$ ]] || { echo "limit '$limit' ist nicht in Mi angegeben"; return 1; }
  [ "${BASH_REMATCH[1]}" -lt 2048 ]
}

# ── MCP Monolith Deployment Reality In SSOT (T002321) ──────────────────

@test "mcp-gateway spec does not claim the monolith is decommissioned while its manifest ships" {
  if [ -f "$REPO/$MONOLITH_MANIFEST_REL" ]; then
    run grep -Eq 'dekommissioniert|decommissioned' "$REPO/openspec/specs/mcp-gateway.md"
    [ "$status" -ne 0 ]
  fi
}

@test "mcp-gateway spec documents the manual apply path of k3d/default" {
  run grep -q 'k3d/default' "$REPO/openspec/specs/mcp-gateway.md"
  [ "$status" -eq 0 ]
}
