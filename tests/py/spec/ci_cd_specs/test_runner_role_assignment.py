"""Native assertions from tests/spec/ci-cd/runner-role-assignment.bats."""

import pytest
import yaml


def write_workflow(directory, file, job, runner):
    (directory / file).write_text(yaml.safe_dump({"name": "Fixture", "on": ["push"], "jobs": {job: {"runs-on": runner, "steps": [{"run": "echo hi"}]}}}))

@pytest.mark.parametrize(("file", "job", "runner", "needles"), [
    ("generic.yml", "build-thing", ["self-hosted", "linux", "x64"], ["generic.yml", "build-thing"]),
    ("unknown.yml", "gpu-thing", ["self-hosted", "quantum-annealer"], ["quantum-annealer"]),
    ("expr.yml", "dynamic-job", "${{ matrix.runner }}", ["dynamic-job"]),
])
def test_invalid_runner_rejected(repo_root, run_cmd, tmp_path, file, job, runner, needles):
    guard = repo_root / "scripts/ci/runner-placement-check.sh"
    write_workflow(tmp_path, "valid.yml", "portable-job", "ubuntu-latest")
    run_cmd(["bash", str(guard), str(tmp_path)]).check()
    write_workflow(tmp_path, file, job, runner)
    result = run_cmd(["bash", str(guard), str(tmp_path)])
    assert result.returncode != 0
    for needle in needles:
        assert needle in result.output


def test_new_job_detected_without_allowlist(repo_root, run_cmd, tmp_path):
    guard = repo_root / "scripts/ci/runner-placement-check.sh"
    write_workflow(tmp_path, "clean.yml", "portable-job", "ubuntu-latest")
    run_cmd(["bash", str(guard), str(tmp_path)]).check()
    source = yaml.safe_load((tmp_path / "clean.yml").read_text())
    source["jobs"]["brand-new-job"] = {"runs-on": ["self-hosted", "linux", "x64"], "steps": [{"run": "echo hi"}]}
    (tmp_path / "clean.yml").write_text(yaml.safe_dump(source))
    result = run_cmd(["bash", str(guard), str(tmp_path)])
    assert result.returncode != 0
    assert "brand-new-job" in result.output


def test_declared_capability_passes(repo_root, run_cmd, tmp_path):
    write_workflow(tmp_path, "gpu.yml", "gpu-job", ["self-hosted", "fleet-gpu"])
    run_cmd(["bash", str(repo_root / "scripts/ci/runner-placement-check.sh"), str(tmp_path)]).check()


def test_real_workflows_pass(repo_root, run_cmd):
    run_cmd(["bash", str(repo_root / "scripts/ci/runner-placement-check.sh"), str(repo_root / ".github/workflows")]).check()


def test_arbitration_opencode_positive_capability_anchor(repo_root):
    for file in ["arbitration", "opencode"]:
        workflow = yaml.safe_load((repo_root / f".github/workflows/{file}.yml").read_text())
        runners = [job["runs-on"] for job in workflow["jobs"].values()]
        assert any("self-hosted" in runner for runner in runners)
        assert any("fleet-gpu" in runner for runner in runners)
