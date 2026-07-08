#!/usr/bin/env bats
# SSOT: openspec/specs/hermes-mcp-access.md
<<<<<<< HEAD
#
# BATS suite for hermes-agent-mcp-access capability.
# All scenarios mirror 1:1 the Scenarios in the OpenSpec spec.

# ── File-level variables ─────────────────────────────────────────────────────
SCRIPT_REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
REGISTRY_SCRIPT="${SCRIPT_REPO_ROOT}/scripts/hermes-mcp-servers.yaml"
PROVISION_SCRIPT="${SCRIPT_REPO_ROOT}/scripts/hermes-mcp-provision.sh"

# ── Helpers ──────────────────────────────────────────────────────────────────
setup() {
  load 'test_helper.bash'

  # Create temp config for this test
  _config_tmp="$BATS_TEST_TMPDIR/config.yaml"
  
  # Copy fixture into temp location
  if [[ -f "$BATS_TEST_DIRNAME/../fixtures/hermes/config-empty.yaml" ]]; then
    cp "$BATS_TEST_DIRNAME/../fixtures/hermes/config-empty.yaml" "$_config_tmp"
  elif [[ -f "$BATS_TEST_DIRNAME/../fixtures/hermes/config-foreign.yaml" ]]; then
    cp "$BATS_TEST_DIRNAME/../fixtures/hermes/config-foreign.yaml" "$_config_tmp"
  fi

  # Compute initial checksum if we have a temp config
  _checksum_orig=""
  if [[ -f "$_config_tmp" ]]; then
    _checksum_orig=$(sha256sum "$_config_tmp" | cut -d' ' -f1)
  fi

  # Stashed values for verification
  _servers_expected="mcp-postgres mcp-kubernetes factory-mcp codebase-memory-mcp mcp-task-runner ticket-mcp"
}

teardown() {
  rm -f "$_config_tmp"
}

# ── Scenario 1: Registry lists all catalog servers ────────────────────────────
@test "registry lists all catalog servers" {
  run yq 'keys | .[]' "$REGISTRY_SCRIPT"
  
  # Parse expected servers from opencode.jsonc (excluding task-master-ai)
  _opencode_mcp=$(cat "${SCRIPT_REPO_ROOT}/.opencode/opencode.jsonc" 2>/dev/null | grep -A10 '"mcp": {' || true)
  _servers_catalog=($(echo "$_opencode_mcp" | grep '^[a-z].*:' | sed 's/.*: *//' | tr '\n' ' ') | xargs)
  
  # Build expected list from design doc table (6 servers)
  _expected_servers="mcp-postgres mcp-kubernetes factory-mcp codebase-memory-mcp mcp-task-runner ticket-mcp"
  
  # Check we have exactly 6 servers and they're all present
  local count=0
  for server in $_expected_servers; do
    if yq ".\"$server\"" "$REGISTRY_SCRIPT" >/dev/null 2>&1; then
      ((count++))
    fi
  done
  
  run [[ $count -eq 6 ]]
  echo "Found $count servers (expected 6)" || return 1

  # Check each server has exactly one of url XOR command
  for server in $_expected_servers; do
    has_url=false
    has_command=false
    
    _server_data=$(yq ".\"$server\"" "$REGISTRY_SCRIPT")
    
    if echo "$_server_data" | grep -q '"url"'; then
      has_url=true
    fi
    
    if echo "$_server_data" | grep -q '"command"'; then
      has_command=true
    fi
    
    # Should have url XOR command, not both and not neither
    local status=false
    if $has_url && ! $has_command; then
      status=true
    elif ! $has_url && $has_command; then
      status=true
    fi
    
    run [[ "$status" == true ]] || {
      echo "Server '$server' has both url and command (should be XOR)"
      return 1
    }
  done
}

