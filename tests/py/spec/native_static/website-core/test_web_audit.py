"""Native pytest migration of tests/spec/website-core/web-audit.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_chat_template_kwargs_enable_thinking_auf_false_gesetzt_7(repo_root, run_cmd, tmp_path):
    'chat_template_kwargs: enable_thinking auf false gesetzt'
    path_audit_script = 'scripts/web-audit.mjs'
    path_fixture_html = 'tests/fixtures/web-audit/route-sample.html'
    path_fixture_axe = 'tests/fixtures/web-audit/axe-sample.json'
    path_fixture_lh = 'tests/fixtures/web-audit/lighthouse-sample.json'
    result = run_cmd(['grep', '-qE', 'enable_thinking\\s*:\\s*false', str(repo_root) + '/' + path_audit_script])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'chat_template_kwargs.*enable_thinking', str(repo_root) + '/' + path_audit_script])
    assert result.returncode == 0, result.output
