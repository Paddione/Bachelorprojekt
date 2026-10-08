"""Native assertions from tests/spec/ci-cd/unknown-scope-names-source.bats."""

import pytest

@pytest.mark.parametrize(("scope", "accepted", "needles"), [
    ("plans", True, []),
    ("zzzunbekannt", False, []),
    ("plan", False, ["commitlint.config.cjs"]),
    ("plan", False, ["validate-commit-msg.sh scopes"]),
    ("zzzunbekannt", False, ["commitlint.config.cjs", "validate-commit-msg.sh scopes"]),
    ("plan", False, ["'plans'"]),
])
def test_scope_rejection_explains_source_and_alias(repo_root, run_cmd, tmp_path, scope, accepted, needles):
    file = tmp_path / "msg.txt"
    command = ["bash", str(repo_root / "scripts/validate-commit-msg.sh"), "message", str(file)]
    if not accepted:
        file.write_text("chore(plans): archive a merged change [T003139]\n")
        run_cmd(command).check()
    file.write_text(f"chore({scope}): archive a merged change [T003139]\n")
    result = run_cmd(command)
    if accepted:
        result.check()
    else:
        assert result.returncode != 0
        for needle in needles:
            assert needle in result.output