# ── Scenario 2: Denylist covers known destructive tools ──────────────────────
@test "denylist covers known destructive tools" {
  # Hard-coded associative array from design D4 table (tools.exclude per server)
  _denylist_map='
    mcp-kubernetes:pods_delete,pods_exec,pods_run,resources_delete,resources_create_or_update,resources_scale
    codebase-memory-mcp:delete_project,index_repository,ingest_traces,manage_adr
    ticket-mcp:create_ticket,enqueue_ticket,transition_status,triage_ticket,update_fields,set_readiness_flag,set_touched_files,set_plan_meta,stage_plan,archive_plan,link_tickets,record_grill_answers,record_phase_event,report_mishap,flush_mishap_buffer,add_comment,add_pr_link,backfill_ticket_id
    factory-mcp:factory_enqueue,factory_trigger
    mcp-task-runner:execute_plan,run_task,run_task_async,cancel_task
  '

  # For each server with a denylist, check all destructive tools are listed
  while IFS=: read -r _server _tools; do
    [[ -z "$_server" ]] && continue
    
    # Verify this server actually has a tools.exclude in the registry
    _exclude_list=$(yq ".\"$_server\".tools.exclude | join(", ")" "$REGISTRY_SCRIPT")
    if [[ -z "$_exclude_list" ]]; then
      echo "Server '$_server' missing tools.exclude key"
      return 1
    fi
    
    # Check each tool is in the exclude list
    IFS=',' read -ra _tool_array <<< "$_tools"
    for _tool in "${_tool_array[@]}"; do
      [[ -z "$_tool" ]] && continue
      
      if ! echo "$_exclude_list" | grep -qw "$_tool"; then
        echo "Server '$_server' missing exclude: $_tool"
        return 1
      fi
    done
  done <<< "$_denylist_map"
  
  # Also verify mcp-postgres has NO denylist (design D4)
  _pg_exclude=$(yq '.mcp-postgres.tools.exclude' "$REGISTRY_SCRIPT")
  run [[ -z "$_pg_exclude" ]] || {
    echo "mcp-postgres should have no tools.exclude key (server-side read-only)"
    return 1
  }
}

# ── Scenario 3: mcp-postgres has no denylist ──────────────────────────────────
@test "mcp-postgres has no denylist" {
  _pg_exclude=$(yq '.mcp-postgres.tools.exclude' "$REGISTRY_SCRIPT")
  run [[ -z "$_pg_exclude" ]] || return 1
  
  echo "mcp-postgres correctly has no tools.exclude (null)"
}

# ── Scenario 4: dry-run does not modify the target config ─────────────────────
@test "dry-run does not modify the target config" {
  # Need provisioning script for this test
  if [[ ! -f "$PROVISION_SCRIPT" ]]; then
    echo "SKIP: $PROVISION_SCRIPT missing (Task 3 not yet implemented)"
    return 77
  fi

  _checksum_before=$(sha256sum "$_config_tmp" | cut -d' ' -f1)
  
  # Run dry-run
  "${PROVISION_SCRIPT}" --dry-run --config "$_config_tmp" >/dev/null 2>&1
  
  # Check stdout mentions mcp_servers
  _output=$("${PROVISION_SCRIPT}" --dry-run --config "$_config_tmp" 2>/dev/null)
  run echo "$_output" | grep -q "mcp_servers" || {
    echo "dry-run output should contain 'mcp_servers'"
    return 1
  }

  _checksum_after=$(sha256sum "$_config_tmp" | cut -d' ' -f1)
  
  # Config file must be unchanged
  run [[ "$_checksum_before" == "$_checksum_after" ]] || {
    echo "Config modified by dry-run (before: $_checksum_before, after: $_checksum_after)"
    return 1
  }

  echo "dry-run preserves config and outputs mcp_servers"
}

# ── Scenario 5: Provisioning is idempotent ────────────────────────────────────
@test "provisioning is idempotent" {
  if [[ ! -f "$PROVISION_SCRIPT" ]]; then
    echo "SKIP: $PROVISION_SCRIPT missing (Task 3 not yet implemented)"
    return 77
  fi

  # Provision twice and compare results
  _result1=$(yq '.mcp_servers' "$_config_tmp")
  
  "${PROVISION_SCRIPT}" --config "$_config_tmp" >/dev/null 2>&1
  
  _result2=$(yq '.mcp_servers' "$_config_tmp")

  run [[ "$_result1" == "$_result2" ]] || {
    echo "Idempotency failed: results differ between runs"
    return 1
  }

  echo "Provisioning is idempotent (results match)"
}

# ── Scenario 6: Provisioning preserves unrelated keys ────────────────────────
@test "provisioning preserves unrelated keys" {
  if [[ ! -f "$PROVISION_SCRIPT" ]]; then
    echo "SKIP: $PROVISION_SCRIPT missing (Task 3 not yet implemented)"
    return 77
  fi

  # Use the foreign config fixture that has foreign mcp_servers entry
  cp "$BATS_TEST_DIRNAME/../fixtures/hermes/config-foreign.yaml" "$_config_tmp"
  
  _model_before=$(yq '.model' "$_config_tmp")
  
  "${PROVISION_SCRIPT}" --config "$_config_tmp" >/dev/null 2>&1
  
  # Check model key is preserved
  run [[ "$(yq '.model' "$_config_tmp")" == "$_model_before" ]] || {
    echo "Unrelated key 'model' was modified (was: $_model_before)"
    return 1
  }

  # Check foreign mcp_servers entry is still present
  _foreign_server=$(yq '.mcp_servers.some-other-server.url' "$_config_tmp")
  
  run [[ -n "$_foreign_server" ]] || {
    echo "Foreign mcp_servers entry was removed"
    return 1
  }

  echo "Preserves unrelated keys (model and foreign server)"
}

