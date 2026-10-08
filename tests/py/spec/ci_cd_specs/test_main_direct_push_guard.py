"""Native assertions from tests/spec/ci-cd/main-direct-push-guard.bats."""

import json
import os
import re
import pytest

@pytest.fixture
def protection_script(repo_root):
    script = repo_root / "scripts/check-branch-protection.sh"
    assert os.access(script, os.X_OK)
    return script


def test_freshness_regen_uses_pr_auto_merge(repo_root):
    source = (repo_root / ".github/workflows/freshness-regen.yml").read_text()
    assert "git commit" in source
    assert re.search(r"create-pull-request|gh(-axi)? pr create", source)
    assert not re.search(r"^\s*git push(\s*(#.*)?)?\s*$", source, re.M)
    assert re.search(r"gh(-axi)? pr merge[^\n]*--auto", source)
    code = "\n".join(line for line in source.splitlines() if not re.match(r"\s*#", line))
    assert "[skip ci]" not in code


def test_branch_protection_reports_admin_and_missing_pr_requirement(protection_script, run_cmd, tmp_path):
    good = tmp_path / "good.json"
    good.write_text(json.dumps({"enforce_admins": {"enabled": True}, "required_pull_request_reviews": {"required_approving_review_count": 0}, "required_status_checks": {"contexts": ["Security Scan"]}}))
    run_cmd([str(protection_script), "--from-json", str(good)]).check()
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"enforce_admins": {"enabled": False}, "required_status_checks": {"contexts": ["Security Scan"]}}))
    result = run_cmd([str(protection_script), "--from-json", str(bad)])
    assert result.returncode != 0
    assert "enforce_admins" in result.output
    assert "required_pull_request_reviews" in result.output


def source(repo_root):
    script = repo_root / "scripts/gh-branch-protection.sh"
    assert os.access(script, os.X_OK)
    return script.read_text()


def test_branch_protection_enforced_for_admins(repo_root):
    assert re.search(r"^ENFORCE_ADMINS=true$", source(repo_root), re.M)


def test_branch_protection_uses_current_unit_check_name(repo_root):
    text = source(repo_root)
    assert '"Unit + Quality Gates"' in text
    assert "Offline Tests (Manifests, Configs, Unit)" not in text


def test_all_five_baseline_checks_required(repo_root):
    text = source(repo_root)
    for check in ["Unit + Quality Gates", "Security Scan", "Brett TypeScript", "Conventional Commits", "Spec + Guards"]:
        assert f'"{check}"' in text


def test_obsolete_check_rejected(protection_script, run_cmd, tmp_path):
    file = tmp_path / "check.json"
    document = {"enforce_admins": {"enabled": True}, "required_pull_request_reviews": {"required_approving_review_count": 1}, "required_status_checks": {"contexts": ["Security Scan"]}}
    file.write_text(json.dumps(document))
    run_cmd([str(protection_script), "--from-json", str(file)]).check()
    document["required_status_checks"]["contexts"].insert(0, "Offline Tests (Manifests, Configs, Unit)")
    file.write_text(json.dumps(document))
    result = run_cmd([str(protection_script), "--from-json", str(file)])
    result.check(1)
    assert "Offline Tests (Manifests, Configs, Unit)" in result.output


def test_auto_merge_keeps_branch_for_verified_finalizer(repo_root):
    import yaml
    workflow = yaml.load((repo_root / '.github/workflows/auto-enable-automerge.yml').read_text(),
                         Loader=yaml.BaseLoader)
    merge_commands = [line.strip() for step in workflow['jobs']['enable-automerge']['steps']
                      for line in step.get('run', '').splitlines()
                      if re.search(r'gh\s+pr\s+merge', line)]
    assert merge_commands
    for command in merge_commands:
        assert '--auto' in command
        assert '--squash' in command
        assert '--delete-branch' not in command
