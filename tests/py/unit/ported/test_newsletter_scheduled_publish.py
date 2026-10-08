"""Native migration of tests/unit/newsletter-scheduled-publish.bats."""
import shutil
import subprocess

import pytest

KF = "--load-restrictor=LoadRestrictionsNone"


@pytest.fixture(scope="module")
def rendered(repo_root, tmp_path_factory):
    """Mirror setup_file(): render k3d/ once (stdout and stderr) for the greps."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    r = subprocess.run(["kubectl", "kustomize", str(repo_root / "k3d"), KF],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       text=True, timeout=300)
    return r.stdout


@pytest.fixture(scope="module")
def endpoint(repo_root):
    return (repo_root / "components/website/src/pages/api/cron/scheduled-publish.ts").read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def db(repo_root):
    return (repo_root / "components/website/src/lib/newsletter-db.ts").read_text(encoding="utf-8")


def test_scheduled_publish_cronjob_is_registered_in_base_kustomization(rendered):
    assert "name: scheduled-publish" in rendered


def test_scheduled_publish_cronjob_runs_every_5_minutes_in_europe_berlin(rendered):
    assert "*/5 * * * *" in rendered
    assert "Europe/Berlin" in rendered


def test_scheduled_publish_cronjob_uses_forbid_concurrency_no_double_send(rendered):
    assert "concurrencyPolicy: Forbid" in rendered


def test_cron_endpoint_requires_bearer_auth_and_returns_401_on_mismatch(endpoint):
    assert "errorResponse('Unauthorized', locals.requestId, 401)" in endpoint
    assert "Bearer ${CRON_SECRET}" in endpoint


def test_lock_query_is_atomic_status_scheduled_guarded_update(db):
    assert "WHERE id = $1 AND status = 'scheduled' AND scheduled_publish_at <= now()" in db


def test_stale_sending_locks_are_reset_after_10_minutes(db):
    assert "INTERVAL '10 minutes'" in db


# The BATS original was excluded from the offline gate (tests/unit/.coverage-allowlist) and
# never ran; this case fails against the current korczewski patch. korczewski is frozen
# (T002479), so the manifest is not changed here. strict=True surfaces a later fix.
@pytest.mark.xfail(strict=True, reason="korczewski patch lacks the namespaced scheduled-publish URL (brand frozen, T002479)")
def test_korczewski_patch_points_scheduled_publish_at_its_own_namespace(repo_root):
    patch = repo_root / "prod-korczewski" / "patch-cronjob-urls.yaml"
    assert "website.website-korczewski.svc.cluster.local/api/cron/scheduled-publish" in patch.read_text(encoding="utf-8")