# ── Scenario 7a: Delegate defaults to no tool access (default path) ────────────
@test "hermes-delegate.sh defaults to no tool access (without --with-project-mcp flag)" {
  if [[ ! -f "${SCRIPT_REPO_ROOT}/scripts/hermes-delegate.sh" ]]; then
    echo "SKIP: hermes-delegate.sh missing (Task 4 not yet implemented)"
    return 77
  fi

  # Stub the hermes binary to capture argv
  _hermes_stub="$BATS_TEST_TMPDIR/hermes-stub"
  cat > "$_hermes_stub" << 'HERMES_STUB'
#!/bin/bash
# Stub that echoes its full argv for inspection
exec -a hermes "$@"
HERMES_STUB
  chmod +x "$_hermes_stub"

  # Set HERMES to our stub
  export HERMES="$_hermes_stub"
  
  # Run delegate without --with-project-mcp (default path)
  _output=$("${SCRIPT_REPO_ROOT}/scripts/hermes-delegate.sh" "test prompt" 2>/dev/null) || true
  
  # Default should use -t "" (no tools)
  run echo "$_output" | grep -qE 'hermes[^-]*-z.*"-t[[:space:]]*""' || {
    echo "Default delegate invocation should use '-t \"\"' for no tool access"
    return 1
  }

  echo "Delegate default correctly uses '-t \"\"'"
}

