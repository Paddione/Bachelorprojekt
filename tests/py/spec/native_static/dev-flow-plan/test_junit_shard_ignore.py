"""Native pytest migration of tests/spec/dev-flow-plan/junit-shard-ignore.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_spec_junit_shard_1_report_xml_is_ignored_by_git_1(repo_root, run_cmd, tmp_path):
    'spec-junit-shard-1/report.xml is ignored by git'
    path_repo_root = str(repo_root / 'tests/spec/dev-flow-plan') + '/../../..'
    result = run_cmd(['git', 'check-ignore', '-q', 'spec-junit-shard-1/report.xml'])
    assert result.returncode == 0, result.output


def test_spec_junit_shard_4_report_xml_is_ignored_by_git_2(repo_root, run_cmd, tmp_path):
    'spec-junit-shard-4/report.xml is ignored by git'
    path_repo_root = str(repo_root / 'tests/spec/dev-flow-plan') + '/../../..'
    result = run_cmd(['git', 'check-ignore', '-q', 'spec-junit-shard-4/report.xml'])
    assert result.returncode == 0, result.output


def test_junit_report_report_xml_remains_ignored_by_git_3(repo_root, run_cmd, tmp_path):
    'junit-report/report.xml remains ignored by git'
    path_repo_root = str(repo_root / 'tests/spec/dev-flow-plan') + '/../../..'
    result = run_cmd(['git', 'check-ignore', '-q', 'junit-report/report.xml'])
    assert result.returncode == 0, result.output


def test_vitest_junit_report_report_xml_remains_ignored_by_git_4(repo_root, run_cmd, tmp_path):
    'vitest-junit-report/report.xml remains ignored by git'
    path_repo_root = str(repo_root / 'tests/spec/dev-flow-plan') + '/../../..'
    result = run_cmd(['git', 'check-ignore', '-q', 'vitest-junit-report/report.xml'])
    assert result.returncode == 0, result.output
