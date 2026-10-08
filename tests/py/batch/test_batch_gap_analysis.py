"""tests/py/batch/test_batch_gap_analysis.py — Migration of tests/batch/batch-gap-analysis.bats."""
import json
import os
from pathlib import Path
import pytest


@pytest.fixture
def mock_kubectl_with_tickets(tmp_path: Path):
    mock_bin = tmp_path / "bin"
    mock_bin.mkdir()
    kubectl = mock_bin / "kubectl"
    kubectl.write_text("""#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then
  echo "pod/shared-db-dev-0"
elif [[ "$*" == *"psql"* ]] || [[ "$*" == *"exec"* ]]; then
  echo '[{"external_id":"T000601","title":"Test Ticket","description":"Baue eine Funktion","brand":"mentolder","priority":"mittel","severity":null}]'
fi
""", encoding="utf-8")
    kubectl.chmod(0o755)
    return mock_bin


@pytest.fixture
def mock_kubectl_empty(tmp_path: Path):
    mock_bin = tmp_path / "bin_empty"
    mock_bin.mkdir()
    kubectl = mock_bin / "kubectl"
    kubectl.write_text("""#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then
  echo "pod/shared-db-dev-0"
elif [[ "$*" == *"psql"* ]] || [[ "$*" == *"exec"* ]]; then
  echo '[]'
fi
""", encoding="utf-8")
    kubectl.chmod(0o755)
    return mock_bin


def test_returns_valid_json_array(mock_kubectl_with_tickets: Path, repo_root: Path, run_cmd):
    """gibt valides JSON-Array zurueck."""
    script = repo_root / "scripts" / "batch-gap-analysis.sh"
    new_path = f"{mock_kubectl_with_tickets}:{os.environ.get('PATH', '')}"
    res = run_cmd(["bash", str(script)], env={"PATH": new_path})
    res.check(0)

    data = json.loads(res.stdout)
    assert isinstance(data, list)


def test_every_element_has_external_id_and_description(
    mock_kubectl_with_tickets: Path, repo_root: Path, run_cmd
):
    """jedes Element hat external_id und description."""
    script = repo_root / "scripts" / "batch-gap-analysis.sh"
    new_path = f"{mock_kubectl_with_tickets}:{os.environ.get('PATH', '')}"
    res = run_cmd(["bash", str(script)], env={"PATH": new_path})
    res.check(0)

    data = json.loads(res.stdout)
    assert len(data) > 0
    for item in data:
        assert "external_id" in item and item["external_id"]
        assert "description" in item and item["description"]


def test_empty_result_when_no_planning_tickets(
    mock_kubectl_empty: Path, repo_root: Path, run_cmd
):
    """leeres Ergebnis wenn keine planning-Tickets."""
    script = repo_root / "scripts" / "batch-gap-analysis.sh"
    new_path = f"{mock_kubectl_empty}:{os.environ.get('PATH', '')}"
    res = run_cmd(["bash", str(script)], env={"PATH": new_path})
    res.check(0)

    output = res.stdout.strip()
    assert output in ("", "[]")