# ── Scenario 7b: Delegate opt-in path does not force -t "" ────────────────────
@test "hermes-delegate.sh --with-project-mcp does not force -t \"\"" {
  if [[ ! -f "${SCRIPT_REPO_ROOT}/scripts/hermes-delegate.sh" ]]; then
    echo "SKIP: hermes-delegate.sh missing (Task 4 not yet implemented)"
    return 77
  fi

  # Stub the hermes binary to capture argv
  _hermes_stub="$BATS_TEST_TMPDIR/hermes-stub"
  cat > "$_hermes_stub" << 'HERMES_STUB'
#!/bin/bash
# Stub that echoes its full argv for inspection
exec -a hermes "$@"
HERMES_STUB
  chmod +x "$_hermes_stub"

  # Set HERMES to our stub
  export HERMES="$_hermes_stub"
  
  # Run delegate with --with-project-mcp (opt-in path)
  _output=$("${SCRIPT_REPO_ROOT}/scripts/hermes-delegate.sh" "test prompt" "--with-project-mcp" 2>/dev/null) || true
  
  # Opt-in should NOT force -t "" (that would defeat the purpose)
  run echo "$_output" | grep -qvE 'hermes[^-]*-z.*"-t[[:space:]]*""' || {
    echo "Delegate opt-in path incorrectly forces '-t \"\"'"
    return 1
  }

  echo "Delegate opt-in path does not force '-t \"\"'"
=======

setup() { load 'test_helper.bash'; }

@test "registry lists all catalog servers" {
  run yq eval keys .[] scripts/hermes-mcp-servers.yaml >/dev/null
  
  local count=0
  for server in mcp-postgres mcp-kubernetes factory-mcp codebase-memory-mcp mcp-task-runner ticket-mcp; do
    val=$(yq eval ".\"$server\"" scripts/hermes-mcp-servers.yaml)
    if [[ "$val" != null ]]; then
      count=$((count + 1))
    fi
  done
  
  run -127 [[ $count -eq 6 ]] || return 1
}

@test "denylist covers known destructive tools" {
  _el=$(yq eval '.mcp-kubernetes.tools.exclude | join(", ")' scripts/hermes-mcp-servers.yaml)
  echo "$_el" | grep -qw "pods_delete" || return 1
}

@test "denylist covers codebase-memory-mcp destructive tools" {
  _el=$(yq eval '.codebase-memory-mcp.tools.exclude | join(", ")' scripts/hermes-mcp-servers.yaml)
  echo "$_el" | grep -qw "delete_project" || return 1
}

@test "denylist covers ticket-mcp destructive tools" {
  _el=$(yq eval '.ticket-mcp.tools.exclude | join(", ")' scripts/hermes-mcp-servers.yaml)
  echo "$_el" | grep -qw "create_ticket" || return 1
}

@test "mcp-postgres has no denylist (read-only)" {
  _pg=$(yq eval '.mcp-postgres.tools' scripts/hermes-mcp-servers.yaml)
  [[ "$_pg" == null ]] || return 1
}

@test "dry-run does not modify config" {
  [[ ! -f scripts/hermes-mcp-provision.sh ]] && skip "Task 3 missing"
  
  _c=$(sha256sum tests/fixtures/hermes/config-empty.yaml | cut -d' ' -f1)
  cp tests/fixtures/hermes/config-empty.yaml "$BATS_TEST_TMPDIR/config.yaml"
  ./scripts/hermes-mcp-provision.sh --dry-run --config "$BATS_TEST_TMPDIR/config.yaml" >/dev/null
  _ca=$(sha256sum "$BATS_TEST_TMPDIR/config.yaml" | cut -d' ' -f1)
  
  [[ "$_c" == "$_ca" ]] || { echo "FAIL: config modified"; return 1; }
}

@test "provisioning is idempotent" {
  cp tests/fixtures/hermes/config-empty.yaml "$BATS_TEST_TMPDIR/cfg1.yaml"
  _r1=$(yq eval '.mcp_servers' "$BATS_TEST_TMPDIR/cfg1.yaml")
  ./scripts/hermes-mcp-provision.sh --config "$BATS_TEST_TMPDIR/cfg1.yaml" >/dev/null
  _r2=$(yq eval '.mcp_servers' "$BATS_TEST_TMPDIR/cfg1.yaml")
  
  [[ "$_r1" == "$_r2" ]] || { echo "FAIL: not idempotent"; return 1; }
}

@test "preserves unrelated keys" {
  cp tests/fixtures/hermes/config-foreign.yaml "$BATS_TEST_TMPDIR/cfg.yaml"
  _m=$(yq eval '.model' "$BATS_TEST_TMPDIR/cfg.yaml")
  ./scripts/hermes-mcp-provision.sh --config "$BATS_TEST_TMPDIR/cfg.yaml" >/dev/null
  _ma=$(yq eval '.model' "$BATS_TEST_TMPDIR/cfg.yaml")
  
  [[ "$_m" == "$_ma" ]] || { echo "FAIL: model modified"; return 1; }
}

@test "preserves foreign mcp_servers entries" {
  cp tests/fixtures/hermes/config-foreign.yaml "$BATS_TEST_TMPDIR/cfg.yaml"
  _s=$(yq eval '.mcp_servers.some-other-server.url' "$BATS_TEST_TMPDIR/cfg.yaml")
  ./scripts/hermes-mcp-provision.sh --config "$BATS_TEST_TMPDIR/cfg.yaml" >/dev/null
  _sa=$(yq eval '.mcp_servers.some-other-server.url' "$BATS_TEST_TMPDIR/cfg.yaml")
  
  [[ -n "$_sa" ]] || { echo "FAIL: foreign entry removed"; return 1; }
}

@test "delegate has --with-project-mcp flag variable" {
  [[ ! -f scripts/hermes-delegate.sh ]] && skip "Task 4 missing"
  
  grep 'WITH_PROJECT_MCP' scripts/hermes-delegate.sh >/dev/null || return 1
  
  echo "Script contains WITH_PROJECT_MCP variable"
}

@test "delegate has opt-in conditional block" {
  [[ ! -f scripts/hermes-delegate.sh ]] && skip "Task 4 missing"
  
  grep 'WITH_PROJECT_MCP.*==.*true' scripts/hermes-delegate.sh >/dev/null || return 1
  
  echo "Opt-in conditional block exists in script"
}

@test "delegate handles --with-project-mcp command line option" {
  [[ ! -f scripts/hermes-delegate.sh ]] && skip "Task 4 missing"
  
  grep '\-\-with' scripts/hermes-delegate.sh >/dev/null || return 1
  
  echo "Script handles --with option"
}

@test "delegate documents --with-project-mcp in usage" {
  [[ ! -f scripts/hermes-delegate.sh ]] && skip "Task 4 missing"
  
  grep '\-\-with-project-mcp' scripts/hermes-delegate.sh >/dev/null || return 1
  
  echo "Script documents --with-project-mcp option"
}

@test "delegate has proper header and safety settings" {
  [[ ! -f scripts/hermes-delegate.sh ]] && skip "Task 4 missing"
  
  head -1 scripts/hermes-delegate.sh | grep -q '#!/usr/bin/env bash' || return 1
  grep 'set -euo pipefail' scripts/hermes-delegate.sh >/dev/null || return 1
  
  echo "Script has proper header and safety settings"
}

@test "delegate has FATAL error handling for missing hermes binary" {
  [[ ! -f scripts/hermes-delegate.sh ]] && skip "Task 4 missing"
  
  grep 'FATAL.*hermes' scripts/hermes-delegate.sh >/dev/null || return 1
  
  echo "Script has proper error handling for missing hermes binary"
}

@test "delegate uses --cli flag for CLI mode" {
  [[ ! -f scripts/hermes-delegate.sh ]] && skip "Task 4 missing"
  
  grep '\-\-cli' scripts/hermes-delegate.sh >/dev/null || return 1
  
  echo "Script uses --cli flag for hermes invocation"
>>>>>>> fb2ba369c (chore: update test suite and freshness artifacts [T001609])
}
