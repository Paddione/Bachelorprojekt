"""Native assertions from tests/spec/ci-cd/spec-test-no-fixed-sleep-polling.bats."""

import re


def test_kv_probe_actively_waits_for_both_ports(repo_root):
    source = (repo_root / "tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats").read_text()
    assert "http.server.HTTPServer" in source
    assert re.search(r"/dev/tcp/127\.0\.0\.1/\$(port_ok|port_500)", source)
    assert not re.search(r"^\s*sleep 1\s*$", source, re.M)
