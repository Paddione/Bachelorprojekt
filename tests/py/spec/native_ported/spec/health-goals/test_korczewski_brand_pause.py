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


def test_t014537_korczewski_manifests_keep_workspace_and_website_paused(repo_root):
    # T002479: Workspace + Jobs suspendiert; Website ebenfalls, massage nur auf devmesh.
    assert (repo_root / FLUX_DIR / "ks-korczewski.yaml").is_file()
    assert (repo_root / FLUX_DIR / "ks-jobs-korczewski.yaml").is_file()
    assert (repo_root / FLUX_DIR / "ks-website-korczewski.yaml").is_file()
    assert _suspend_of(repo_root, "ks-korczewski.yaml") is True
    assert _suspend_of(repo_root, "ks-jobs-korczewski.yaml") is True
    assert _suspend_of(repo_root, "ks-website-korczewski.yaml") is True


def _kubectl_json(run_cmd, *args):
    result = run_cmd(["timeout", "20", "kubectl", "--context", "fleet", *args])
    return result


def test_t014537_paused_admin_action_cronjobs_have_no_active_jobs(run_cmd, repo_root):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl binary not installed")
    if run_cmd(["kubectl", "config", "get-contexts", "fleet"]).returncode != 0:
        pytest.skip("fleet context not configured")
    owners = ("admin-actions-cleanup", "admin-actions-prune")

    ns = run_cmd(["timeout", "20", "kubectl", "--context", "fleet",
                  "get", "namespace", "workspace-korczewski", "-o", "json"])
    if ns.returncode != 0:
        # Slot vollstaendig dekommissioniert: kein Namespace, keine Jobs —
        # die Pause ist staerker als suspendiert. Die Manifest-Aussage oben
        # bleibt der gueltige Beleg fuer die gewollte Brand-Pause.
        ks = _kubectl_json(run_cmd, "-n", "flux-system", "get", "kustomizations",
                           "flux-korczewski", "flux-korczewski-jobs", "-o", "json")
        if ks.returncode == 0:
            items = json.loads(ks.stdout)["items"]
            assert all(item.get("spec", {}).get("suspend") is True for item in items), (
                "flux-korczewski Kustomizations weder abwesend noch suspendiert")
        else:
            assert "NotFound" in ks.output, ks.output
        pytest.skip("workspace-korczewski existiert nicht — Slot dekommissioniert, keine Jobs moeglich")

    cronjobs = _kubectl_json(
        run_cmd, "-n", "workspace-korczewski", "get", "cronjobs", *owners, "-o", "json"
    )
    assert cronjobs.returncode == 0, f"kubectl cronjobs failed: {cronjobs.output}"
    items = json.loads(cronjobs.stdout)["items"]
    assert all(item.get("spec", {}).get("suspend") is True for item in items), (
        "approved admin-action CronJobs are not both suspended"
    )
    names = {item["metadata"]["name"] for item in items}
    for owner in owners:
        assert owner in names, f"missing approved CronJob evidence for {owner}"

    jobs = _kubectl_json(run_cmd, "-n", "workspace-korczewski", "get", "jobs", "-o", "json")
    assert jobs.returncode == 0, f"kubectl jobs failed: {jobs.output}"
    active = []
    for job in json.loads(jobs.stdout)["items"]:
        refs = job.get("metadata", {}).get("ownerReferences") or []
        owned = any(
            ref.get("kind") == "CronJob" and ref.get("name") in owners for ref in refs
        )
        if owned and (job.get("status", {}).get("active") or 0) > 0:
            active.append(job["metadata"]["name"])
    assert not active, f"active admin-action Jobs remain: {' '.join(active)}"
