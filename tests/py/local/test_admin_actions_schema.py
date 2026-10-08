"""Native migration of tests/local/admin-actions-schema.bats."""
import re
import shutil
from pathlib import Path

import pytest

MIGRATION = "components/website/src/db/migrations/20260525_admin_actions.sql"
CRONJOBS = "k3d/admin-actions-cronjobs.yaml"
KUSTOMIZATION = "k3d/kustomization.yaml"


def _pg_pod(run_cmd, repo_root):
    """Return the shared-db pod name, skipping when no cluster is reachable."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    res = run_cmd(
        "kubectl get pod -n workspace -l app=shared-db -o name | head -1",
        cwd=repo_root,
        timeout=300,
    )
    pod = res.stdout.strip()
    if res.returncode != 0 or not pod:
        pytest.skip("no shared-db pod reachable (cluster unavailable)")
    return pod


def _grep_after(text, needle, after):
    """Emulate `grep -A<after> <needle>`: lines matching needle plus the N lines following."""
    lines = text.splitlines()
    out = []
    for idx, line in enumerate(lines):
        if needle in line:
            out.extend(lines[idx: idx + after + 1])
    return "\n".join(out)


def test_admin_actions_migration_exists(repo_root):
    assert (repo_root / MIGRATION).is_file()


def test_admin_actions_table_can_be_created_from_migration(run_cmd, repo_root):
    pod = _pg_pod(run_cmd, repo_root)
    res = run_cmd(
        [
            "kubectl", "exec", pod, "-c", "postgres", "-n", "workspace", "--",
            "psql", "-U", "website", "-d", "website", "-At", "-c",
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name='admin_actions');",
        ],
        cwd=repo_root,
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert res.output == "t"


def test_admin_actions_check_constraint_rejects_invalid_status(run_cmd, repo_root):
    pod = _pg_pod(run_cmd, repo_root)
    res = run_cmd(
        [
            "kubectl", "exec", pod, "-c", "postgres", "-n", "workspace", "--",
            "psql", "-U", "website", "-d", "website", "-c",
            "INSERT INTO public.admin_actions (actor, action, status) "
            "VALUES ('test', 'test', 'INVALID');",
        ],
        cwd=repo_root,
        timeout=300,
    )
    assert res.returncode != 0, res.output


def test_admin_actions_concurrent_idx_partial_index_exists(run_cmd, repo_root):
    pod = _pg_pod(run_cmd, repo_root)
    res = run_cmd(
        [
            "kubectl", "exec", pod, "-c", "postgres", "-n", "workspace", "--",
            "psql", "-U", "website", "-d", "website", "-tAc",
            "SELECT 1 FROM pg_indexes WHERE indexname = 'admin_actions_concurrent_idx';",
        ],
        cwd=repo_root,
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert res.output == "1"


def test_admin_actions_cronjobs_manifest_exists(repo_root):
    assert (repo_root / CRONJOBS).is_file()


def test_k3d_kustomization_includes_admin_actions_cronjobs(repo_root):
    assert "admin-actions-cronjobs.yaml" in (repo_root / KUSTOMIZATION).read_text(encoding="utf-8")


def test_stale_cleanup_cronjob_has_correct_schedule_every_30_min(repo_root):
    text = (repo_root / CRONJOBS).read_text(encoding="utf-8")
    window = _grep_after(text, "name: admin-actions-cleanup", 10)
    assert 'schedule: "*/30 * * * *"' in window


def test_prune_cronjob_has_correct_schedule_daily_0400(repo_root):
    text = (repo_root / CRONJOBS).read_text(encoding="utf-8")
    window = _grep_after(text, "name: admin-actions-prune", 10)
    assert 'schedule: "0 4 * * *"' in window
