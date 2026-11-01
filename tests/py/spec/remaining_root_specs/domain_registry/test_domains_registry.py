"""Test domain registry validation using domains-check.mjs CLI.

This file tests the validation logic for docs/agent-guide/registry/domains.yaml
via the domains-check.mjs CLI tool.
"""
import os
import subprocess
import tempfile
import pytest
from pathlib import Path


def test_real_registry_passes(tmp_path):
    """Verify the domains-check.mjs tool validates real domains.yaml without errors.

    Runs: node scripts/domains-check.mjs (cwd=repo root)
    Asserts exit 0 unless domains.yaml is absent.
    """
    repo_root = str(Path(__file__).resolve().parents[5])
    
    # Skip if registry is missing
    reg_path = os.path.join(repo_root, 'docs/agent-guide/registry/domains.yaml')
    if not os.path.exists(reg_path):
        pytest.skip("docs/agent-guide/registry/domains.yaml is absent")

    # Run domains-check.mjs from repo root
    result = subprocess.run(
        ['node', 'scripts/domains-check.mjs'],
        cwd=repo_root,
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, f"domains-check.mjs validation failed: {result.stderr}"


def test_emit_map_writes_flowchart(tmp_path):
    """Verify domains-check.mjs --emit-map writes a flowchart to domains-map.md.

    Runs: node scripts/domains-check.mjs --emit-map
    Asserts exit 0 and that docs/agent-guide/maps/domains-map.md contains:
      - 'flowchart LR'
      - 'Funktion'
    """
    repo_root = str(Path(__file__).resolve().parents[5])
    
    # Run domains-check.mjs --emit-map
    result = subprocess.run(
        ['node', 'scripts/domains-check.mjs', '--emit-map'],
        cwd=repo_root,
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, f"domains-check.mjs --emit-map failed: {result.stderr}"

    # Read the output file
    map_path = os.path.join(repo_root, 'docs/agent-guide/maps/domains-map.md')
    with open(map_path, 'r', errors='ignore') as f:
        content = f.read()

    # Assert required patterns are present
    assert 'flowchart LR' in content, "Generated map does not contain 'flowchart LR' header"
    assert 'Funktion' in content, "Generated map does not contain 'Funktion' entry"


def test_invalid_fixtures_fail(tmp_path):
    """Verify that invalid fixtures cause domains-check.mjs to exit non-zero.

    Creates two invalid YAML fixtures:
      1. Missing 'host' key
      2. Multiple same-cluster/same-function entries without decision key

    Asserts each run exits non-zero via: node scripts/domains-check.mjs --registry <tmp> --skip-manifest-scan
    """
    repo_root = str(Path(__file__).resolve().parents[5])

    # Create fixture 1: missing required 'host' key
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        f.write("""
domains:
  - id: invalid-host
    cluster: fleet
    service: service:80
    name: test
    status: live
    functions:
      - frontend
""")
        temp_path1 = f.name

    result = subprocess.run(
        ['node', 'scripts/domains-check.mjs', '--registry', temp_path1, '--skip-manifest-scan'],
        cwd=repo_root,
        capture_output=True,
        text=True
    )
    assert result.returncode != 0, f"Missing-host fixture should fail validation. Got exit {result.returncode}"
    os.unlink(temp_path1)

    # Create fixture 2: two live entries, same cluster, same function, no decision
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False, dir=str(tmp_path)) as f:
        f.write("""
domains:
  - id: dup-a
    host: a.example.de
    cluster: fleet
    namespace: ns-a
    paths: ["/"]
    service: a:80
    auth: open
    owner_frontend: bp-ship
    functions: [frontend]
    status: live
    manifest_source: prod-fleet/mentolder/studio-ingress.yaml
  - id: dup-b
    host: b.example.de
    cluster: fleet
    namespace: ns-b
    paths: ["/"]
    service: b:80
    auth: open
    owner_frontend: bp-ship
    functions: [frontend]
    status: live
    manifest_source: prod-fleet/mentolder/studio-ingress.yaml
""")
        temp_path2 = f.name

    result = subprocess.run(
        ['node', 'scripts/domains-check.mjs', '--registry', temp_path2, '--skip-manifest-scan'],
        cwd=repo_root,
        capture_output=True,
        text=True
    )
    assert result.returncode != 0, f"Missing-decision fixture should fail validation. Got exit {result.returncode}"
