"""Native migration of tests/spec/fleet-operations/firewall-program-match.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def script(repo_root: Path) -> Path:
    return repo_root / "scripts" / "llm" / "harden-gpu-firewall.ps1"


def test_harden_gpu_firewall_ps1_exists_and_takes_a_program_parameter(script):
    # Positiv-Anker fuer beide folgenden Tests.
    assert script.is_file()
    assert "[string]$Program" in script.read_text(encoding="utf-8")


def test_firewall_rule_matching_never_derives_identity_from_the_parent_directory_name(script):
    assert script.is_file()  # Positiv-Anker
    text = script.read_text(encoding="utf-8")
    hits = [l for l in text.splitlines() if "GetFileName($dir)" in l]
    assert not hits, (
        "rule matching uses the parent directory basename — collides with other "
        "llama builds that share a 'bin' subfolder (T002496):\n" + "\n".join(hits)
    )


def test_firewall_rule_matching_compares_against_the_full_program_path(script):
    assert script.is_file()  # Positiv-Anker
    text = script.read_text(encoding="utf-8")
    pattern = r"\$_\.Program.*-(i?eq|like)\s+\$(Program|normalizedProgram|programPath)"
    assert re.search(pattern, text), \
        "no direct comparison of $_.Program against the -Program argument found"
