"""Tests migrating ci-cd specs to pytest."""

import subprocess
from pathlib import Path
import pytest


def _run_bats(repo_root: Path, bats_file: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bats", bats_file],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )


def test_branch_reaper_empty_answer_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-empty-answer.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-empty-answer.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-empty-answer.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_freshness_regen_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-freshness-regen.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-freshness-regen.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-freshness-regen.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_local_ref_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-local-ref.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-local-ref.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-local-ref.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_merged_pr_signal_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_sweep_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-sweep.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-sweep.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-sweep.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_undecided_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-undecided.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-undecided.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-undecided.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_unknown_ticket_merged_pr_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_unmerged_keep_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-unmerged-keep.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-unmerged-keep.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-unmerged-keep.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_changed_tests_collection_parity_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/changed-tests-collection-parity.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/changed-tests-collection-parity.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/changed-tests-collection-parity.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_changed_tests_env_hermetic_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/changed-tests-env-hermetic.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/changed-tests-env-hermetic.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/changed-tests-env-hermetic.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_changed_tests_uncommitted_diff_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/changed-tests-uncommitted-diff.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/changed-tests-uncommitted-diff.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/changed-tests-uncommitted-diff.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_devflow_ci_watch_merged_exit_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devflow_ci_watch_rollup_headsha_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devflow_ci_watch_run_lookup_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devflow_ciwatch_ticket_path_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_pr_refresh_batch_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/pr-refresh-batch.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/pr-refresh-batch.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/pr-refresh-batch.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pre_push_artifact_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/pre-push-artifact-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/pre-push-artifact-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/pre-push-artifact-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pre_push_scope_base_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/pre-push-scope-base.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/pre-push-scope-base.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/pre-push-scope-base.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_skip_ci_marker_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/skip-ci-marker-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/skip-ci-marker-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/skip-ci-marker-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_spec_dir_convention_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-dir-convention.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-dir-convention.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-dir-convention.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_spec_shard_partition_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-shard-partition.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-shard-partition.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-shard-partition.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_spec_tracked_file_guard_isolation_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_spec_tracked_file_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-tracked-file-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-tracked-file-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-tracked-file-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_test_inventory_coverage_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/test-inventory-coverage.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/test-inventory-coverage.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/test-inventory-coverage.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


