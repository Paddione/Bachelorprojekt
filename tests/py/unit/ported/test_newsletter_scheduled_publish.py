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


# [T901432] Seit T900035 setzt die Basis den Ziel-Host aus ${WEBSITE_NAMESPACE} zusammen;
# das korczewski-Overlay patcht scheduled-publish bewusst NICHT mehr mit festem Host.
# Geprueft wird deshalb die Aufloesung: Basis-URL + Namespace-Variable des Overlays.
def test_korczewski_patch_points_scheduled_publish_at_its_own_namespace(repo_root, rendered, yaml_load):
    assert "http://website.${WEBSITE_NAMESPACE}.svc.cluster.local/api/cron/scheduled-publish" in rendered
    for env_file in ("korczewski.yaml", "fleet-korczewski.yaml"):
        env = yaml_load(repo_root / "environments" / env_file)
        assert env["env_vars"]["WEBSITE_NAMESPACE"] == "website-korczewski", env_file
    patch = (repo_root / "prod-korczewski" / "patch-cronjob-urls.yaml").read_text(encoding="utf-8")
    # Positiv-Anker: das Patch leitet andere CronJobs auf den korczewski-Namespace um ...
    assert "website.website-korczewski.svc.cluster.local/api/cron/notify-unread" in patch
    # ... aber nicht scheduled-publish, das loest ueber WEBSITE_NAMESPACE selbst auf.
    assert "/api/cron/scheduled-publish" not in patch
