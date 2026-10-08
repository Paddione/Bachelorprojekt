"""Native migration of tests/spec/health-goals/zielfamilien-audit.bats."""

import pytest


@pytest.fixture
def runner(repo_root):
    return repo_root / "scripts" / "lib" / "zielfamilien-audit.sh"


@pytest.fixture
def ev(run_cmd, runner):
    def _evaluate(*args):
        return run_cmd(["bash", str(runner), "evaluate", *args])

    return _evaluate


@pytest.fixture
def fx(tmp_path):
    return tmp_path / "fx"


def _basis(fx, family):
    path = fx / "basis" / family
    path.mkdir(parents=True, exist_ok=True)
    return path


def _check(run_cmd, runner, fx, family):
    return run_cmd(["bash", str(runner), "check", "--family", family, "--fixture", str(fx)])


def _anchor_absent(run_cmd, runner, fx, family, goal):
    (_basis(fx, family) / f"{goal}.absent").touch()
    result = _check(run_cmd, runner, fx, family)
    assert result.returncode == 1, result.output
    assert f"FAIL {goal} E5" in result.output


def _anchor_present(run_cmd, runner, fx, family, goal, value):
    base = _basis(fx, family)
    (base / f"{goal}.present").touch()
    (base / f"{goal}.value").write_text(f"{value}\n", encoding="utf-8")
    result = _check(run_cmd, runner, fx, family)
    assert result.returncode == 0, result.output
    assert f"PASS {goal}" in result.output


# ── Familie-Liste ────────────────────────────────────────────────────────────

def test_list_families_18_in_scope_familien_ohne_g_llm_g_wt(run_cmd, runner):
    result = run_cmd(["bash", str(runner), "list-families"])
    assert result.returncode == 0, result.output
    lines = result.output.splitlines()
    for family in ("AGENTIC", "BRAIN", "CFG", "CI", "CQ", "DB", "DEP", "DOC", "E2E", "FE",
                   "GIT", "IF", "IMG", "OPS", "RH", "SEC", "SIZE", "TEST"):
        assert family in lines, f"Familie {family} fehlt in list-families"
    assert "LLM" not in lines and "WT" not in lines, "G-LLM* und G-WT* duerfen nicht im Audit-Scope stehen"


# ── Regel-Engine (evaluate) ──────────────────────────────────────────────────

def test_evaluate_0_bei_fehlender_mess_basis_ist_e1_vakuos_gruen_t002356_m1(ev):
    result = ev("G-CQ02", "0", "--absent")
    assert result.returncode == 1
    assert "FAIL G-CQ02 E1" in result.output


def test_evaluate_bei_vorhandener_basis_ist_e2_skip_forever(ev):
    result = ev("G-DB09", "-", "--present")
    assert result.returncode == 1
    assert "FAIL G-DB09 E2" in result.output


def test_evaluate_nicht_zahl_im_arithmetischen_vergleich_ist_e4(ev):
    result = ev("G-IF02", "degraded")
    assert result.returncode == 1
    assert "FAIL G-IF02 E4" in result.output


def test_evaluate_zahl_bei_vorhandener_basis_ist_pass(ev):
    result = ev("G-DB09", "3", "--present")
    assert result.returncode == 0
    assert "PASS G-DB09" in result.output


# ── End-to-End (check) ───────────────────────────────────────────────────────

def test_check_family_cq_fehlende_basis_fail_g_cq02_exit_1(run_cmd, runner, fx):
    _basis(fx, "CQ")
    (fx / "basis" / "CQ" / "G-CQ02.absent").touch()
    result = _check(run_cmd, runner, fx, "CQ")
    assert result.returncode == 1
    assert "FAIL G-CQ02" in result.output


def test_check_family_cq_basis_vorhanden_pass_exit_0(run_cmd, runner, fx):
    _basis(fx, "CQ")
    (fx / "basis" / "CQ" / "G-CQ02.present").touch()
    result = _check(run_cmd, runner, fx, "CQ")
    assert result.returncode == 0
    assert "PASS G-CQ02" in result.output


# ── Rollen-Matrix evaluate (p4, REQ-004) ─────────────────────────────────────

def test_evaluate_echte_null_bei_vorhandener_basis_ist_pass(ev):
    result = ev("G-DB09", "0", "--present")
    assert result.returncode == 0
    assert "PASS G-DB09" in result.output


def test_evaluate_bei_fehlender_basis_ist_pass_n_a_statt_0_ist_korrekt(ev):
    result = ev("G-DB09", "-", "--absent")
    assert result.returncode == 0
    assert "PASS G-DB09" in result.output


def test_evaluate_leerer_messwert_bei_fehlender_basis_ist_e1(ev):
    result = ev("G-CQ02", "", "--absent")
    assert result.returncode == 1
    assert "FAIL G-CQ02 E1" in result.output


