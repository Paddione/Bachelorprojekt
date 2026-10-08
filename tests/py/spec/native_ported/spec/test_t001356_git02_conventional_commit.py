"""Native migration of tests/spec/t001356-git02-conventional-commit.bats."""

# (G-GIT02)

import os
import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    return {
        "root": repo_root,
        "script": repo_root / "scripts" / "validate-commit-msg.sh",
        "hook": repo_root / ".githooks" / "commit-msg",
        "pre_push": repo_root / ".githooks" / "pre-push",
        "pre_commit": repo_root / ".githooks" / "pre-commit",
        "ci": repo_root / ".github" / "workflows" / "ci.yml",
        "pr_auto_title": repo_root / ".github" / "workflows" / "pr-auto-title.yml",
        "mishap_skill": repo_root / ".claude" / "skills" / "mishap-tracker" / "SKILL.md",
        "register": repo_root / "scripts" / "register-scope.sh",
        "commitlint": repo_root / "commitlint.config.cjs",
    }


@pytest.fixture
def msg(tmp_path: Path) -> Path:
    return tmp_path / "msg.txt"


def _write_msg(path: Path, text: str) -> None:
    path.write_text(text + "\n", encoding="utf-8")


def _message(run_cmd, paths, msg: Path):
    return run_cmd(["bash", str(paths["script"]), "message", str(msg)])


def _text(path: Path) -> str:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


def test_validate_commit_msg_sh_exists_and_is_executable(paths):
    assert os.access(paths["script"], os.X_OK)


def test_rejects_the_exact_regression_subject_literal_betreff_placeholder(run_cmd, paths, msg):
    _write_msg(msg, "Betreff in main")
    res = _message(run_cmd, paths, msg)
    assert res.returncode == 1
    assert "not a Conventional Commit header" in res.output


def test_rejects_a_non_conventional_german_subject(run_cmd, paths, msg):
    _write_msg(msg, "Betreff: Test")
    assert _message(run_cmd, paths, msg).returncode == 1


def test_accepts_a_valid_conventional_commit_subject(run_cmd, paths, msg):
    _write_msg(msg, "fix(ops): correct commit-lint scope [T001356]")
    assert _message(run_cmd, paths, msg).returncode == 0


def test_accepts_a_valid_conventional_commit_subject_without_scope(run_cmd, paths, msg):
    _write_msg(msg, "chore: tidy up temp files")
    assert _message(run_cmd, paths, msg).returncode == 0


def test_rejects_an_unknown_type(run_cmd, paths, msg):
    _write_msg(msg, "wip: half-finished thing")
    res = _message(run_cmd, paths, msg)
    assert res.returncode == 1
    assert "unknown type" in res.output


def test_rejects_an_unknown_scope(run_cmd, paths, msg):
    _write_msg(msg, "fix(totally-not-a-real-scope): x")
    res = _message(run_cmd, paths, msg)
    assert res.returncode == 1
    assert "unknown scope" in res.output


def test_exempts_merge_commit_subjects(run_cmd, paths, msg):
    _write_msg(msg, "Merge pull request #1234 from foo/bar")
    assert _message(run_cmd, paths, msg).returncode == 0


@pytest.mark.skip(reason="Pre-existing regression — CI merge commit SHAs differ per context")
def test_validates_a_commit_range_and_reports_pass_fail_counts(run_cmd, paths):
    res = run_cmd(["bash", str(paths["script"]), "range", "HEAD~1..HEAD"])
    assert res.returncode == 0
    assert "OK" in res.output


def test_usage_error_on_missing_arguments(run_cmd, paths):
    assert run_cmd(["bash", str(paths["script"])]).returncode == 2


def test_githooks_pre_push_invokes_validate_commit_msg_sh(paths):
    assert "validate-commit-msg.sh" in _text(paths["pre_push"])


def test_ci_commit_lint_job_invokes_validate_commit_msg_sh(paths):
    assert "validate-commit-msg.sh" in _text(paths["ci"])


def test_scopes_prints_allowed_scope_list_one_per_line(run_cmd, paths):
    res = run_cmd(["bash", str(paths["script"]), "scopes"])
    assert res.returncode == 0, res.output
    assert "\n" in res.output
    lines = res.output.split("\n")
    assert "website" in lines
    assert "ci" in lines


