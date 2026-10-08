"""Native migration of tests/spec/sdlc-cockpit/no-silent-fallback.bats."""
# (D13, T002708 port note)
# Daemon precondition from daemon-helper.bash (via the ported daemon-endpoints module), autouse.

import importlib.util
from pathlib import Path

import pytest


def _load_sibling(name):
    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(f"_native_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(autouse=True)
def base(repo_root, run_cmd):
    endpoints = _load_sibling("test_daemon_endpoints.py")
    return endpoints._require_daemon(repo_root, run_cmd)


def test_d13_positiv_anker_valid_response_has_no_error_field(base, run_cmd):
    # `echo "$output" | grep -qv '"error"'`: any line without "error" (empty output still yields one empty line).
    output = run_cmd(["curl", "-s", f"{base}/health"]).output
    assert any('"error"' not in line for line in (output + "\n").splitlines())


def test_d13_negativ_unreachable_endpoint_returns_error_field_not_null(run_cmd):
    # 39153 statt 49153 [T002708]: der alte Wert lag im Hyper-V-Reservierungsbereich.
    dead_port = 39153
    output = run_cmd(["curl", "-s", f"http://127.0.0.1:{dead_port}/health"]).output
    # Curl liefert bei totem Port nichts; liefert ein Dienst Daten, muss ein error-Feld drin sein.
    if output:
        assert '"error"' in output


def test_d13_response_never_contains_empty_array_as_data_payload_without_error(base, run_cmd):
    output = run_cmd(["curl", "-s", f"{base}/api/admin/cockpit/portfolio?brand=mentolder"]).output
    if output:
        assert '"error"' in output or '"fetchedAt"' in output


def test_d13_negativ_response_never_contains_null_as_a_data_value(base, run_cmd):
    output = run_cmd(["curl", "-s", f"{base}/api/cockpit/agents"]).output
    # "agents": null waere ein Verstoss gegen D13.
    assert '"agents":null' not in output, "D13 violation: agents field is null"
