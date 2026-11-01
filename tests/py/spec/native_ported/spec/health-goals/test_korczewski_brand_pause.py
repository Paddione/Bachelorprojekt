"""Native migration of tests/spec/health-goals/korczewski-brand-pause.bats."""

import json
import re
import shutil

import pytest

FLUX_DIR = "flux/clusters/fleet"


def _suspend_of(repo_root, filename):
    text = (repo_root / FLUX_DIR / filename).read_text(encoding="utf-8")
    m = re.search(r"^\s*suspend:\s*(true|false)\s*$", text, re.M)
    assert m, f"kein suspend-Flag in {filename}"
    return m.group(1) == "true"


def test_t014537_korczewski_manifests_keep_workspace_and_website_active(repo_root):
    # Eigner 2026-11-01 (brand-trennung Voll-Unfreeze): Workspace + Jobs +
    # Website sind live (suspend: false) — Pause war gestern.
    assert (repo_root / FLUX_DIR / "ks-korczewski.yaml").is_file()
    assert (repo_root / FLUX_DIR / "ks-jobs-korczewski.yaml").is_file()
    assert (repo_root / FLUX_DIR / "ks-website-korczewski.yaml").is_file()
    assert _suspend_of(repo_root, "ks-korczewski.yaml") is False
    assert _suspend_of(repo_root, "ks-jobs-korczewski.yaml") is False
    assert _suspend_of(repo_root, "ks-website-korczewski.yaml") is False


def _kubectl_json(run_cmd, *args):
    result = run_cmd(["timeout", "20", "kubectl", "--context", "fleet", *args])
    return result


def test_t014537_active_admin_action_cronjobs_are_not_suspended(run_cmd, repo_root):
    # Aktiv-Policy (Voll-Unfreeze): beide CronJobs existieren und sind NICHT
    # suspendiert (Render-Beleg: suspend=None im korczewski-Artefakt).
    # Laufende Jobs sind Normalbetrieb — keine Aktivitaets-Aussage (nichts
    # erfunden). Ohne Fleet-Cluster skipped der Test wie bisher.
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl binary not installed")
    if run_cmd(["kubectl", "config", "get-contexts", "fleet"]).returncode != 0:
        pytest.skip("fleet context not configured")
    owners = ("admin-actions-cleanup", "admin-actions-prune")

    ns = run_cmd(["timeout", "20", "kubectl", "--context", "fleet",
                  "get", "namespace", "workspace-korczewski", "-o", "json"])
    if ns.returncode != 0:
        pytest.skip("workspace-korczewski existiert nicht — kein Live-Beleg moeglich")

    cronjobs = _kubectl_json(
        run_cmd, "-n", "workspace-korczewski", "get", "cronjobs", *owners, "-o", "json"
    )
    assert cronjobs.returncode == 0, f"kubectl cronjobs failed: {cronjobs.output}"
    items = json.loads(cronjobs.stdout)["items"]
    assert all(item.get("spec", {}).get("suspend") is not True for item in items), (
        "approved admin-action CronJobs sind suspendiert, obwohl die Brand aktiv ist"
    )
    names = {item["metadata"]["name"] for item in items}
    for owner in owners:
        assert owner in names, f"missing approved CronJob evidence for {owner}"

    jobs = _kubectl_json(run_cmd, "-n", "workspace-korczewski", "get", "jobs", "-o", "json")
    assert jobs.returncode == 0, f"kubectl jobs failed: {jobs.output}"
