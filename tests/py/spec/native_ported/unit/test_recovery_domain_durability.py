"""Native migration of tests/unit/recovery-domain-durability.bats."""
import re
from pathlib import Path

import pytest


def _grep_file(path: Path, pattern: str, regex: bool = False) -> bool:
    """Emulate grep -q on one file. A missing file counts as no match (grep exit 2)."""
    if not path.is_file():
        return False
    for line in path.read_text(encoding="utf-8").splitlines():
        if (re.search(pattern, line) if regex else pattern in line):
            return True
    return False


@pytest.fixture
def paths(repo_root: Path) -> dict:
    return {
        "prod_domains": repo_root / "prod" / "configmap-domains.yaml",
        "taskfile": repo_root / "Taskfile.yml",
        "taskfiles_dir": repo_root / "taskfiles",
        "br": repo_root / "scripts" / "backup-restore.sh",
        "browser": repo_root / "k3d" / "recovery-browser.yaml",
    }


def test_prod_domain_config_defines_recover_domain(paths):
    assert _grep_file(paths["prod_domains"], r"^[ \t]+RECOVER_DOMAIN:", regex=True)


def test_prod_deploy_envsubst_list_includes_recover_domain(paths):
    candidates = [paths["taskfile"]]
    if paths["taskfiles_dir"].is_dir():
        candidates += [p for p in paths["taskfiles_dir"].rglob("*") if p.is_file()]
    assert any(_grep_file(p, r"ENVSUBST_VARS=.*RECOVER_DOMAIN", regex=True) for p in candidates)


def test_backup_restore_sh_renders_recovery_browser_yaml_through_envsubst(paths):
    assert _grep_file(paths["br"], "envsubst")


def test_backup_restore_sh_browse_no_longer_applies_recovery_browser_yaml_raw(paths):
    # Positiv-Anker: das Skript muss existieren, sonst ist die Negativ-Aussage vakuos.
    assert paths["br"].is_file()
    assert not _grep_file(paths["br"], '$KC apply -n "$NS" -f "$MANIFEST"')


def test_recovery_browser_yaml_still_parameterizes_host_with_recover_domain(paths):
    assert _grep_file(paths["browser"], "host: ${RECOVER_DOMAIN}")
