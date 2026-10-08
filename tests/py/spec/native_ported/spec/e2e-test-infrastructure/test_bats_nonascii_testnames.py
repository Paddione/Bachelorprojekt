"""Native migration of tests/spec/e2e-test-infrastructure/bats-nonascii-testnames.bats."""

import pytest

FIXTURE_BYTES = (
    b'@test "plain ascii" { true; }\n'
    b'@test "umlaut \xc3\xbc im namen" { true; }\n'
    b'@test "emdash \xe2\x80\x94 im namen" { true; }\n'
    b'@test "arrow \xe2\x86\x92 im namen" { true; }\n'
)


@pytest.fixture
def fixture_bats(tmp_path):
    """BATS setup(): fixture with non-ASCII test names (em-dash, umlaut, arrow)."""
    path = tmp_path / "nonascii.bats"
    path.write_bytes(FIXTURE_BYTES)
    return str(path)


def _has_ok4(output):
    return any(line.startswith("ok 4") for line in output.splitlines())


def test_t900065_tests_bats_fuehrt_nicht_ascii_testnamen_aus(run_cmd, repo_root, fixture_bats):
    r = run_cmd(["env", "-u", "LC_ALL", "LANG=", "bash", str(repo_root / "tests/bats"), fixture_bats])
    assert r.returncode == 0, f"Exit {r.returncode}:\n{r.output}"
    assert _has_ok4(r.output), f"weniger als 4 Tests ausgefuehrt:\n{r.output}"


def test_t900065_tests_bats_meldet_keinen_unknown_test_name(run_cmd, repo_root, fixture_bats):
    r = run_cmd(["env", "-u", "LC_ALL", "LANG=", "bash", str(repo_root / "tests/bats"), fixture_bats])
    assert "unknown test name" not in r.output.lower(), f"Locale-Ausfall reproduziert:\n{r.output}"
    assert "instead of expected" not in r.output.lower(), f"nicht alle Tests ausgefuehrt:\n{r.output}"


def test_t900065_scripts_lib_run_bats_sh_fuehrt_nicht_ascii_testnamen_aus(run_cmd, repo_root, fixture_bats):
    r = run_cmd(["env", "-u", "LC_ALL", "LANG=", "bash", str(repo_root / "scripts/lib/run-bats.sh"), fixture_bats])
    assert r.returncode == 0, f"Exit {r.returncode}:\n{r.output}"
    assert _has_ok4(r.output), f"weniger als 4 Tests ausgefuehrt:\n{r.output}"


def test_t900065_ein_explizit_gesetztes_lc_all_wird_nicht_ueberschrieben(run_cmd, repo_root):
    r = run_cmd(
        ["env", "LC_ALL=C.UTF-8", "bash", "-c",
         f"bash '{repo_root}/tests/bats' --version >/dev/null && printf '%s' \"$LC_ALL\""]
    )
    assert r.returncode == 0
    assert r.output == "C.UTF-8"


def test_t900065_positiv_anker_die_fixture_traegt_wirklich_nicht_ascii(fixture_bats):
    lines_with_non_ascii = [l for l in open(fixture_bats, "rb").read().splitlines() if any(b > 0x7F for b in l)]
    assert len(lines_with_non_ascii) == 3
