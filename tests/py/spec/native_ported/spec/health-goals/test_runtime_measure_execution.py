"""Native migration of tests/spec/health-goals/runtime-measure-execution.bats."""

import os
import re
import subprocess

import pytest

FLUX_FIXTURE = """{"items": [
  {"metadata": {"generation": 1},
   "spec": {}, "status": {"observedGeneration": 1, "conditions": [{"type": "Ready", "status": "True"}]}},
  {"metadata": {"generation": 3},
   "spec": {}, "status": {"observedGeneration": 1, "conditions": [{"type": "Ready", "status": "True"}]}},
  {"metadata": {"generation": 1, "labels": {"health-goals.paddione.de/environment": "non-production"}},
   "spec": {}, "status": {"observedGeneration": 1, "conditions": [{"type": "Ready", "status": "False"}]}},
  {"metadata": {"generation": 1},
   "spec": {"suspend": true}, "status": {"observedGeneration": 1, "conditions": [{"type": "Ready", "status": "True"}]}}
]}
"""


@pytest.fixture(autouse=True)
def _cwd(repo_root, monkeypatch):
    monkeypatch.chdir(repo_root)


def _merged(args, repo_root, extra_env=None):
    """Mirrors bats run and the 2>&1 measure helper: stdout and stderr in one stream."""
    env = dict(os.environ)
    env.update(extra_env or {})
    proc = subprocess.run(
        args,
        cwd=str(repo_root),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=120,
    )
    return proc.returncode, proc.stdout


def _measure(repo_root, mode, **env_vars):
    """Python form of measure(): runs runtime_measure <mode> in a bash subshell."""
    env = {"FAST": "0", **env_vars}
    _, out = _merged(
        ["bash", "-c", '. scripts/lib/health-goals-measure.sh && runtime_measure "$1"', "_", mode],
        repo_root,
        env,
    )
    return out.rstrip("\n")


def test_runtime_measure_liefert_fuer_svc_probe_eine_ganzzahl_nicht_leer_t900380(repo_root, tmp_path):
    assert (repo_root / "scripts" / "lib" / "health-goals-measure.sh").is_file()
    fixture = tmp_path / "svc-probe.json"
    fixture.write_text("{}", encoding="utf-8")
    out = _measure(repo_root, "svc-probe", HG_SVC_PROBE_INPUT=str(fixture))
    assert re.fullmatch(r"[0-9]+", out), (
        f"runtime_measure svc-probe lieferte '{out}' statt einer Ganzzahl"
    )


def test_runtime_measure_reicht_die_fixture_wirklich_durch_der_wert_folgt_der_datei_t900380(
    repo_root, tmp_path
):
    fixture = tmp_path / "flux.json"
    fixture.write_text(FLUX_FIXTURE, encoding="utf-8")
    out = _measure(repo_root, "flux", HG_FLUX_INPUT=str(fixture))
    assert out == "2", f"runtime_measure flux lieferte '{out}', erwartet 2"


def test_runtime_measure_bleibt_fail_closed_kaputte_fixture_ergibt_nicht_0_t900380(repo_root, tmp_path):
    fixture = tmp_path / "broken.json"
    fixture.write_text("kein json", encoding="utf-8")
    out = _measure(repo_root, "flux", HG_FLUX_INPUT=str(fixture))
    assert out == "-", f"kaputte Fixture lieferte '{out}' statt '-'"


def test_der_checker_meldet_einen_unbrauchbaren_messwert_als_n_a_mit_warnung_nicht_als_verletzung_t900380(
    repo_root, tmp_path
):
    values = tmp_path / "values.txt"
    values.write_text("", encoding="utf-8")
    _, output = _merged(
        ["bash", str(repo_root / "scripts" / "health-goals-check.sh"), "--only=G-SVC01"],
        repo_root,
        {"HG_VALUES_FILE": str(values)},
    )

    bash_err = [
        line for line in output.splitlines()
        if re.search(r"unbound variable|invalid indirect expansion", line)
    ]
    assert not bash_err, "Bash-Expansionsfehler im Checker-Output: " + "\n".join(bash_err)

    warn = sum(1 for line in output.splitlines() if "nicht-numerischer Messwert" in line)
    assert warn == 0, f"Checker meldete {warn}x 'nicht-numerischer Messwert' fuer G-SVC01"

    text = values.read_text(encoding="utf-8")
    assert re.search(r"^G-SVC01 [0-9]+ ", text, re.M), (
        "G-SVC01 hat keinen Ganzzahl-Wert in HG_VALUES_FILE geschrieben: " + text
    )
