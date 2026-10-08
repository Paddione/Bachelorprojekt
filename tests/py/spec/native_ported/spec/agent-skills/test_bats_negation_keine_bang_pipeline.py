"""Native migration of tests/spec/agent-skills/bats-negation-keine-bang-pipeline.bats."""

def test_tests_claude_md_verbietet_die_nackte_bang_pipeline_als_negativ_assertion(repo_root):
    claude_tests = repo_root / "tests" / "CLAUDE.md"
    # Positiv-Anker: die Konventionszeile existiert und nennt das Anti-Muster samt Abhilfe.
    lines = [
        f"{n}:{line}"
        for n, line in enumerate(claude_tests.read_text(encoding="utf-8").splitlines(), start=1)
        if "Negativ-Assertion" in line
    ]
    output = "\n".join(lines)
    assert output != ""
    assert "'!'-Pipeline" in output
