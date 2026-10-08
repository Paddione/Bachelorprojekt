"""Native migration of tests/spec/e2e-test-infrastructure/bats-missing-file-exit0.bats."""

import os

import pytest


@pytest.fixture
def wrapper(repo_root):
    path = repo_root / "scripts" / "lib" / "run-bats.sh"
    if not os.access(path, os.X_OK):
        pytest.skip("scripts/lib/run-bats.sh existiert noch nicht (T003278 RED-Phase)")
    return str(path)


def test_t003278_fehlende_bats_datei_wrapper_endet_mit_exit_ungleich_0(run_cmd, repo_root, wrapper):
    r = run_cmd(["bash", wrapper, str(repo_root / "tests/spec/nicht-da-T003278.bats")])
    assert r.returncode != 0


def test_t003278_fehlendes_verzeichnis_wrapper_endet_mit_exit_ungleich_0(run_cmd, repo_root, wrapper):
    r = run_cmd(["bash", wrapper, "-r", str(repo_root / "tests/spec/definitiv-nicht-vorhanden-T003278")])
    assert r.returncode != 0


def test_t003278_positiv_anker_existierender_testpfad_laeuft_normal_und_propagiert_exit(run_cmd, tmp_path, wrapper):
    # Positiv-Anker: ein gruener Mini-Test muss exit 0 durchreichen.
    passing = tmp_path / "pass.bats"
    passing.write_text('@test "pass" {\n  true\n}\n')
    r = run_cmd(["bash", wrapper, str(passing)])
    assert r.returncode == 0
