"""Native migration of tests/unit/website-ci-deploy.bats."""
import re

import yaml

WF = ".github/workflows/build-website.yml"
# T001229: the korczewski deploy lives in the same consolidated workflow.
KORCZEWSKI_WF = WF


def _lines(repo_root, rel):
    return (repo_root / rel).read_text(encoding="utf-8").splitlines()


def _grep_lines(lines, pattern):
    """Lines matching a regex, matched line by line like grep."""
    return [line for line in lines if re.search(pattern, line)]


def test_t000423_consolidated_build_website_yml_exists(repo_root):
    assert (repo_root / WF).is_file()


def test_t001229_standalone_korczewski_workflow_removed_korczewski_deploy_folded_into_build_website_yml(repo_root):
    assert not (repo_root / ".github/workflows/build-website-korczewski.yml").exists()
    # T901440: der korczewski-Slot faehrt BRAND massage (vorher korczewski).
    assert _grep_lines(_lines(repo_root, WF), r"BRAND_ID:\s*(korczewski|massage)")


def test_t000423_t900810_website_deploy_pins_the_fresh_image_via_render_artifact_digest_input_flux(repo_root):
    pattern = r"website_image_digest:\s*\$\{\{\s*needs\.build-image\.outputs\.digest"
    assert _grep_lines(_lines(repo_root, WF), pattern)


def test_t000423_t900810_build_image_exports_the_digest_output_the_flux_render_consumes(repo_root):
    data = yaml.safe_load((repo_root / WF).read_text(encoding="utf-8")) or {}
    jobs = data.get("jobs", {}) or {}
    outs = (jobs.get("build-image") or {}).get("outputs") or {}
    assert "digest" in outs, "build-image hat kein digest output (render-artifact liefe mit leerem Pin)"


def test_t001229_korczewski_deploy_repoints_via_kubectl_set_image_deployment_website_n_website_korczewski(repo_root):
    pattern = r"kubectl\s+set\s+image\s+deployment/website\s+website=.*-n\s+website-korczewski"
    assert _grep_lines(_lines(repo_root, KORCZEWSKI_WF), pattern)


def test_t001229_korczewski_set_image_uses_the_freshly_built_tag_sha_tag_image_not_a_static_ref(repo_root):
    pattern = r"kubectl\s+set\s+image\s+deployment/website\s+website=.*-n\s+website-korczewski"
    hits = _grep_lines(_lines(repo_root, KORCZEWSKI_WF), pattern)
    assert any(re.search(r"\$\{?SHA_TAG\}?|\$\{?IMAGE\}?", line) for line in hits)


def test_t000423_t900810_the_remaining_deploy_job_still_waits_for_rollout_status_no_regression(repo_root):
    hits = _grep_lines(_lines(repo_root, WF), r"kubectl\s+rollout\s+status\s+deployment/website")
    assert len(hits) == 1
