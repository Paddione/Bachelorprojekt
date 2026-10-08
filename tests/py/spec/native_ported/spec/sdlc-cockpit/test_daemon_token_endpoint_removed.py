"""Native migration of tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats."""
# (T002505)
# Pruefmodus: Quelltext fuer die Routen-Ebene (dokumentierte Ausnahme), plus Laufzeit-Tests, die
# ohne laufenden Daemon skippen. Daemon precondition mirrors daemon-helper.bash (require_daemon).

import os
import re
from pathlib import Path

import pytest


def _load_sibling(name):
    import importlib.util

    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(f"_native_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def base(repo_root, run_cmd):
    endpoints = _load_sibling("test_daemon_endpoints.py")
    return endpoints._require_daemon(repo_root, run_cmd)


def test_server_ts_registriert_keinen_token_endpoint_mehr(repo_root):
    server = repo_root / ".lavish/kit/daemon/server.ts"
    assert server.is_file()
    lines = server.read_text(encoding="utf-8").splitlines()

    # POSITIV-ANKER: die Datei registriert noch Routen.
    n_routes = sum(1 for line in lines if re.match(r"^app\.(get|post)\(", line))
    print(f"registrierte Routen: {n_routes}")
    assert n_routes >= 8

    # Der eigentliche Gegenstand: keine Token-Route.
    token_route = [line for line in lines if re.match(r"^app\.(get|post)\('/api/cockpit/token'", line)]
    print(f"Token-Route: {token_route[0] if token_route else '<keine>'}")
    assert token_route == []


def test_der_token_wird_weiterhin_in_eine_0600_datei_geschrieben(repo_root):
    # Gegenstueck: entfernt werden soll der HTTP-Weg, nicht der Token selbst.
    text = (repo_root / ".lavish/kit/daemon/server.ts").read_text(encoding="utf-8")
    count = text.count("writeTokenFile(")
    print(f"writeTokenFile-Aufrufe: {count}")
    assert count >= 1


def test_laufender_daemon_liefert_404_auf_api_cockpit_token(base, run_cmd):
    # Anker: eine bestehende Route muss antworten.
    result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", "5", f"{base}/health"])
    assert result.output == "200"

    result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", "5", f"{base}/api/cockpit/token"])
    print(f"Token-Endpoint: HTTP {result.output}")
    assert result.output == "404"


def test_laufender_daemon_fuehrt_kein_kommando_aus_einem_namespace_parameter_aus(base, run_cmd, tmp_path):
    marker = tmp_path / f"cockpit-injection-probe.{os.getpid()}"
    if marker.exists():
        marker.unlink()
    # Nicht-destruktiver Payload: legt nur eine Markerdatei an.
    run_cmd(
        ["curl", "-s", "-o", "/dev/null", "-m", "10", "--get",
         "--data-urlencode", f"namespace=workspace; touch {marker}",
         f"{base}/api/admin/cluster/pods-list"],
        timeout=30,
    )
    assert not marker.exists(), f"Injection ausgefuehrt: {marker} existiert"
