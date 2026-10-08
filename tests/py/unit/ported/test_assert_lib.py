"""Native migration of tests/unit/assert_lib.bats."""
import json
import re
import shlex

import pytest


@pytest.fixture
def assert_lib(repo_root, run_cmd, tmp_path):
    """Source tests/lib/assert.sh in a fresh bash per call and return the results file.

    Mirrors test_helper.bash setup_results_file (RESULTS_FILE, VERBOSE=false).
    Every call runs under `set -e`, like a bats test body.
    """
    results = tmp_path / "results.jsonl"
    results.write_text("", encoding="utf-8")
    assert_sh = repo_root / "tests" / "lib" / "assert.sh"
    env = {"RESULTS_FILE": str(results), "VERBOSE": "false"}

    def _run(*calls: str):
        script = "\n".join(["set -e", f"source {shlex.quote(str(assert_sh))}", *calls])
        return run_cmd(["bash", "-c", script], env=env, timeout=60)

    return _run, results


def _call(fn: str, *args: str) -> str:
    return " ".join([fn, *(shlex.quote(a) for a in args)])


def _rows(results):
    return [json.loads(line) for line in results.read_text(encoding="utf-8").splitlines() if line]


def _last(results):
    return _rows(results)[-1]


def _last_status(results):
    return _last(results)["status"]


def _last_detail(results):
    return _last(results)["detail"]


# ── assert_eq ────────────────────────────────────────────────────


def test_assert_eq_pass_when_values_match(assert_lib):
    run, results = assert_lib
    result = run(_call("assert_eq", "hello", "hello", "TEST", "T1", "values match"))
    result.check()
    assert _last_status(results) == "pass"


def test_assert_eq_fail_when_values_differ(assert_lib):
    run, results = assert_lib
    result = run(_call("assert_eq", "hello", "world", "TEST", "T2", "values differ"))
    result.check()
    assert _last_status(results) == "fail"
    assert "Expected: world, Got: hello" in _last_detail(results)


def test_assert_eq_handles_empty_strings(assert_lib):
    run, results = assert_lib
    run(_call("assert_eq", "", "", "TEST", "T3", "empty strings")).check()
    assert _last_status(results) == "pass"


# ── assert_contains ──────────────────────────────────────────────


def test_assert_contains_pass_when_needle_found(assert_lib):
    run, results = assert_lib
    run(_call("assert_contains", "hello world", "world", "TEST", "T4", "needle found")).check()
    assert _last_status(results) == "pass"


def test_assert_contains_fail_when_needle_missing(assert_lib):
    run, results = assert_lib
    run(_call("assert_contains", "hello world", "xyz", "TEST", "T5", "needle missing")).check()
    assert _last_status(results) == "fail"


# ── assert_not_contains ──────────────────────────────────────────


def test_assert_not_contains_pass_when_needle_absent(assert_lib):
    run, results = assert_lib
    run(_call("assert_not_contains", "hello", "xyz", "TEST", "T6", "needle absent")).check()
    assert _last_status(results) == "pass"


def test_assert_not_contains_fail_when_needle_present(assert_lib):
    run, results = assert_lib
    run(_call("assert_not_contains", "hello world", "world", "TEST", "T7", "needle present")).check()
    assert _last_status(results) == "fail"


# ── assert_lt ────────────────────────────────────────────────────


def test_assert_lt_pass_when_actual_less_than_max(assert_lib):
    run, results = assert_lib
    run(_call("assert_lt", "5", "10", "TEST", "T8", "less than")).check()
    assert _last_status(results) == "pass"


def test_assert_lt_fail_when_actual_not_less_than_max(assert_lib):
    run, results = assert_lib
    run(_call("assert_lt", "10", "5", "TEST", "T9", "not less than")).check()
    assert _last_status(results) == "fail"


def test_assert_lt_fail_on_non_numeric_input(assert_lib):
    run, results = assert_lib
    run(_call("assert_lt", "abc", "10", "TEST", "T10", "non-numeric")).check()
    assert _last_status(results) == "fail"
    assert "Non-numeric" in _last_detail(results)


