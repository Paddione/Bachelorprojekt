"""Native migration of tests/unit/plan-lint.bats."""
import json
from pathlib import Path

import pytest

@pytest.fixture
def lint(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "plan-lint.sh")

@pytest.fixture
def fix(repo_root: Path) -> Path:
    return repo_root / "tests" / "unit" / "fixtures" / "plan-lint"

@pytest.fixture
def gates(repo_root: Path, yaml_load) -> dict:
    return yaml_load(repo_root / "docs" / "code-quality" / "gates.yaml")

def _limit(gates: dict, ext: str) -> str:
    return str(gates["s1"]["limits"][ext])

def _lint(run_cmd, repo_root: Path, lint: str, *args, env=None):
    """Run plan-lint.sh from the repo root, as the BATS original did."""
    return run_cmd(["bash", lint, *args], cwd=repo_root, env=env, timeout=300)

def _selftest(run_cmd, repo_root: Path, lint: str, fn: str, arg: str, env=None):
    base_env = {"PLAN_LINT_SELFTEST": "1"}
    base_env.update(env or {})
    return run_cmd(["env", *[f"{k}={v}" for k, v in base_env.items()], "bash", lint, fn, arg],
                   cwd=repo_root, timeout=300)

def _write_baseline(tmp_path: Path, metric: int) -> Path:
    base = tmp_path / "baseline.json"
    base.write_text(json.dumps({
        "S1:components/website/src/components/inbox/InboxApp.svelte": {"metric": metric}
    }, indent=2) + "\n", encoding="utf-8")
    return base

def test_good_plan_passes_exit_0_pass_verdict(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "good.md"))
    assert result.returncode == 0, result.output
    assert "PLAN-LINT: PASS" in result.output

def test_f1_missing_title_is_a_hard_fail_exit_1(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "missing-title.md"))
    assert result.returncode == 1, result.output
    assert "F1" in result.output
    assert "PLAN-LINT: FAIL" in result.output

def test_struct3_missing_task_freshness_check_in_verify_task_is_a_hard_fail(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "missing-verify.md"))
    assert result.returncode == 1, result.output
    assert "STRUCT3" in result.output

def test_struct3_requires_test_changed_not_test_all_consistency_with_linter_contract(run_cmd, repo_root, lint, fix):
    # good.md uses 'task test:changed' and must pass STRUCT3
    result = _lint(run_cmd, repo_root, lint, str(fix / "good.md"))
    assert result.returncode == 0, result.output

def test_p1_a_todo_placeholder_in_a_task_body_is_a_hard_fail(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "placeholder-todo.md"))
    assert result.returncode == 1, result.output
    assert "P1" in result.output

def test_b1_math_ungated_extension_md_effective_threshold_0(run_cmd, repo_root, lint):
    result = _selftest(run_cmd, repo_root, lint, "effective_threshold", "docs/foo.md")
    assert result.returncode == 0, result.output
    assert result.output == "0"

def test_b1_math_unbaselined_sh_effective_threshold_equals_gates_yaml_limit(run_cmd, repo_root, lint, gates):
    # [T002452] Die Zahl wird aus gates.yaml gelesen, nicht wiederholt.
    limit = _limit(gates, ".sh")
    # Positiv-Anker: ein leeres oder "null"-Limit wuerde den Vergleich bedeutungslos machen.
    assert limit.isdigit(), f"s1.limits['.sh'] nicht lesbar: '{limit}'"
    result = _selftest(run_cmd, repo_root, lint, "effective_threshold", "scripts/never-baselined-xyz.sh")
    assert result.returncode == 0, result.output
    assert result.output == limit

def test_b1_math_baselined_file_uses_max_limit_baseline_metric(run_cmd, repo_root, lint, gates, tmp_path):
    # Mock baseline: deterministic check of max(limit, baseline.metric)
    base = _write_baseline(tmp_path, 1500)
    limit = int(_limit(gates, ".svelte"))
    result = _selftest(run_cmd, repo_root, lint, "effective_threshold",
                       "components/website/src/components/inbox/InboxApp.svelte",
                       env={"BASELINE": str(base)})
    assert result.returncode == 0, result.output
    expected = 1500 if 1500 > limit else limit
    assert result.output == str(expected)

def test_b1_math_residual_budget_threshold_minus_wc_l_on_a_live_file(run_cmd, repo_root, lint, gates):
    # plan-context.sh is unbaselined .sh -> limit - wc-l (both read at test time).
    limit = _limit(gates, ".sh")
    assert limit.isdigit(), f"s1.limits['.sh'] nicht lesbar: '{limit}'"
    line_count = (repo_root / "scripts" / "plan-context.sh").read_bytes().count(b"\n")
    expected = int(limit) - line_count
    result = _selftest(run_cmd, repo_root, lint, "residual_budget", "scripts/plan-context.sh")
    assert result.returncode == 0, result.output
    assert result.output == str(expected)

def test_b1a_self_reported_budget_contradicting_computed_value_is_a_hard_fail(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "wrong-budget.md"))
    assert result.returncode == 1, result.output
    assert "B1a" in result.output

def test_b1b_file_over_effective_threshold_without_split_step_warns_exit_0(run_cmd, repo_root, lint, fix, tmp_path):
    base = _write_baseline(tmp_path, 954)
    result = _lint(run_cmd, repo_root, lint, str(fix / "over-threshold.md"),
                   env={"PLAN_LINT_SELFTEST": "0", "BASELINE": str(base)})
    assert result.returncode == 0, result.output
    assert "B1b" in result.output
    import re
    assert re.search(r"PLAN-LINT: PASS \([0-9]+ hard, [1-9]", result.output), result.output

