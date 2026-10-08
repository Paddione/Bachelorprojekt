"""Native migration of tests/spec/decommission/decommission-guard.bats."""

import json
import os
import re
import shutil
from pathlib import Path

import pytest

FACTORY_UNITS = ["factory.timer", "factory.service", "factory-mcp.service"]


def _grep(path: Path, pattern: str, ignorecase: bool = False, fixed: bool = False):
    """Mirror `grep -n`: returns (status, [lines]); status 2 when the file is missing."""
    if not path.is_file():
        return 2, []
    flags = re.I if ignorecase else 0
    rx = re.compile(re.escape(pattern) if fixed else pattern, flags)
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    hits = [f"{i}:{l}" for i, l in enumerate(lines, 1) if rx.search(l)]
    return (0 if hits else 1), hits


def _walk(root: Path, name_filter):
    """Yield files under root (pruning .git) whose name matches name_filter."""
    if not root.exists():
        return
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != ".git"]
        for fn in filenames:
            if name_filter(fn):
                yield Path(dirpath) / fn


def _systemd_user_available(run_cmd) -> bool:
    return run_cmd(["systemctl", "--user", "show-environment"]).returncode == 0


def test_decommission_no_factory_systemd_user_units_are_active(run_cmd):
    if not _systemd_user_available(run_cmd):
        pytest.skip("no systemd --user manager on this host")
    for unit in FACTORY_UNITS:
        res = run_cmd(["systemctl", "--user", "is-active", unit])
        assert res.returncode != 0, f"ACTIVE: {unit} is still running (decommissioned, T900399)"


def test_decommission_no_factory_systemd_user_units_are_enabled(run_cmd):
    if not _systemd_user_available(run_cmd):
        pytest.skip("no systemd --user manager on this host")
    for unit in FACTORY_UNITS:
        res = run_cmd(["systemctl", "--user", "is-enabled", unit])
        assert res.returncode != 0, f"ENABLED: {unit} is still enabled (decommissioned, T900399)"


def test_decommission_no_factory_systemd_user_unit_files_are_installed():
    unit_dir = Path(os.environ.get("HOME", "")) / ".config" / "systemd" / "user"
    for unit in ["factory.service", "factory.timer", "factory-mcp.service"]:
        assert not (unit_dir / unit).exists(), f"LEFTOVER: {unit_dir / unit} still present"


def test_decommission_k3d_dev_stack_kustomization_yaml_has_no_factory_runner_resources(repo_root):
    status, hits = _grep(repo_root / "k3d/dev-stack/kustomization.yaml", "factory-runner")
    assert status != 0, "factory-runner still referenced in k3d/dev-stack/kustomization.yaml:\n" + "\n".join(hits)


def test_decommission_no_factory_runner_manifests_remain_under_k3d(repo_root):
    k3d = repo_root / "k3d"
    leftovers = sorted(
        str(p) for p in list(_walk(k3d, lambda f: f.startswith("factory-runner")))
        + list(_walk(k3d, lambda f: f.startswith("factory-otel")))
    )
    assert not leftovers, "LEFTOVER factory-runner/factory-otel manifests:\n" + "\n".join(leftovers)


def test_decommission_no_kustomization_references_a_removed_factory_manifest(repo_root):
    refs = []
    rx = re.compile(r"factory-runner|factory-otel")
    comment = re.compile(r"^\s*#")
    for path in _walk(repo_root, lambda f: f == "kustomization.yaml"):
        for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if rx.search(line) and not comment.search(line):
                refs.append(f"{path}:{i}:{line}")
    assert not refs, "DANGLING kustomize reference to a removed factory manifest:\n" + "\n".join(refs)


def test_decommission_scripts_factory_no_longer_exists(repo_root):
    d = repo_root / "scripts/factory"
    assert not d.is_dir(), "LEFTOVER: scripts/factory/ still present: " + str(
        [p for p in d.rglob("*") if p.is_file()]
    )


