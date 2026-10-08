"""tests/py/batch/test_batch_workflow_gen.py — Migration of tests/batch/batch-workflow-gen.bats."""
import re
from pathlib import Path
import pytest


@pytest.fixture
def generated_workflow(tmp_path: Path, repo_root: Path, run_cmd) -> Path:
    out_file = tmp_path / "batch-workflow.mjs"
    script = repo_root / "scripts" / "batch-workflow-gen.sh"
    res = run_cmd(["bash", str(script), str(out_file)], cwd=repo_root)
    res.check(0)
    assert out_file.is_file()
    return out_file


def test_fa_batch_01_generated_script_syntax_valid(generated_workflow: Path, run_cmd):
    """FA-BATCH-01: generiertes Script besteht JavaScript-Syntaxcheck."""
    code = (
        'const fs = require("fs"); '
        'const content = fs.readFileSync(process.argv[1], "utf8").replace(/^export\\s+/gm, ""); '
        'new (async () => {}).constructor("args", "log", "phase", "pipeline", "agent", "parallel", content);'
    )
    res = run_cmd(["node", "-e", code, str(generated_workflow)])
    res.check(0)


def test_script_contains_export_const_meta(generated_workflow: Path):
    """Script enthaelt export const meta."""
    content = generated_workflow.read_text(encoding="utf-8")
    assert "export const meta" in content


def test_script_contains_all_three_phases(generated_workflow: Path):
    """Script enthaelt alle drei Phasen."""
    content = generated_workflow.read_text(encoding="utf-8")
    assert "Isolated" in content
    assert "Shared" in content
    assert "Stage" in content


def test_script_references_tickets(generated_workflow: Path):
    """Script referenziert tickets."""
    content = generated_workflow.read_text(encoding="utf-8")
    assert re.search(r"(?:parsedArgs|args)\.tickets", content)