def test_scopes_output_matches_commitlint_config_named_scopes_exactly(run_cmd, paths):
    res = run_cmd(["bash", str(paths["script"]), "scopes"])
    assert res.returncode == 0, res.output
    node = run_cmd([
        "node", "-e",
        f"const cfg = require('{paths['commitlint']}'); console.log(cfg.namedScopes.join('\\n'));",
    ])
    assert res.output == node.stdout.rstrip("\n")


def test_ci_yml_commit_lint_job_loads_scopes_dynamically_instead_of_hardcoded_list(paths):
    assert "validate-commit-msg.sh range" in _text(paths["ci"])


def test_pr_auto_title_yml_checks_out_the_repo_before_deriving_a_scope(paths):
    assert "actions/checkout" in _text(paths["pr_auto_title"])


def test_pr_auto_title_yml_validates_derived_scope_against_validate_commit_msg_sh_scopes(paths):
    assert "validate-commit-msg.sh scopes" in _text(paths["pr_auto_title"])


def test_register_scope_sh_exists_and_is_executable(paths):
    assert os.access(paths["register"], os.X_OK)


def test_register_scope_sh_adds_a_new_scope_to_commitlint_config(run_cmd, paths, tmp_path):
    cfg = tmp_path / "commitlint.config.cjs"
    cfg.write_text(_text(paths["commitlint"]), encoding="utf-8")
    res = run_cmd(
        [str(paths["register"]), "bats-test-scope-xyz", "--config", str(cfg)],
        env={"COMMITLINT_CONFIG_OVERRIDE": str(cfg)},
    )
    assert res.returncode == 0, res.output
    assert "bats-test-scope-xyz" in _text(cfg)


def test_register_scope_sh_rejects_an_already_registered_scope(run_cmd, paths):
    res = run_cmd([str(paths["register"]), "website", "--config", str(paths["commitlint"])])
    assert res.returncode != 0


def test_register_scope_sh_rejects_an_invalid_scope_format(run_cmd, paths):
    res = run_cmd([str(paths["register"]), "Not_Valid!"])
    assert res.returncode != 0


# ── T002115: Header-Pruefung im commit-msg-Hook ──────────────────────────────

def test_t002115_agents_is_a_registered_scope(run_cmd, paths):
    res = run_cmd(["bash", str(paths["script"]), "scopes"])
    assert res.returncode == 0, res.output
    assert "agents" in res.output.split("\n")


def test_t002115_commit_msg_hook_rejects_an_unknown_scope(run_cmd, paths, msg):
    _write_msg(msg, "chore(bogusscope): test")
    res = run_cmd(["bash", str(paths["hook"]), str(msg)])
    assert res.returncode == 1
    assert "unknown scope 'bogusscope'" in res.output


def test_t002115_commit_msg_hook_lets_chore_agents_through(run_cmd, paths, msg):
    _write_msg(msg, "chore(agents): Bonsai-Referenz aktualisieren")
    assert run_cmd(["bash", str(paths["hook"]), str(msg)]).returncode == 0


def test_t002328_t002374_skills_is_a_valid_scope_again(run_cmd, paths, msg):
    _write_msg(msg, "chore(skills): Bonsai-Referenz aktualisieren")
    res = run_cmd(["bash", str(paths["hook"]), str(msg)])
    assert res.returncode == 0
    assert "OK" in res.output


def test_t002115_commit_msg_hook_names_the_way_to_the_scope_list(run_cmd, paths, msg):
    _write_msg(msg, "chore(bogusscope): test")
    res = run_cmd(["bash", str(paths["hook"]), str(msg)])
    assert "validate-commit-msg.sh scopes" in res.output


def test_t002115_skip_commit_msg_lint_1_bypasses_the_check(run_cmd, paths, msg):
    _write_msg(msg, "chore(bogusscope): test")
    res = run_cmd(["bash", str(paths["hook"]), str(msg)], env={"SKIP_COMMIT_MSG_LINT": "1"})
    assert res.returncode == 0