def test_json_emits_a_parseable_verdict_object_for_a_passing_plan(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, "--json", str(fix / "good.md"))
    assert result.returncode == 0, result.output
    d = json.loads(result.output)
    assert d["verdict"] == "PASS"
    assert isinstance(d["hard"], list)
    assert isinstance(d["warn"], list)

def test_json_emits_fail_verdict_with_hard_array_for_a_broken_plan(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, "--json", str(fix / "missing-title.md"))
    assert result.returncode == 1, result.output
    d = json.loads(result.output)
    assert d["verdict"] == "FAIL"
    assert len(d["hard"]) >= 1

# === T001791 hardening: gates.yaml SSOT for the S1 limits ===

def test_1_ext_limit_reads_the_ts_limit_from_gates_yaml_single_source_of_truth(run_cmd, repo_root, lint, gates):
    gates_val = _limit(gates, ".ts")
    result = _selftest(run_cmd, repo_root, lint, "_ext_limit", "foo.ts")
    assert result.returncode == 0, result.output
    assert result.output == gates_val

def test_1_ext_limit_reads_the_cjs_limit_from_gates_yaml_not_a_hardcoded_mirror(run_cmd, repo_root, lint, gates):
    gates_val = _limit(gates, ".cjs")
    result = _selftest(run_cmd, repo_root, lint, "_ext_limit", "foo.cjs")
    assert result.returncode == 0, result.output
    assert result.output == gates_val

def test_1_an_extension_absent_from_gates_yaml_is_ungated_0(run_cmd, repo_root, lint):
    result = _selftest(run_cmd, repo_root, lint, "_ext_limit", "foo.md")
    assert result.returncode == 0, result.output
    assert result.output == "0"

# === T001791 hardening: STRUCT2 needs a real test-runner invocation ===

def test_2_struct2_hard_fails_when_the_fail_phrase_has_no_test_runner_invocation(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "struct2-phrase-no-testcmd.md"))
    assert result.returncode == 1, result.output
    assert "STRUCT2" in result.output

def test_2_good_md_still_passes_struct2_has_a_bats_invocation(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "good.md"))
    assert result.returncode == 0, result.output

# === T001791 hardening: W3 File-Structure <-> tasks cross-check (advisory) ===

def test_3_w3_warns_when_a_file_structure_file_is_never_touched_by_a_task(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "fs-orphan.md"))
    assert result.returncode == 0, result.output
    assert "W3" in result.output
    assert "never-touched-orphan" in result.output

def test_3_good_md_emits_no_w3_every_file_structure_file_is_referenced_in_a_task(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "good.md"))
    assert result.returncode == 0, result.output
    assert "W3" not in result.output

# === T001791 hardening: G1 must not count the File Structure list as a phantom task ===

def test_5_g1_does_not_fire_on_the_file_structure_file_list_no_task_exceeds_3_files(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "g1-filestructure.md"))
    assert result.returncode == 0, result.output
    assert "G1" not in result.output

# === T002265: residual_budget returns empty for ungated extensions ===

def test_residual_budget_returns_empty_for_ungated_extension_no_negative_number(run_cmd, repo_root, lint):
    # .bats files are not in _S1_LIMITS and have no baseline entry
    result = _selftest(run_cmd, repo_root, lint, "residual_budget", "tests/unit/plan-lint.bats")
    assert result.returncode == 0, result.output
    assert result.output == "", f"Expected empty output for ungated file, got: '{result.output}'"

def test_residual_budget_still_returns_budget_for_gated_extension_with_baseline(run_cmd, repo_root, lint):
    # .sh files are gated (limit steht in gates.yaml), so result should be numeric
    import re
    result = _selftest(run_cmd, repo_root, lint, "residual_budget", "scripts/plan-lint.sh")
    assert re.fullmatch(r"-?\d+", result.stdout.strip()), f"Expected numeric budget for gated file, got: '{result.stdout}'"

# === T002270: s1.ignore awareness ===

def test_t002270_residual_budget_is_empty_for_a_file_listed_under_s1_ignore(run_cmd, repo_root, lint):
    # scripts/ticket.sh is a sanctioned single-file CLI on the s1.ignore list.
    result = _selftest(run_cmd, repo_root, lint, "residual_budget", "scripts/ticket.sh")
    assert result.returncode == 0, result.output
    assert result.output == ""

def test_t002270_a_plan_touching_an_s1_ignored_file_triggers_no_b1b_split_demand(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "s1-ignored-file.md"))
    assert result.returncode == 0, result.output
    assert "B1b" not in result.output

def test_t002270_a_claimed_budget_on_an_s1_ignored_file_warns_w4_without_failing(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "s1-ignored-with-budget.md"))
    assert result.returncode == 0, result.output
    assert "W4" in result.output
    assert "scripts/ticket.sh" in result.output

def test_t002270_omitting_the_budget_on_an_s1_ignored_file_stays_silent_no_w4(run_cmd, repo_root, lint, fix):
    result = _lint(run_cmd, repo_root, lint, str(fix / "s1-ignored-file.md"))
    assert result.returncode == 0, result.output
    assert "W4" not in result.output

# === T002342: W3 partial-mode with line-suffix should NOT warn ===

def test_w3_partial_line_suffix_reference_does_not_trigger_false_w3_warning(run_cmd, repo_root, lint, fix):
    # scripts/register-scope.sh IS referenced in the partial tasks with a line-suffix (:6-31)
    result = _lint(run_cmd, repo_root, lint, str(fix / "w3-partial-line-suffix" / "tasks.md"))
    assert result.returncode == 0, result.output
    assert "W3" not in result.output
