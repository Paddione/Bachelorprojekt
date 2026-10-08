"""Native assertions from tests/spec/ci-cd/spec-test-no-fixed-sleep-polling.bats.

[T901392] Der gepruefte Test ist das pytest-Modul des kv-probe-endpoint-guard; es muss aktiv
auf beide Fake-Server-Ports warten statt fest zu schlafen."""

import re


def test_kv_probe_actively_waits_for_both_ports(repo_root):
    source = (repo_root / "tests/py/spec/native_ported/spec/local-llm-proxy/test_kv_probe_endpoint_guard.py").read_text()
    assert "http.server.HTTPServer" in source
    assert re.search(r"_port_open\(PORT_OK\) and _port_open\(PORT_500\)", source)
    assert not re.search(r"^\s*time\.sleep\(1\)\s*$", source, re.M)
