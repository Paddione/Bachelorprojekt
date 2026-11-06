"""Native migration of tests/unit/website-ci-deploy.bats."""
import re

import yaml

WF = ".github/workflows/build-website.yml"
# T001229: die korczewski-Auslieferung lebt im selben konsolidierten Workflow.
# [#7234] Seit dem T900810-Nachzug gibt es dort keinen kubectl-Deploy mehr —
# nur den render-korczewski-prod-Job (workflow_call mit frischem Digest).
KORCZEWSKI_WF = WF
PROD_WF = ".github/workflows/render-korczewski-prod-artifact.yml"


def _lines(repo_root, rel):
    return (repo_root / rel).read_text(encoding="utf-8").splitlines()


def _grep_lines(lines, pattern):
    """Lines matching a regex, matched line by line like grep."""
    return [line for line in lines if re.search(pattern, line)]


def test_t000423_consolidated_build_website_yml_exists(repo_root):
    assert (repo_root / WF).is_file()


def test_t001229_standalone_korczewski_workflow_removed_korczewski_deploy_folded_into_build_website_yml(repo_root):
    assert not (repo_root / ".github/workflows/build-website-korczewski.yml").exists()
    # [#7234] Der korczewski-Slot lebt als render-korczewski-prod-Job im
    # konsolidierten Workflow (T900810-Nachzug: kein kubectl-Deploy mehr).
    data = yaml.safe_load((repo_root / WF).read_text(encoding="utf-8")) or {}
    job = (data.get("jobs", {}) or {}).get("render-korczewski-prod") or {}
    assert "render-korczewski-prod-artifact.yml" in (job.get("uses") or ""), \
        "korczewski-Auslieferung fehlt in build-website.yml"


def test_t000423_t900810_website_deploy_pins_the_fresh_image_via_render_artifact_digest_input_flux(repo_root):
    pattern = r"website_image_digest:\s*\$\{\{\s*needs\.build-image\.outputs\.digest"
    assert _grep_lines(_lines(repo_root, WF), pattern)


def test_t000423_t900810_build_image_exports_the_digest_output_the_flux_render_consumes(repo_root):
    data = yaml.safe_load((repo_root / WF).read_text(encoding="utf-8")) or {}
    jobs = data.get("jobs", {}) or {}
    outs = (jobs.get("build-image") or {}).get("outputs") or {}
    assert "digest" in outs, "build-image hat kein digest output (render-artifact liefe mit leerem Pin)"


def test_t001229_korczewski_deploy_repoints_via_kubectl_set_image_deployment_website_n_website_korczewski(repo_root):
    # [#7234] Ersetzt die kubectl-set-image-Assertion: Der frische Digest
    # erreicht den korczewski-prod-Render als WEBSITE_IMAGE_DIGEST — geloest
    # aus dem workflow_call-Input, ersatzweise online via crane, nie statisch.
    text = (repo_root / PROD_WF).read_text(encoding="utf-8")
    assert 'WEBSITE_DIGEST="${{ inputs.website_image_digest }}"' in text
    assert "WEBSITE_IMAGE_DIGEST: ${{ steps.resolve-digest.outputs.website_digest }}" in text


def test_t001229_korczewski_set_image_uses_the_freshly_built_tag_sha_tag_image_not_a_static_ref(repo_root):
    # [#7234] Ersetzt die SHA_TAG-Assertion: Frisch heißt jetzt der Digest
    # aus needs.build-image.outputs.digest — beide Render-Jobs (fleet und
    # korczewski-prod) bekommen ihn, kein statischer Pin.
    hits = _grep_lines(
        _lines(repo_root, KORCZEWSKI_WF),
        r"needs\.build-image\.outputs\.digest",
    )
    assert len(hits) >= 2, "fleet- und korczewski-prod-Render brauchen den frischen Digest"


def test_t000423_t900810_the_remaining_deploy_job_still_waits_for_rollout_status_no_regression(repo_root):
    # [#7234] Ersetzt die rollout-status-Assertion: Es gibt keinen kubectl-Pfad
    # mehr, auf den zu warten wäre — Flux reconciliiert das digest-gepinnte
    # Artefakt. Der Test pinnt die Entfernung fail-closed gegen Auferstehung.
    lines = _lines(repo_root, WF)
    for pattern in (r"kubectl\s+apply", r"kubectl\s+set\s+image", r"kubectl\s+rollout"):
        assert not _grep_lines(lines, pattern), f"toter kubectl-Pfad zurueck: {pattern}"