# ── assert_gt ────────────────────────────────────────────────────


def test_assert_gt_pass_when_actual_greater_than_min(assert_lib):
    run, results = assert_lib
    run(_call("assert_gt", "10", "5", "TEST", "T11", "greater than")).check()
    assert _last_status(results) == "pass"


def test_assert_gt_fail_when_actual_not_greater_than_min(assert_lib):
    run, results = assert_lib
    run(_call("assert_gt", "5", "10", "TEST", "T12", "not greater than")).check()
    assert _last_status(results) == "fail"


# ── assert_match ─────────────────────────────────────────────────


def test_assert_match_pass_when_regex_matches(assert_lib):
    run, results = assert_lib
    regex = r"^v[0-9]+\.[0-9]+\.[0-9]+$"
    run(_call("assert_match", "v1.2.3", regex, "TEST", "T13", "semver match")).check()
    assert _last_status(results) == "pass"


def test_assert_match_fail_when_regex_does_not_match(assert_lib):
    run, results = assert_lib
    run(_call("assert_match", "abc", "^[0-9]+$", "TEST", "T14", "no match")).check()
    assert _last_status(results) == "fail"


# ── assert_cmd ───────────────────────────────────────────────────


def test_assert_cmd_pass_on_successful_command(assert_lib):
    run, results = assert_lib
    run(_call("assert_cmd", "true", "TEST", "T15", "true succeeds")).check()
    assert _last_status(results) == "pass"


def test_assert_cmd_fail_on_failing_command(assert_lib):
    run, results = assert_lib
    run(_call("assert_cmd", "false", "TEST", "T16", "false fails")).check()
    assert _last_status(results) == "fail"


def test_assert_cmd_captures_command_output_in_detail(assert_lib):
    run, results = assert_lib
    run(_call("assert_cmd", "echo 'some error' && false", "TEST", "T17", "output captured")).check()
    assert _last_status(results) == "fail"


# ── skip_test ────────────────────────────────────────────────────


def test_skip_test_records_skip_status(assert_lib):
    run, results = assert_lib
    run(_call("skip_test", "TEST", "T18", "optional test", "not applicable")).check()
    assert _last_status(results) == "skip"


# ── JSONL output format ──────────────────────────────────────────


def test_output_each_assertion_produces_valid_json(assert_lib):
    run, results = assert_lib
    run(
        _call("assert_eq", "a", "a", "REQ", "T1", "first"),
        _call("assert_eq", "a", "b", "REQ", "T2", "second"),
        _call("skip_test", "REQ", "T3", "third"),
    ).check()
    lines = results.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 3
    for line in lines:
        json.loads(line)


def test_output_result_contains_all_required_fields(assert_lib):
    run, results = assert_lib
    run(_call("assert_eq", "x", "x", "FA-01", "T1", "field check")).check()
    last = _last(results)
    # jq -e fails on null/false; "" is a present value.
    for field in ("req", "test", "desc", "status", "duration_ms", "detail"):
        assert last.get(field) not in (None, False), f"missing field: {field}"


def test_output_duration_ms_is_a_number(assert_lib):
    run, results = assert_lib
    run(_call("assert_eq", "a", "a", "TEST", "T1", "timing")).check()
    dur = _last(results)["duration_ms"]
    assert re.fullmatch(r"[0-9]+", str(dur)), f"duration_ms not numeric: {dur!r}"


# ── assert_summary ───────────────────────────────────────────────


def test_assert_summary_returns_0_when_no_failures(assert_lib):
    run, _results = assert_lib
    result = run(
        _call("assert_eq", "a", "a", "TEST", "T1", "pass"),
        "assert_summary",
    )
    assert result.returncode == 0
    assert "1 passed" in result.output
    assert "0 failed" in result.output


def test_assert_summary_returns_non_zero_on_failures(assert_lib):
    run, _results = assert_lib
    result = run(
        _call("assert_eq", "a", "b", "TEST", "T1", "fail"),
        "assert_summary",
    )
    assert result.returncode != 0
    assert "1 failed" in result.output
