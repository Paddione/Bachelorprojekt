"""Offline tests for the live-host E2E probe (scripts/domains-probe.mjs).

CI-safe: only --validate-only (schema + placeholder resolution), no network.
The real SKIP semantics (devmesh ENOTFOUND) are covered by the manual
live run (task domains:probe from a Tailnet host), not mocked here.
"""
import os
import subprocess
import tempfile
from pathlib import Path


def _repo_root():
    return str(Path(__file__).resolve().parents[5])


def _run_probe(args, cwd):
    return subprocess.run(
        ['node', 'scripts/domains-probe.mjs'] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
    )


def test_validate_only_passes():
    """Real registry validates clean (schema + placeholder resolution)."""
    repo_root = _repo_root()
    reg_path = os.path.join(repo_root, 'docs/agent-guide/registry/domains.yaml')
    import pytest
    if not os.path.exists(reg_path):
        pytest.skip("docs/agent-guide/registry/domains.yaml is absent")
    if not os.path.exists(os.path.join(repo_root, 'scripts/domains-probe.mjs')):
        pytest.fail("scripts/domains-probe.mjs is missing")
    result = _run_probe(['--validate-only'], repo_root)
    assert result.returncode == 0, f"domains-probe --validate-only failed: {result.stderr}"


def test_invalid_fixtures_fail(tmp_path):
    """Live entry without expect, or with unresolvable placeholder, fails."""
    repo_root = _repo_root()
    base = """
domains:
  - id: {eid}
    host: "{host}"
    cluster: {cluster}
    namespace: ns
    paths: ["/"]
    service: svc:80
    auth: open
    owner_frontend: bp-ship
    functions: [frontend]
    status: live
    manifest_source: prod-fleet/mentolder/studio-ingress.yaml
{expect}
"""
    # (a) live entry without expect block
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False, dir=str(tmp_path)) as f:
        f.write(base.format(eid='no-expect', host='a.example.de', cluster='fleet', expect=''))
        path_a = f.name
    result = _run_probe(['--registry', path_a, '--validate-only'], repo_root)
    assert result.returncode != 0, f"missing-expect fixture should fail, got {result.returncode}"

    # (b) unresolvable placeholder
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False, dir=str(tmp_path)) as f:
        f.write(base.format(
            eid='unresolvable', host='${UNAUFLOESBAR}.example.de', cluster='fleet',
            expect='    expect:\n      status: [200]\n'))
        path_b = f.name
    result = _run_probe(['--registry', path_b, '--validate-only'], repo_root)
    assert result.returncode != 0, f"unresolvable-placeholder fixture should fail, got {result.returncode}"


def test_devmesh_skip_semantik(tmp_path):
    """--cluster fleet on a devmesh-only fixture ends with 0 FAIL (offline)."""
    repo_root = _repo_root()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False, dir=str(tmp_path)) as f:
        f.write("""
domains:
  - id: devmesh-only
    host: web.devmesh.example.de
    cluster: devmesh
    namespace: ns
    paths: ["/"]
    service: svc:80
    auth: open
    owner_frontend: bp-ship
    functions: [frontend]
    status: live
    manifest_source: dev-local/core/ingress.yaml
    expect:
      status: [200]
""")
        path = f.name
    result = _run_probe(['--registry', path, '--validate-only', '--cluster', 'fleet'], repo_root)
    assert result.returncode == 0, f"cluster-filtered run should exit 0: {result.stderr}"
    assert '0 FAIL' in (result.stdout + result.stderr), "summary must report 0 FAIL"
