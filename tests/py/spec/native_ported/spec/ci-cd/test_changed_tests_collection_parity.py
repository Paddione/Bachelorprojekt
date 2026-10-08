"""Native migration of tests/spec/ci-cd/changed-tests-collection-parity.bats."""

import re
import subprocess
from pathlib import Path

import pytest

SCRIPT_REL = "scripts/find-changed-tests.sh"


def _bats_lines(text: str):
    return [ln for ln in text.splitlines() if ln.endswith(".bats")]


def _find_bats(repo: Path, rel: str, maxdepth=None, mindepth=None):
    """find <rel> [-mindepth/-maxdepth] -name '*.bats' | wc -l -> Liste der Pfade."""
    base = repo / rel
    out = []
    for p in base.rglob("*.bats"):
        depth = len(p.relative_to(repo).parts) - len(Path(rel).parts)
        if maxdepth is not None and depth > maxdepth:
            continue
        if mindepth is not None and depth < mindepth:
            continue
        out.append(p)
    return out


@pytest.fixture
def env(repo_root):
    # setup(): export FIND_CHANGED_TESTS_FILES=".github/workflows/ci.yml"
    return {"FIND_CHANGED_TESTS_FILES": ".github/workflows/ci.yml"}


def _script(run_cmd, repo_root, env, *args, extra=None):
    e = dict(env)
    if extra:
        e.update(extra)
    return run_cmd(["bash", str(repo_root / SCRIPT_REL), *args], cwd=repo_root, env=e)


def test_t002518_der_spec_fallback_sammelt_rekursiv_wie_bats_r_tests_spec(run_cmd, repo_root, env):
    res = _script(run_cmd, repo_root, env, "spec")
    assert res.returncode == 0
    via_script = len(_bats_lines(res.output))
    via_runner = len(_find_bats(repo_root, "tests/spec"))
    # Positiv-Anker ZUERST: es muss Unterverzeichnis-Tests geben.
    nested = len(_find_bats(repo_root, "tests/spec", mindepth=2))
    if nested <= 0:
        pytest.fail("keine Unterverzeichnis-Tests vorhanden - dieser Test prueft nichts")
    assert via_script == via_runner, f"Fallback liefert {via_script}, 'bats -r tests/spec/' sieht {via_runner}"


def test_t002518_der_spec_fallback_enthaelt_die_unterverzeichnis_tests_wirklich(run_cmd, repo_root, env):
    res = _script(run_cmd, repo_root, env, "spec")
    assert res.returncode == 0
    lines = res.output.splitlines()
    assert any(ln.startswith("tests/spec/decommission/") for ln in lines), \
        "tests/spec/decommission/ fehlt in der Auswahl"
    assert any(ln.startswith("tests/spec/sdlc-cockpit/") for ln in lines), \
        "tests/spec/sdlc-cockpit/ fehlt in der Auswahl"


def test_t002518_der_unit_fallback_bleibt_flach_und_zieht_kein_vendortes_bats_core_ein(run_cmd, repo_root, env):
    res = _script(run_cmd, repo_root, env, "unit")
    assert res.returncode == 0
    via_script = len(_bats_lines(res.output))
    via_runner = len(_find_bats(repo_root, "tests/unit", maxdepth=1))
    # Positiv-Anker: unter tests/unit/lib/ MUSS es .bats geben.
    vendored = len(_find_bats(repo_root, "tests/unit/lib"))
    if vendored <= 0:
        pytest.fail("tests/unit/lib enthaelt keine .bats - Negativtest waere vakuos")
    # Die unit-Auswahl ist allowlist-gefiltert: nur kleiner oder gleich.
    assert via_script <= via_runner, f"unit-Fallback liefert {via_script}, flach vorhanden sind {via_runner}"
    assert not any(ln.startswith("tests/unit/lib/") for ln in res.output.splitlines()), \
        "vendortes bats-core in der unit-Auswahl - das darf nie laufen"


def test_t900676_tests_lib_aenderung_selektiert_relativ_ladende_konsumenten(run_cmd, repo_root, env):
    consumer = "tests/spec/local-llm-proxy/host-listener-auth.bats"
    consumer_path = repo_root / consumer
    assert consumer_path.is_file(), "Anker-Datei fehlt - dieser Test prueft nichts"
    assert "tests/lib" not in consumer_path.read_text(), \
        "Anker veraltet: Konsument erwaehnt tests/lib absolut - Probe griffe"
    res = _script(run_cmd, repo_root, env, "spec",
                  extra={"FIND_CHANGED_TESTS_FILES": "tests/lib/guard-preconditions.sh"})
    assert res.returncode == 0
    assert consumer in res.output.splitlines(), "relativ ladender Konsument fehlt in der Auswahl"
