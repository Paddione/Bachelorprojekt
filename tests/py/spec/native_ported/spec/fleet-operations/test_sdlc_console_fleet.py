"""Native migration of tests/spec/fleet-operations/sdlc-console-fleet.bats."""
from pathlib import Path


def test_no_manual_bridge_ip_endpoints_hack_remains_in_the_repo_manifests(repo_root):
    k3d = repo_root / "k3d"
    referenced = [
        str(p) for p in sorted(k3d.rglob("*"))
        if p.is_file() and "llm-proxy-host" in p.read_bytes().decode("utf-8", errors="replace")
    ]
    assert not referenced, "hack still referenced in:\n" + "\n".join(referenced)
    assert not (repo_root / "k3d" / "sdlc-stack" / "llm-proxy-host.yaml").is_file()


def test_fleet_console_starts_with_llm_disabled_fail_closed_and_independent_readiness(repo_root):
    f = repo_root / "k3d" / "dev-stack" / "sdlc-console.yaml"
    assert f.is_file()
    text = f.read_text(encoding="utf-8")
    assert 'LLM_ENABLED: "false"' in text
    # Readiness haengt nicht am LLM-Endpoint:
    assert "path: /api/health" in text
    assert "llm-proxy-host" not in text


def test_fleet_console_uses_dev_stack_db_and_placeholder_secrets_pattern(repo_root):
    f = repo_root / "k3d" / "dev-stack" / "sdlc-console.yaml"
    text = f.read_text(encoding="utf-8") if f.is_file() else ""
    assert "shared-db-dev:5432" in text
    assert "name: sdlc-console-placeholders" in text
    assert (repo_root / "k3d" / "dev-stack" / "sdlc-console-secrets.yaml").is_file()
    assert (repo_root / "k3d" / "dev-stack" / "sdlc-console-rbac.yaml").is_file()