def test_decommission_no_factory_unit_sources_remain_in_the_repo(repo_root):
    names = {"factory.service", "factory.timer", "factory-mcp.service"}
    leftovers = [str(p) for p in _walk(repo_root / "scripts", lambda f: f in names)]
    assert not leftovers, "LEFTOVER factory unit sources:\n" + "\n".join(leftovers)


def test_decommission_scripts_migrate_db_mjs_exists_and_is_the_migration_entrypoint(repo_root):
    path = repo_root / "scripts/migrate-db.mjs"
    assert path.is_file(), "MISSING scripts/migrate-db.mjs"
    assert "'migrations'" in path.read_text(encoding="utf-8"), "scripts/migrate-db.mjs no longer reads the migrations dir"


def test_decommission_api_inventory_runs_without_the_factory_mcp_go_source(run_cmd, repo_root, tmp_path):
    out = tmp_path / "api-inventory.json"
    res = run_cmd(
        ["node", str(repo_root / "scripts/sdlc/api-inventory.mjs")],
        env={"API_INVENTORY_OUT": str(out)},
    )
    assert res.returncode == 0, f"api-inventory.mjs fails without scripts/factory/mcp-go/main.go:\n{res.output}"
    data = json.loads(out.read_text(encoding="utf-8"))
    assert len(data["factoryTools"]) == 0


def test_decommission_the_drop_migration_for_the_factory_tables_is_committed(repo_root):
    path = repo_root / "scripts/migrations/2026-09-26-factory-decommission.sql"
    assert path.is_file(), "MISSING scripts/migrations/2026-09-26-factory-decommission.sql"
    status, _ = _grep(path, "DROP TABLE", ignorecase=True, fixed=True)
    assert status == 0, "decommission migration drops no tables"


def test_decommission_agent_guide_registry_has_no_factory_mcp_or_factory_tooling_entries(repo_root):
    rx_pattern = r"factory-mcp-node|factory-dispatch|factory-steuerung"
    hits = []
    for path in _walk(repo_root / "docs/agent-guide/registry", lambda f: True):
        for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if re.search(rx_pattern, line):
                hits.append(f"{path}:{i}:{line}")
    assert not hits, "LEFTOVER factory entries in docs/agent-guide/registry:\n" + "\n".join(hits)


def test_decommission_taskfile_includes_no_factory_taskfile(repo_root):
    status, hits = _grep(repo_root / "Taskfile.yml", "Taskfile.factory.yml", fixed=True)
    assert status != 0, "Taskfile.yml still includes the factory taskfile:\n" + "\n".join(hits)


def test_decommission_taskfiles_taskfile_agents_yml_has_no_factory_mcp_tasks(repo_root):
    status, hits = _grep(repo_root / "taskfiles/Taskfile.agents.yml", "factory-mcp", fixed=True)
    assert status != 0, "taskfiles/Taskfile.agents.yml still references factory-mcp:\n" + "\n".join(hits)


def test_decommission_cockpit_control_endpoint_reports_decommissioning(repo_root):
    status, _ = _grep(
        repo_root / "components/website/src/pages/sdlc/api/cockpit-control.ts",
        "factory_decommissioned",
        fixed=True,
    )
    assert status == 0, "cockpit-control.ts does not report factory_decommissioned"


def test_decommission_cockpit_force_tick_endpoint_is_removed_t900399_complete(repo_root):
    assert not (repo_root / "components/website/src/pages/sdlc/api/factory/force-tick.ts").exists()


def test_decommission_no_cockpit_endpoint_reads_the_factory_control_table(repo_root):
    base = repo_root / "components/website/src/pages/sdlc/api"
    hits = []
    for path in _walk(base, lambda f: True):
        for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if "factory_control" in line and not re.match(r"^\s*//", line):
                hits.append(f"{path}:{i}:{line}")
    assert not hits, "LEFTOVER factory_control DB access in the cockpit API:\n" + "\n".join(hits)


