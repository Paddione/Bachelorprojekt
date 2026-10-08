"""Native migration of tests/local/NFA-10.bats."""
import os
import shutil

import pytest


def test_nfa_10_healthz_p95_200ms_over_50_sequential_requests(run_cmd):
    """NFA-10: /healthz p95 < 200ms over 50 sequential requests"""
    url = os.environ.get("ARENA_WS_URL")
    if not url:
        pytest.skip("need ARENA_WS_URL")
    if not shutil.which("curl"):
        pytest.skip("curl not installed")

    times = []
    for _ in range(50):
        result = run_cmd(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{time_total}\n", f"{url}/healthz"],
            timeout=300,
        )
        result.check()
        times.append(result.stdout.strip())

    # `sort -n | awk 'NR==48'`: the 48th of 50 sorted samples.
    p95 = sorted(times, key=float)[47]
    p95_ms = int(float(p95) * 1000)
    assert p95_ms < 200, f"p95 = {p95_ms}ms"
