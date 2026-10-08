"""Native migration of tests/spec/hermes-mcp-access.bats."""
# Hinweis: Das Original laedt tests/spec/test_helper.bash (-> tests/local/test_helper.bash,
# bats-support/bats-assert). Keine dieser Hilfsfunktionen wird im Test verwendet; der
# Port nutzt sie daher nicht (Regel 5).

import os
import re
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

DENYLIST_MAP = """
mcp-kubernetes:pods_delete,pods_exec,pods_run,resources_delete,resources_create_or_update,resources_scale
codebase-memory-mcp:delete_project,index_repository,ingest_traces,manage_adr
ticket-mcp:create_ticket,enqueue_ticket,transition_status,triage_ticket,update_fields,set_readiness_flag,set_touched_files,set_plan_meta,stage_plan,archive_plan,link_tickets,record_grill_answers,record_phase_event,report_mishap,flush_mishap_buffer,add_comment,add_pr_link,backfill_ticket_id
mcp-task-runner:execute_plan,run_task,run_task_async,cancel_task
warden:keychain_create_attachment,keychain_create_card,keychain_create_folder,keychain_create_identity,keychain_create_login,keychain_create_logins,keychain_create_note,keychain_create_org_collection,keychain_create_ssh_key,keychain_delete_attachment,keychain_delete_folder,keychain_delete_item,keychain_delete_items,keychain_delete_org_collection,keychain_edit_folder,keychain_edit_org_collection,keychain_move_item_to_organization,keychain_restore_item,keychain_send_create,keychain_send_create_encoded,keychain_send_delete,keychain_send_edit,keychain_send_remove_password,keychain_set_login_uris,keychain_update_item
"""

EXPECTED_SERVERS = "mcp-postgres mcp-kubernetes codebase-memory-mcp mcp-task-runner ticket-mcp bge-mcp context7 warden".split()

HERMES_STUB = """#!/bin/bash
# Stub that prints its argv — empty args rendered as "" for grep matching
printf "hermes"
for a in "$@"; do
  if [[ -z "$a" ]]; then
    printf ' ""'
  else
    printf " %s" "$a"
  fi
done
printf "\\n"
"""


def _tool_word_in(tool: str, text: str) -> bool:
    """grep -qw: Treffer nur als ganzes Wort (Wortzeichen: [A-Za-z0-9_])."""
    return re.search(r"(?<![A-Za-z0-9_])" + re.escape(tool) + r"(?![A-Za-z0-9_])", text) is not None


@pytest.fixture
def hx(repo_root, tmp_path):
    cfg = tmp_path / "config.yaml"
    fixtures = repo_root / "tests/fixtures/hermes"
    # setup(): config-empty.yaml bevorzugt, sonst config-foreign.yaml.
    for name in ("config-empty.yaml", "config-foreign.yaml"):
        if (fixtures / name).is_file():
            shutil.copy(fixtures / name, cfg)
            break
    return {
        "repo": repo_root,
        "registry": repo_root / "scripts/hermes-mcp-servers.yaml",
        "provision": repo_root / "scripts/hermes-mcp-provision.sh",
        "delegate": repo_root / "scripts/hermes-delegate.sh",
        "fixtures": fixtures,
        "cfg": cfg,
        "tmp": tmp_path,
    }


def _yq(run_cmd, hx, expr: str, path=None) -> str:
    res = run_cmd(["yq", expr, str(path or hx["registry"])], cwd=hx["repo"])
    return res.stdout.rstrip("\n")


def _sha(p: Path) -> str:
    import hashlib
    return hashlib.sha256(p.read_bytes()).hexdigest()


def test_registry_lists_all_catalog_servers(run_cmd, hx):
    _yq(run_cmd, hx, "keys | .[]")  # run yq 'keys | .[]' — Ausgabe nicht ausgewertet

    count = 0
    for server in EXPECTED_SERVERS:
        res = run_cmd(["yq", f".{server}", str(hx["registry"])], cwd=hx["repo"])
        if res.returncode == 0:
            count += 1
    assert count == 8, f"Found {count} servers (expected 8)"

    # Jeder Server hat mindestens url oder command.
    for server in EXPECTED_SERVERS:
        data = _yq(run_cmd, hx, f".{server}")
        has_url = re.search(r"^url:", data, re.MULTILINE) is not None
        has_command = re.search(r"^command:", data, re.MULTILINE) is not None
        assert has_url or has_command, f"Server '{server}' has neither url nor command"