def test_decommission_the_website_schema_init_no_longer_recreates_factory_control(repo_root):
    status, hits = _grep(
        repo_root / "components/website/src/lib/tickets/tables/cockpit-control.ts",
        "CREATE TABLE IF NOT EXISTS tickets.factory_control",
        fixed=True,
    )
    assert status != 0, "website schema init still creates tickets.factory_control (undoes the DROP migration)"


def test_decommission_the_drop_migration_keeps_the_devflow_phase_event_table(repo_root):
    status, _ = _grep(
        repo_root / "scripts/migrations/2026-09-26-factory-decommission.sql",
        r"DROP TABLE.*factory_phase_events",
        ignorecase=True,
    )
    assert status != 0, "decommission migration drops tickets.factory_phase_events"


def test_decommission_ticket_sh_exposes_no_factory_only_subcommands(repo_root):
    text = (repo_root / "scripts/ticket.sh").read_text(encoding="utf-8", errors="replace")
    for sub in ["unfactory", "factory-control", "dryrun-mark", "dryrun-check"]:
        assert not re.search(rf"^  {re.escape(sub)}\)", text, re.M), (
            f"ticket.sh still dispatches the removed subcommand: {sub}"
        )


def test_decommission_ticket_sh_no_longer_queries_the_dropped_factory_tables(repo_root):
    rx = re.compile(r"tickets\.(factory_control|factory_run_budget|factory_model_slots)")
    comment = re.compile(r"^\s*#")
    hits = []
    for i, line in enumerate((repo_root / "scripts/ticket.sh").read_text(encoding="utf-8").splitlines(), 1):
        if rx.search(line) and not comment.search(line):
            hits.append(f"{i}:{line}")
    assert not hits, "ticket.sh still queries a dropped factory table:\n" + "\n".join(hits)


def test_decommission_release_hold_no_longer_nudges_the_removed_factory_service(repo_root):
    text = (repo_root / "scripts/ticket.sh").read_text(encoding="utf-8", errors="replace")
    assert not re.search(r"systemctl --user start.*factory\.service", text), (
        "ticket.sh release-hold still starts the decommissioned factory.service"
    )


def test_decommission_factory_mcp_node_sources_are_absent(repo_root):
    assert not (repo_root / "scripts/factory-mcp-node").exists()


def test_decommission_hermes_catalog_has_no_factory_mcp_key(repo_root):
    import yaml

    data = yaml.safe_load((repo_root / "scripts/hermes-mcp-servers.yaml").read_text(encoding="utf-8"))
    assert data.get("factory-mcp") is None


def test_decommission_agy_expected_fixture_carries_no_dead_servers(repo_root):
    fixture = repo_root / "docs/agent-guide/registry/expected/agy-mcp-config.json"
    if not fixture.is_file():
        pytest.skip("agy expected fixture not found")
    data = json.loads(fixture.read_text(encoding="utf-8"))
    servers = data["mcpServers"]
    assert (("factory-mcp" in servers) or ("task-master-ai" in servers)) is False


def test_decommission_no_factory_runner_build_workflow_remains(repo_root):
    assert not (repo_root / ".github/workflows/build-factory-runner.yml").is_file(), (
        "LEFTOVER: .github/workflows/build-factory-runner.yml still present"
    )


def test_decommission_no_factory_runner_docker_sources_remain(repo_root):
    d = repo_root / "docker/factory-runner"
    assert not d.is_dir(), f"LEFTOVER: docker/factory-runner/ still present: {[p for p in d.rglob('*') if p.is_file()]}"


def test_decommission_no_live_reference_to_the_factory_runner_image_remains(repo_root):
    hits = []
    for sub in [".github", "k3d", "fleet", "prod-fleet", "docker"]:
        for path in _walk(repo_root / sub, lambda f: True):
            for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if "paddione/factory-runner" in line and not re.match(r"^\s*#", line):
                    hits.append(f"{path}:{i}:{line}")
    assert not hits, "LEFTOVER factory-runner image reference:\n" + "\n".join(hits)
