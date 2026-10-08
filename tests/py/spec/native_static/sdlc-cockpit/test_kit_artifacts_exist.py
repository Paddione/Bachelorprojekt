"""Native pytest migration of tests/spec/sdlc-cockpit/kit-artifacts-exist.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t002460_alle_5_kit_dateien_existieren_1(repo_root, run_cmd, tmp_path):
    'T002460 Alle 5 Kit-Dateien existieren'
    path_kit_dir = str(repo_root) + '/.lavish/kit'
    path_proof_dir = str(repo_root) + '/.lavish'
    assert Path(path_kit_dir + '/tokens.css').is_file()
    assert Path(path_kit_dir + '/document.css').is_file()
    assert Path(path_kit_dir + '/panel.css').is_file()
    assert Path(path_kit_dir + '/panel.js').is_file()
    assert Path(path_kit_dir + '/adapter.js').is_file()


def test_t002460_beide_belegartefakte_existieren_2(repo_root, run_cmd, tmp_path):
    'T002460 Beide Belegartefakte existieren'
    path_kit_dir = str(repo_root) + '/.lavish/kit'
    path_proof_dir = str(repo_root) + '/.lavish'
    assert Path(path_proof_dir + '/reference-board.html').is_file()
    assert Path(path_proof_dir + '/cockpit-shell.html').is_file()
