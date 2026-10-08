"""Native pytest migration of tests/spec/sdlc-cockpit/deck-resize-handle-fix.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_deck_resize_ts_widthfrompointer_rechnet_gegen_rightedge_statt_innerwidth_2(repo_root, run_cmd, tmp_path):
    'deck-resize.ts: widthFromPointer rechnet gegen rightEdge statt innerWidth'
    path_website_src = 'components/website/src'
    path_deck_leiste = path_website_src + '/components/leitstand/DeckLeiste.svelte'
    path_resize_lib = path_website_src + '/lib/sdlc/deck-resize.ts'
    assert Path(path_resize_lib).is_file()
    result = run_cmd(['grep', '-qE', 'export function widthFromPointer', path_resize_lib])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qE', 'widthFromPointer\\(clientX: number, rightEdge: number\\)', path_resize_lib])
    assert result.returncode == 0, result.output
