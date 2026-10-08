"""Native migration of tests/spec/sdlc-cockpit/k5-epic-canvas.bats."""
# (K5, T002464)
# Pruefmodus gemischt: Routen-Tests gegen den laufenden Daemon (Daemon precondition via the ported
# daemon-endpoints module), E1-Tests als Quelltext-Konventionspruefung.

import importlib.util
import os
import re
from pathlib import Path

import pytest


def _load_sibling(name):
    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(f"_native_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _daemon(repo_root, run_cmd):
    endpoints = _load_sibling("test_daemon_endpoints.py")
    return endpoints._require_daemon(repo_root, run_cmd)


def _count_fetch_calls(path):
    """Zeilen mit fetch( ohne Zeilenkommentare (grep -v '^\\s*//' | grep -c 'fetch(')."""
    return sum(
        1 for line in path.read_text(encoding="utf-8").splitlines()
        if not re.match(r"^\s*//", line) and "fetch(" in line
    )


def test_t002464_get_api_cockpit_epics_ist_registriert_und_antwortet(repo_root, run_cmd):
    base = _daemon(repo_root, run_cmd)
    result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", f"{base}/api/cockpit/epics"])
    # 404 hiesse: Route nicht registriert.
    assert result.output == "200"


def test_t002464_api_cockpit_epics_liefert_fetched_at_d12(repo_root, run_cmd):
    base = _daemon(repo_root, run_cmd)
    result = run_cmd(["curl", "-s", f"{base}/api/cockpit/epics"])
    assert result.returncode == 0, result.output
    assert "fetchedAt" in result.output


def test_t002464_api_cockpit_epics_liefert_entweder_epics_oder_error_nie_stumm_nichts_d13(repo_root, run_cmd):
    base = _daemon(repo_root, run_cmd)
    result = run_cmd(["curl", "-s", f"{base}/api/cockpit/epics"])
    assert result.returncode == 0, result.output

    # POSITIV-ANKER: es kommt eine JSON-Antwort zurueck.
    assert "fetchedAt" in result.output
    # Genau eines von beidem muss da sein.
    if '"error"' not in result.output:
        assert '"epics"' in result.output


def test_t002464_kein_k5_panel_und_kein_store_ruft_fetch_direkt_auf_e1_negativtest_positiv_anker(repo_root):
    kit = repo_root / ".lavish/kit"

    # POSITIV-ANKER: der Adapter stellt die K5-Methoden bereit.
    assert "function epics" in (kit / "adapter.js").read_text(encoding="utf-8")

    # GEGENPROBE: adapter.js enthaelt fetch( — er ist die eine Stelle dafuer.
    assert _count_fetch_calls(kit / "adapter.js") > 0

    # NEGATIVTEST: die K5-Dateien enthalten kein eigenes fetch(.
    assert _count_fetch_calls(kit / "panel-epic-canvas.js") == 0
    assert _count_fetch_calls(kit / "canvas-store.js") == 0


def test_t002464_der_e1_guard_erfasst_alle_panel_js_nicht_nur_panel_js(repo_root):
    kit = repo_root / ".lavish/kit"
    panels = sorted(p for p in kit.glob("panel*.js") if p.is_file())

    # POSITIV-ANKER: mehr als eine panel*.js-Datei, sonst prueft die Schleife nichts.
    assert len(panels) >= 2

    offenders = [p.name for p in panels if _count_fetch_calls(p) > 0]
    assert offenders == [], f"Panels mit direktem fetch(): {' '.join(offenders)}"


def test_t002464_health_nennt_den_checkout_aus_dem_der_daemon_laeuft(repo_root, run_cmd):
    base = _daemon(repo_root, run_cmd)
    result = run_cmd(["curl", "-s", f"{base}/health"])
    assert result.returncode == 0, result.output
    assert '"root"' in result.output

    expected = os.path.realpath(repo_root)
    match = re.search(r'"root":"([^"]*)"', result.output)
    assert match, "root field missing"
    reported = os.path.realpath(match.group(1))
    assert reported == expected


def test_t002464_alle_k5_kit_dateien_existieren(repo_root):
    kit = repo_root / ".lavish/kit"
    for name in ["canvas-store.js", "panel-epic-canvas.js", "panel-epic-canvas.css", "panel-epic-canvas.html"]:
        assert (kit / name).is_file(), f"fehlt: .lavish/kit/{name}"


def test_t002464_der_canvas_export_schreibt_nicht_serverseitig_k4_grenze(repo_root):
    panel = (repo_root / ".lavish/kit/panel-epic-canvas.js").read_text(encoding="utf-8")

    # POSITIV-ANKER: es gibt einen Export-Pfad im Panel.
    assert "buildExportMarkdown" in panel

    # Kein POST-Pfad auf epics/export.
    assert panel.count("epics/export") == 0
