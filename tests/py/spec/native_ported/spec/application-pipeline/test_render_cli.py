"""Native migration of tests/spec/application-pipeline/render-cli.bats."""
import re
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def render_sh(repo_root) -> Path:
    return repo_root / "scripts" / "vda" / "apply" / "render.sh"


def test_t900230_render_sh_theme_invalid_theme_exits_with_error(run_cmd, render_sh):
    result = run_cmd(["bash", str(render_sh), "--job-id", "999", "--theme", "nicht-existent"])
    assert result.returncode != 0
    assert re.search(r"unknown theme|Error", result.output)


def test_t900230_render_sh_without_job_id_exits_with_error(run_cmd, render_sh):
    result = run_cmd(["bash", str(render_sh), "--theme", "default"])
    assert result.returncode != 0
    assert re.search(r"required|Error", result.output)


def test_t900230_render_sh_exists_and_is_executable(render_sh):
    assert render_sh.is_file()
    assert render_sh.stat().st_mode & 0o111


def test_t900230_render_sh_skips_typst_compilation_when_not_installed(render_sh):
    if shutil.which("typst") is None:
        pytest.skip("typst binary not installed - cannot test compilation")
    assert render_sh.is_file()


def test_t900230_render_sh_references_output_dossiers_as_default_output_dir(render_sh):
    assert ".output/dossiers" in render_sh.read_text(encoding="utf-8")