# ── T002240 M1: "did you mean" nearest-scope suggestion ──────────────────────

def test_t002240_unknown_scope_websitex_suggests_nearest_valid_scope(run_cmd, paths, msg):
    _write_msg(msg, "fix(websitex): drop invented tool names")
    res = _message(run_cmd, paths, msg)
    assert res.returncode == 1
    assert "unknown scope 'websitex'" in res.output
    assert "did you mean" in res.output
    assert "website" in res.output


def test_t002240_unknown_scope_without_near_match_emits_no_bogus_suggestion(run_cmd, paths, msg):
    _write_msg(msg, "chore(zzzzznope): test")
    res = _message(run_cmd, paths, msg)
    assert res.returncode == 1
    assert "unknown scope 'zzzzznope'" in res.output
    assert "did you mean" not in res.output


def test_t002240_the_suggestion_is_a_scope_that_actually_validates(run_cmd, paths, msg):
    _write_msg(msg, "fix(websitex): x")
    res = _message(run_cmd, paths, msg)
    m = re.search(r"did you mean '([^']*)'", res.output)
    assert m and m.group(1), "no suggestion emitted"
    _write_msg(msg, f"fix({m.group(1)}): x")
    assert _message(run_cmd, paths, msg).returncode == 0


def test_t002240_pre_push_hook_has_an_empty_branch_guard(paths):
    text = _text(paths["pre_push"])
    assert "T002240" in text
    assert re.search(r"rev-list --count", text)


def test_t002240_pre_push_empty_branch_guard_is_bypassable_and_documented(paths):
    assert "SKIP_EMPTY_BRANCH_CHECK" in _text(paths["pre_push"])


# ── T002240 M3: mishap-tracker slug vs. pre-commit branch-name regex ─────────

def test_t002240_pre_commit_branch_check_is_case_sensitive_on_the_ticket_id(paths):
    assert "T[0-9]{6,}" in _text(paths["pre_commit"])
    assert not re.search(r"T[0-9]{6,}", "chore/mishap-t002239")
    assert re.search(r"T[0-9]{6,}", "chore/mishap-T002239")


def test_t002240_mishap_tracker_never_derives_branch_name_from_lowercased_slug(paths):
    assert paths["mishap_skill"].is_file()
    assert "chore/$slug" not in _text(paths["mishap_skill"])


def test_t002240_mishap_tracker_defines_branch_variable_keeping_ticket_id_uppercase(paths):
    text = _text(paths["mishap_skill"])
    assert re.search(r'^\s*branch="chore/mishap-<ext-id>"', text, re.MULTILINE)
    assert "tr '[:upper:]' '[:lower:]'" in text


def test_t002240_mishap_tracker_spells_out_the_case_sensitivity_trap(paths):
    text = _text(paths["mishap_skill"])
    assert "pre-commit" in text
    assert "T[0-9]{6,}" in text


def test_t002240_branch_mishap_tracker_prescribes_satisfies_pre_commit_check(run_cmd):
    ext_id = "T002239"
    slug = "mishap-" + ext_id.lower()
    branch = f"chore/mishap-{ext_id}"
    assert slug == "mishap-t002239"
    assert re.match(r"^(feature/|fix/|chore/|docs/)", branch)
    assert re.search(r"T[0-9]{6,}", branch)


# T002328: 'llm' ist in 'ops' aufgegangen.

def test_ops_scope_is_in_the_allowed_scopes_list(run_cmd, paths):
    res = run_cmd(["bash", str(paths["script"]), "scopes"])
    assert res.returncode == 0, res.output
    assert "ops" in res.output


def test_accepts_chore_ops_commit_with_ops_scope(run_cmd, paths, msg):
    _write_msg(msg, "chore(ops): add server startup scripts [T000000]")
    assert _message(run_cmd, paths, msg).returncode == 0


def test_t002328_chore_llm_is_rejected_and_names_ops_as_target(run_cmd, paths, msg):
    _write_msg(msg, "chore(llm): add server startup scripts [T000000]")
    res = _message(run_cmd, paths, msg)
    assert res.returncode == 1
    assert "ops" in res.output
