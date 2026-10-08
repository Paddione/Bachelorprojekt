"""Native migration of tests/unit/brainstorm-extract-choice.bats."""
from pathlib import Path

import pytest


@pytest.fixture
def script(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "brainstorm-extract-choice.sh")


def test_extracts_last_choice_from_events_file(run_cmd, script, tmp_path):
    (tmp_path / "events").write_text(
        '{"type":"click","choice":"A","timestamp":1}\n'
        '{"type":"click","choice":"B","timestamp":2}\n',
        encoding="utf-8",
    )
    result = run_cmd(["bash", script, str(tmp_path)])
    assert result.returncode == 0
    assert result.output == "B"


def test_exits_1_when_no_events_file(run_cmd, script, tmp_path):
    result = run_cmd(["bash", script, str(tmp_path)])
    assert result.returncode == 1


def test_exits_1_when_no_choice_event_in_file(run_cmd, script, tmp_path):
    (tmp_path / "events").write_text('{"type":"scroll","timestamp":1}\n', encoding="utf-8")
    result = run_cmd(["bash", script, str(tmp_path)])
    assert result.returncode == 1
