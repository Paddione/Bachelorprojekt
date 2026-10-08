"""Tests for agentic-trends-radar workflow (migrated from tests/spec/agentic-trends-radar.bats)."""

from pathlib import Path
import re


def test_agentic_trends_radar_workflow_structure(repo_root: Path):
    workflow = repo_root / ".claude" / "workflows" / "agentic-trends-radar.js"
    assert workflow.is_file()
    content = workflow.read_text()

    assert "export const meta" in content
    assert "name: 'agentic-trends-radar'" in content
    assert "description:" in content
    assert "whenToUse:" in content

    # 4 phases
    titles = re.findall(r"title:\s*['\"]([^'\"]+)['\"]", content)
    assert len(titles) >= 4
    for phase in ["Sweep", "Konsolidieren", "Bewerten", "Synthese"]:
        assert phase in content

    # 5 sweep angles
    for angle in ["vendor", "research", "community", "oss", "practices"]:
        assert f"'{angle}'" in content or f'"{angle}"' in content

    # schema contracts
    for field in ["name", "summary", "sources", "momentum"]:
        assert field in content

    for verdict in ["adopt", "trial", "hold", "skip"]:
        assert f"'{verdict}'" in content or f'"{verdict}"' in content

    for field in ["borrow_what", "effort", "risks"]:
        assert field in content

    assert "maxItems: 10" in content
    assert "OUR_SDLC" in content
    assert "plan" in content
    assert "dev-flow" in content
    assert re.search(r"return.*report.*results.*dropped", content)
