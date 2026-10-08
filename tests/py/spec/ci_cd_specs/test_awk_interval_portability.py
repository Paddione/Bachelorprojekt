"""Native assertions from tests/spec/ci-cd/awk-interval-portability.bats."""

import re


def test_scan_has_awk_regex_positive_anchor(repo_root):
    pattern = re.compile(r"(~ */|sub\(/|gsub\(/)")
    assert any(pattern.search(file.read_text()) for file in (repo_root / "scripts").rglob("*.sh"))


def test_no_awk_interval_expressions(repo_root):
    test_scan_has_awk_regex_positive_anchor(repo_root)
    pattern = re.compile(r"(~ */|sub\(/|gsub\(/|match\(.*/)[^/]*\{[0-9]+,[0-9]*\}")
    bad = []
    for directory in ["scripts", "tests"]:
        for file in (repo_root / directory).rglob("*.sh"):
            bad.extend(f"{file}:{i}" for i, line in enumerate(file.read_text().splitlines(), 1) if pattern.search(line))
    assert not bad, bad


def test_ticket_grill_header_regex_is_portable(repo_root):
    assert "/^###?[" in (repo_root / "scripts/lib/ticket-grill.sh").read_text()
