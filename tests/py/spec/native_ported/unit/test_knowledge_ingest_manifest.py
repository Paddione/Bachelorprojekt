"""Native migration of tests/unit/knowledge-ingest-manifest.bats."""
import shutil
import subprocess

import pytest


@pytest.fixture(scope="module")
def rendered(repo_root):
    """`kubectl kustomize k3d/` output, stdout and stderr merged (setup_file equivalent)."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl is not installed")
    result = subprocess.run(
        [
            "kubectl",
            "kustomize",
            str(repo_root / "k3d"),
            "--load-restrictor=LoadRestrictionsNone",
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    return result.stdout + result.stderr


def test_knowledge_ingest_init_containers_do_not_install_directly_in_scripts_readonly_mount(rendered):
    # The broken command should NOT be found.
    assert "cd /scripts && npm install pg --no-package-lock --silent" not in rendered


def test_knowledge_ingest_init_containers_use_prefix_tmp_for_npm_install(rendered):
    # The fix command SHOULD be found.
    assert "--prefix /tmp" in rendered
    assert "cp -r /tmp/node_modules/*" in rendered
