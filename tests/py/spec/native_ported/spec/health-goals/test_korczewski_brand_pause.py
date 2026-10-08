"""Native migration of tests/spec/health-goals/korczewski-brand-pause.bats."""

import json
import shutil

import pytest


@pytest.fixture(autouse=True)
def _require_kubectl(run_cmd):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl binary not installed")
    if run_cmd(["kubectl", "config", "get-contexts", "fleet"]).returncode != 0:
        pytest.skip("fleet context not configured")


def _kubectl_json(run_cmd, *args):
    result = run_cmd(["timeout", "20", "kubectl", "--context", "fleet", *args])
    assert result.returncode == 0, f"kubectl {' '.join(args)} failed: {result.output}"
    return json.loads(result.stdout)


def test_t014537_paused_admin_action_cronjobs_have_no_active_jobs(run_cmd):
    owners = ("admin-actions-cleanup", "admin-actions-prune")

    cronjobs = _kubectl_json(
        run_cmd, "-n", "workspace-korczewski", "get", "cronjobs", *owners, "-o", "json"
    )
    assert all(item.get("spec", {}).get("suspend") is True for item in cronjobs["items"]), (
        "approved admin-action CronJobs are not both suspended"
    )
    names = {item["metadata"]["name"] for item in cronjobs["items"]}
    for owner in owners:
        assert owner in names, f"missing approved CronJob evidence for {owner}"

    jobs = _kubectl_json(run_cmd, "-n", "workspace-korczewski", "get", "jobs", "-o", "json")
    active = []
    for job in jobs["items"]:
        refs = job.get("metadata", {}).get("ownerReferences") or []
        owned = any(
            ref.get("kind") == "CronJob" and ref.get("name") in owners for ref in refs
        )
        if owned and (job.get("status", {}).get("active") or 0) > 0:
            active.append(job["metadata"]["name"])
    assert not active, f"active admin-action Jobs remain: {' '.join(active)}"

    kustomizations = _kubectl_json(
        run_cmd,
        "-n",
        "flux-system",
        "get",
        "kustomizations",
        "flux-korczewski",
        "flux-korczewski-jobs",
        "flux-website-korczewski",
        "-o",
        "json",
    )
    assert all(
        item.get("spec", {}).get("suspend") is True for item in kustomizations["items"]
    ), "korczewski Flux Kustomizations are not all suspended"
