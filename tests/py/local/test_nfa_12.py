"""Native migration of tests/local/NFA-12.bats."""
import os
import shutil

import pytest

CTX = os.environ.get("BRAINSTORM_CTX", "fleet")
NS = os.environ.get("BRAINSTORM_NS", "workspace")


@pytest.fixture(autouse=True)
def brainstorm_present(run_cmd):
    """Port of the BATS setup(): skip unless kubectl and brainstorm-sish exist."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl required")
    r = run_cmd(
        ["kubectl", "--context", CTX, "-n", NS, "get", "deploy/brainstorm-sish"],
        timeout=300,
    )
    if r.returncode != 0:
        pytest.skip(f"Deployment brainstorm-sish not present in {CTX}/{NS}")


# T2: brainstorm-sish must mount a persistent SSH hostkey so known_hosts
#     entries survive pod restarts. A CM-only /keys mount is insufficient.
def test_nfa_12_t2_brainstorm_sish_persists_ssh_hostkey_across_restarts(run_cmd):
    """NFA-12 T2: brainstorm-sish persists SSH hostkey across restarts"""
    r = run_cmd(
        [
            "kubectl", "--context", CTX, "-n", NS, "get", "deploy/brainstorm-sish",
            "-o", "jsonpath={.spec.template.spec.volumes[*].name}",
        ],
        timeout=300,
    )
    r.check(0)
    vols = r.stdout.strip()
    print(f"volumes: {vols}")
    names = [v for v in vols.split(" ") if v]
    assert any(n in ("hostkey", "hostkeys", "ssh-host-keys") for n in names), vols


# T3: task brainstorm:materialise-keys must be invokable from CLI
#     (internal: true breaks that).
def test_nfa_12_t3_materialise_keys_is_invokable_from_cli(run_cmd, repo_root):
    """NFA-12 T3: brainstorm:materialise-keys is invokable from CLI"""
    if shutil.which("task") is None:
        pytest.skip("go-task required")
    r = run_cmd(
        ["task", "--summary", "brainstorm:materialise-keys"],
        cwd=repo_root,
        timeout=300,
    )
    assert "is internal" not in r.output