def test_denylist_covers_known_destructive_tools(run_cmd, hx):
    for line in DENYLIST_MAP.split("\n"):
        if not line:
            continue
        server, _, tools = line.partition(":")
        exclude = _yq(run_cmd, hx, f".{server}.tools.exclude[]").replace("\n", ",")
        assert exclude and exclude != "null", f"Server '{server}' missing tools.exclude key"
        for tool in tools.split(","):
            if not tool:
                continue
            assert _tool_word_in(tool, exclude), f"Server '{server}' missing exclude: {tool}"
    pg = _yq(run_cmd, hx, ".mcp-postgres.tools.exclude")
    assert pg == "null", f"mcp-postgres should have no tools.exclude key (server-side read-only). Got: {pg}"


def test_mcp_postgres_has_no_denylist(run_cmd, hx):
    pg = _yq(run_cmd, hx, ".mcp-postgres.tools.exclude")
    assert pg == "null", f"mcp-postgres has a tools.exclude (expected null). Got: {pg}"


def test_dry_run_does_not_modify_the_target_config(run_cmd, hx):
    if not hx["provision"].is_file():
        pytest.skip(f"{hx['provision']} missing (Task 3 not yet implemented)")
    if run_cmd([str(hx["provision"]), "--help"], cwd=hx["repo"]).returncode != 0:
        pytest.skip(f"{hx['provision']} cannot execute (CI limitation)")

    before = _sha(hx["cfg"])
    run_cmd([str(hx["provision"]), "--dry-run", "--config", str(hx["cfg"])], cwd=hx["repo"])
    out = run_cmd([str(hx["provision"]), "--dry-run", "--config", str(hx["cfg"])], cwd=hx["repo"])
    assert "mcp_servers" in out.stdout, "dry-run output should contain 'mcp_servers'"
    after = _sha(hx["cfg"])
    assert before == after, f"Config modified by dry-run (before: {before}, after: {after})"


def test_provisioning_is_idempotent(run_cmd, hx):
    if not hx["provision"].is_file():
        pytest.skip(f"{hx['provision']} missing (Task 3 not yet implemented)")
    result1 = _yq(run_cmd, hx, ".mcp_servers", hx["cfg"])
    run_cmd([str(hx["provision"]), "--config", str(hx["cfg"])], cwd=hx["repo"])
    result2 = _yq(run_cmd, hx, ".mcp_servers", hx["cfg"])
    assert result1 == result2, "Idempotency failed: results differ between runs"


def test_provisioning_preserves_unrelated_keys(run_cmd, hx):
    if not hx["provision"].is_file():
        pytest.skip(f"{hx['provision']} missing (Task 3 not yet implemented)")
    shutil.copy(hx["fixtures"] / "config-foreign.yaml", hx["cfg"])
    model_before = _yq(run_cmd, hx, ".model", hx["cfg"])
    run_cmd([str(hx["provision"]), "--config", str(hx["cfg"])], cwd=hx["repo"])
    assert _yq(run_cmd, hx, ".model", hx["cfg"]) == model_before, \
        f"Unrelated key 'model' was modified (was: {model_before})"
    foreign = _yq(run_cmd, hx, ".mcp_servers.some-other-server.url", hx["cfg"])
    assert foreign != "", "Foreign mcp_servers entry was removed"


def _hermes_stub(hx) -> Path:
    stub = hx["tmp"] / "hermes-stub"
    stub.write_text(HERMES_STUB)
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return stub


def _delegate(run_cmd, hx, *args):
    env = {"HERMES": str(_hermes_stub(hx))}
    res = run_cmd([str(hx["delegate"]), *args], cwd=hx["repo"], env=env)
    return res.stdout.strip()


def test_hermes_delegate_sh_defaults_to_no_tool_access_without_with_project_mcp_flag(run_cmd, hx):
    if not hx["delegate"].is_file():
        pytest.skip("hermes-delegate.sh missing (Task 4 not yet implemented)")
    output = _delegate(run_cmd, hx, "test prompt")
    assert re.search(r'hermes.*-t ""', output), \
        f'Default delegate invocation should use \'-t ""\' for no tool access. Got: {output}'


def test_hermes_delegate_sh_with_project_mcp_does_not_force_t(run_cmd, hx):
    if not hx["delegate"].is_file():
        pytest.skip("hermes-delegate.sh missing (Task 4 not yet implemented)")
    output = _delegate(run_cmd, hx, "test prompt", "--with-project-mcp")
    # grep -qv: mindestens eine Zeile, die NICHT passt.
    assert any(not re.search(r'hermes.*-t ""', ln) for ln in output.splitlines()), \
        f'Delegate opt-in path incorrectly forces \'-t ""\'. Got: {output}'


def test_delegate_uses_cli_flag_for_cli_mode(hx):
    if not hx["delegate"].is_file():
        pytest.skip("Task 4 missing")
    assert "--cli" in hx["delegate"].read_text()