def test_evaluate_textwert_ist_e4_unabhaengig_vom_basis_status(ev):
    result = ev("G-IF02", "degraded", "--absent")
    assert result.returncode == 1
    assert "FAIL G-IF02 E4" in result.output


def test_evaluate_reale_zahl_trotz_fehlender_basis_ist_pass(ev):
    result = ev("G-DB09", "5", "--absent")
    assert result.returncode == 0
    assert "PASS G-DB09" in result.output


# ── check-Rollen (p4: Exit-Semantik, SKIP, .value) ───────────────────────────

def test_check_goal_ohne_marker_skip_exit_0_kein_exit_einfluss(run_cmd, runner, fx):
    _basis(fx, "DB")
    result = _check(run_cmd, runner, fx, "DB")
    assert result.returncode == 0
    assert "SKIP G-DB09" in result.output


def test_check_present_plus_value_messwert_pass_via_evaluate_exit_0(run_cmd, runner, fx):
    base = _basis(fx, "CQ")
    (base / "G-CQ02.present").touch()
    (base / "G-CQ02.value").write_text("3\n", encoding="utf-8")
    result = _check(run_cmd, runner, fx, "CQ")
    assert result.returncode == 0
    assert "PASS G-CQ02" in result.output


def test_check_gemischte_familie_absent_plus_present_fail_e5_und_pass_exit_1(run_cmd, runner, fx):
    base = _basis(fx, "CQ")
    (base / "G-CQ02.absent").touch()
    (base / "G-CQ04.present").touch()
    result = _check(run_cmd, runner, fx, "CQ")
    assert result.returncode == 1
    assert "FAIL G-CQ02 E5" in result.output
    assert "PASS G-CQ04" in result.output


# ── Regressions-Anker je geschaerftem Ziel (p4, REQ-004) ─────────────────────

def test_anker_g_rh02_basis_weg_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "RH", "G-RH02")


def test_anker_g_rh02_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "RH", "G-RH02", 0)


def test_anker_g_test02_basis_weg_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "TEST", "G-TEST02")


def test_anker_g_test02_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "TEST", "G-TEST02", 0)


def test_anker_g_sec01_basis_weg_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "SEC", "G-SEC01")


def test_anker_g_sec01_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "SEC", "G-SEC01", 0)


def test_anker_g_git02_basis_weg_ref_fehlt_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "GIT", "G-GIT02")


def test_anker_g_git02_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "GIT", "G-GIT02", 0)


def test_anker_g_cq02_basis_weg_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "CQ", "G-CQ02")


def test_anker_g_cq02_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "CQ", "G-CQ02", 0)


def test_anker_g_cq06_basis_weg_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "CQ", "G-CQ06")


def test_anker_g_cq06_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "CQ", "G-CQ06", 0)


def test_anker_g_fe03_basis_weg_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "FE", "G-FE03")


def test_anker_g_fe03_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "FE", "G-FE03", 0)


def test_anker_g_fe04_basis_weg_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "FE", "G-FE04")


def test_anker_g_fe04_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "FE", "G-FE04", 0)


def test_anker_g_test03_basis_weg_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "TEST", "G-TEST03")


def test_anker_g_test03_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "TEST", "G-TEST03", 0)


def test_anker_g_if02_basis_weg_dateien_fehlen_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "IF", "G-IF02")


def test_anker_g_if02_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "IF", "G-IF02", 0)


def test_anker_g_dep03_basis_weg_dockerfile_fehlt_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "DEP", "G-DEP03")


def test_anker_g_dep03_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "DEP", "G-DEP03", 0)


def test_anker_g_doc02_basis_weg_claude_md_fehlt_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "DOC", "G-DOC02")


def test_anker_g_doc02_basis_da_messwert_239_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "DOC", "G-DOC02", 239)


def test_anker_g_sec05_basis_weg_main_ref_fehlt_fail_e5(run_cmd, runner, fx):
    _anchor_absent(run_cmd, runner, fx, "SEC", "G-SEC05")


def test_anker_g_sec05_basis_da_messwert_0_pass(run_cmd, runner, fx):
    _anchor_present(run_cmd, runner, fx, "SEC", "G-SEC05", 0)


# ── E2-Regressions-Anker (SKIP-forever trotz vorhandener Basis) ──────────────

def test_anker_e2_present_plus_value_dash_fail_e2_skip_forever(run_cmd, runner, fx):
    base = _basis(fx, "DB")
    (base / "G-DB09.present").touch()
    (base / "G-DB09.value").write_text("-\n", encoding="utf-8")
    result = _check(run_cmd, runner, fx, "DB")
    assert result.returncode == 1
    assert "FAIL G-DB09 E2" in result.output
