"""Native migration of tests/unit/fleet-phase2b.bats."""
import re
from pathlib import Path

import pytest

TOP_LEVEL_KEY = re.compile(r"^  [a-z].*:$")


def _read(path: Path) -> list:
    assert path.is_file(), f"missing {path}"
    return path.read_text(encoding="utf-8").splitlines()


def _awk_block(lines, is_start, is_excluded):
    """Emulate the awk idiom used by the BATS block extraction.

    Start at the first line matching is_start; stop before the next 2-space
    indented `key:` line that is not excluded.
    """
    active = False
    seen = False
    out = []
    for line in lines:
        if is_start(line):
            active = True
        if active and TOP_LEVEL_KEY.match(line) and not is_excluded(line) and seen:
            break
        if active:
            out.append(line)
            seen = True
    return out


def _grep_q(lines, regex: str) -> bool:
    """grep -q with a regex: matches when any single line matches."""
    return any(re.search(regex, line) for line in lines)


def _first_line_no(block, needle):
    for idx, line in enumerate(block, start=1):
        if needle in line:
            return idx
    return None


def _last_line_no(block, needle):
    found = None
    for idx, line in enumerate(block, start=1):
        if needle in line:
            found = idx
    return found


@pytest.fixture
def platform(repo_root):
    return _read(repo_root / "taskfiles" / "Taskfile.platform.yml")


@pytest.fixture
def workspace(repo_root):
    return _read(repo_root / "taskfiles" / "Taskfile.workspace.yml")


def _deploy_brand_block(platform):
    return _awk_block(
        platform,
        lambda l: l.startswith("  fleet:deploy:brand:"),
        lambda l: "fleet:deploy:brand:" in l,
    )


def _deploy_block(platform):
    return _awk_block(
        platform,
        lambda l: l.startswith("  fleet:deploy:") and l.endswith("fleet:deploy:"),
        lambda l: l.endswith("fleet:deploy:"),
    )


def test_fleet_shared_services_task_exists(platform):
    assert _grep_q(platform, r"^\s+fleet:shared-services:")


def test_fleet_talk_setup_brand_task_exists(platform):
    assert _grep_q(platform, r"^\s+fleet:talk-setup:brand:")


def test_fleet_deploy_brand_runs_workspace_deploy_and_post_setup_but_not_talk_setup(platform):
    block = "\n".join(_deploy_brand_block(platform))
    assert "workspace:deploy" in block
    assert "workspace:post-setup" in block
    assert "talk-setup" not in block


def test_fleet_deploy_deploys_shared_services_exactly_once_not_per_brand(platform):
    block = _deploy_block(platform)
    count = sum(1 for line in block if "fleet:shared-services" in line)
    assert count == 1


def test_fleet_deploy_orders_shared_services_after_both_brand_deploys_before_talk_setup(platform):
    block = _deploy_block(platform)
    shared_line = _first_line_no(block, "fleet:shared-services")
    talk_line = _first_line_no(block, "fleet:talk-setup:brand")
    brand_line = _last_line_no(block, "fleet:deploy:brand")
    assert None not in (shared_line, talk_line, brand_line)
    assert brand_line < shared_line
    assert shared_line < talk_line


def test_workspace_deploy_gates_its_embedded_talk_setup_behind_skip_talk_setup(workspace):
    block = "\n".join(
        _awk_block(
            workspace,
            lambda l: l == "  workspace:deploy:",
            lambda l: l.endswith("workspace:deploy:"),
        )
    )
    # the block still invokes talk-setup ...
    assert "workspace:talk-setup" in block
    # ... but only when SKIP_TALK_SETUP is not "true"
    assert "SKIP_TALK_SETUP" in block


def test_fleet_deploy_brand_passes_skip_talk_setup_true_so_brand_core_skips_talk_setup(platform):
    block = "\n".join(_deploy_brand_block(platform))
    assert "SKIP_TALK_SETUP" in block


def test_fleet_mentolder_env_uses_mentolder_de_as_prod_domain_not_staging_fleet_m_infix(repo_root):
    lines = [l for l in _read(repo_root / "environments" / "fleet-mentolder.yaml") if "PROD_DOMAIN" in l]
    assert _grep_q(lines, "mentolder.de")
    assert not _grep_q(lines, "fleet-m.korczewski.de")


def test_fleet_korczewski_env_uses_korczewski_de_as_prod_domain_not_staging_fleet_infix(repo_root):
    lines = [l for l in _read(repo_root / "environments" / "fleet-korczewski.yaml") if "PROD_DOMAIN" in l]
    assert _grep_q(lines, "korczewski.de")
    assert not _grep_q(lines, r"fleet\.korczewski\.de")


def test_fleet_mentolder_env_has_no_remaining_fleet_m_korczewski_de_references(repo_root):
    lines = _read(repo_root / "environments" / "fleet-mentolder.yaml")
    assert not _grep_q(lines, r"fleet-m\.korczewski\.de")


def test_fleet_korczewski_env_has_no_remaining_fleet_korczewski_de_references(repo_root):
    lines = _read(repo_root / "environments" / "fleet-korczewski.yaml")
    assert not _grep_q(lines, r"fleet\.korczewski\.de")


def test_cert_install_wires_ipv64_api_key_into_the_lego_webhook_not_just_cert_secret(platform):
    block = _awk_block(
        platform,
        lambda l: l.startswith("  cert:install:"),
        lambda l: "cert:install:" in l,
    )
    # injects the key from the existing secret into the webhook deployment
    assert _grep_q(block, "cert-manager-lego-webhook")
    assert _grep_q(block, r"set env .*(--from=secret/ipv64-api-key|IPV64_API_KEY)")
