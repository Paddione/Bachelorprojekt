"""Native migration of tests/spec/fleet-operations/cronjob-hygiene.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    return {
        "sp": repo_root / "k3d" / "cronjob-scheduled-publish.yaml",
        "tr": repo_root / "k3d" / "tests-retention-cronjob.yaml",
        "root": repo_root,
    }


def _count(text: str, pattern: str, regex: bool = False) -> int:
    """Count lines matching pattern (grep -c semantics)."""
    if regex:
        return sum(1 for line in text.splitlines() if re.search(pattern, line))
    return sum(1 for line in text.splitlines() if pattern in line)


def test_t900035_scheduled_publish_zielt_auf_die_eigene_website_namespace_nicht_auf_website_staging(paths):
    sp = paths["sp"]
    assert sp.is_file()
    text = sp.read_text(encoding="utf-8")

    # Positiv-Anker (T002356-M1): der curl-Aufruf existiert ueberhaupt.
    assert _count(text, "api/cron/scheduled-publish") >= 1

    # Der Guard: kein hartkodierter Fremd-Namespace in der Basis.
    hardcoded = [l for l in text.splitlines() if "website.website-staging.svc.cluster.local" in l]
    assert not hardcoded, f"scheduled-publish zeigt fest auf website-staging: {hardcoded}"

    # Namespace kommt beim Render aus der Env-Registry, wie bei jedem anderen CronJob.
    assert _count(text, "website.${WEBSITE_NAMESPACE}.svc.cluster.local") >= 1, \
        "scheduled-publish nutzt kein ${WEBSITE_NAMESPACE}"

    # Gegenprobe zu T012907: der Token MUSS als Doppel-Dollar escaped bleiben.
    assert _count(text, "Bearer $${CRON_SECRET}") == 1, \
        "CRON_SECRET ist nicht mehr als $$ escaped (T012907)"


def test_t900035_scheduled_publish_macht_fehlschlaege_im_log_sichtbar(paths):
    sp = paths["sp"]
    assert sp.is_file()
    text = sp.read_text(encoding="utf-8")
    # Der HTTP-Code muss ausgegeben werden, bevor der Job fehlschlaegt (kein blindes Log).
    assert _count(text, "http_code") >= 1, \
        "scheduled-publish gibt keinen HTTP-Code aus (blindes Log)"


def test_t900035_beide_cronjobs_raeumen_ihre_job_pods_ab(paths):
    for key in ("sp", "tr"):
        f = paths[key]
        name = f.name
        assert f.is_file(), f"{name} fehlt"
        text = f.read_text(encoding="utf-8")

        # Positiv-Anker: es ist ueberhaupt ein CronJob.
        assert _count(text, "^kind: CronJob", regex=True) >= 1

        # ttlSecondsAfterFinished loescht beendete Jobs samt Pods.
        assert _count(text, "ttlSecondsAfterFinished:") >= 1, \
            f"{name}: kein ttlSecondsAfterFinished"

        # failedJobsHistoryLimit begrenzt zusaetzlich die behaltene Historie.
        assert _count(text, "failedJobsHistoryLimit:") >= 1, \
            f"{name}: kein failedJobsHistoryLimit"


def test_t900035_der_korczewski_url_patch_fuer_scheduled_publish_ist_entbehrlich_geworden(paths):
    p = paths["root"] / "prod-korczewski" / "patch-cronjob-urls.yaml"
    assert p.is_file()
    text = p.read_text(encoding="utf-8")

    # Positiv-Anker: die Datei patcht weiterhin andere CronJobs.
    assert _count(text, "kind: CronJob") >= 1

    # Ab "name: scheduled-publish" (awk-Range bis Dateiende) darf keine hartkodierte URL stehen.
    lines = text.splitlines()
    start = next((i for i, l in enumerate(lines) if "name: scheduled-publish" in l), None)
    leftover = []
    if start is not None:
        leftover = [l for l in lines[start:] if "website.website-korczewski.svc.cluster.local" in l]
    assert not leftover, f"scheduled-publish wird weiterhin per hartkodierter URL gepatcht: {leftover}"
