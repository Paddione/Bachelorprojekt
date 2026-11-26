"""Runner-Image-Pin fuer den E2E-Nightly (e2e.yml).

WebKit (Playwright 1.64, webkit-2370) bindet an libicudata.so.74 (ICU 74 =
Ubuntu 24.04/noble). `ubuntu-latest` migriert mit der Zeit auf neuere Images,
deren apt-Bestand die alte ICU nicht mehr enthaelt — WebKit startet dann nicht
und alle [ios]-Specs sind rot, obwohl `install-deps` laeuft (Regression
16.-23.11.2026, 8 chronische Failures, DEPLOY_DRIFT-unabhaengig). Daher ist der
Pin auf ubuntu-24.04 absichtlich; anheben nur mit WebKit-Smoke-Beleg.
"""

import pytest
import yaml


@pytest.fixture
def e2e_job(repo_root):
    return yaml.safe_load((repo_root / ".github/workflows/e2e.yml").read_text())["jobs"]["playwright"]


def test_e2e_runner_pinned_to_noble_for_webkit_icu(e2e_job):
    assert e2e_job["runs-on"] == "ubuntu-24.04"


def test_e2e_still_installs_system_deps_unconditionally(e2e_job):
    steps = e2e_job["steps"]
    dep_steps = [s for s in steps if "install-deps" in str(s.get("run", ""))]
    assert dep_steps, "install-deps-Schritt fehlt (T900601-Regression)"
    assert any("webkit" in str(s.get("run", "")) for s in dep_steps)

def test_e2e_has_webkit_launch_smoke_step(e2e_job):
    # Pruefmodus: CI-Konfiguration manifestiert sich nur im Quelltext
    # (Test-Resultats-Konvention, Ausnahme) — Zusicherung haengt an der
    # Fail-closed-Semantik (launch + exit 1), nicht am Wortlaut der Meldung.
    steps = e2e_job["steps"]
    runs = [str(s.get("run", "")) for s in steps]
    # Positiv-Anker: ohne Browser-Installation waere die Probe sinnlos.
    assert any("playwright install" in r for r in runs)
    probes = [r for r in runs if "webkit" in r.lower() and "launch" in r]
    assert probes, "WebKit-Launch-Probe fehlt (G-E2E01-Fail-fast)"
    assert any("process.exit(1)" in r for r in probes), \
        "Probe muss fail-closed sein (exit 1 bei Launch-Fehler)"
