"""Native migration of tests/spec/pocket-id-client-seed-timeout.bats."""

import re


def _manifest(repo_root):
    return (repo_root / "k3d" / "pocket-id-client-seed.yaml").read_text(encoding="utf-8")


def test_init_container_timeout_is_sufficient_for_cold_start_red_ge_60_is_too_low(repo_root):
    # Bis zur Korrektur ist -ge 60 vorhanden: dann schlaegt der Test fehl (Original: "grep && return 1 || return 0").
    assert not re.search(r'if \[ "\$i" -ge 60 \];', _manifest(repo_root))


def test_backoff_limit_is_reasonable_for_the_increased_timeout(repo_root):
    assert not re.search(r"backoffLimit: 5", _manifest(repo_root))
