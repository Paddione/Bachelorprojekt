"""Native pytest migration of tests/spec/sdlc-cockpit/deck-resize.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_deck_resize_reine_klemm_logik_existiert_samt_vitest_suite_1(repo_root, run_cmd, tmp_path):
    'deck-resize: reine Klemm-Logik existiert samt Vitest-Suite'
    path_website_src = 'components/website/src'
    path_deck_leiste = path_website_src + '/components/leitstand/DeckLeiste.svelte'
    path_cockpit = path_website_src + '/pages/sdlc/cockpit.astro'
    path_resize_lib = path_website_src + '/lib/sdlc/deck-resize.ts'
    path_resize_test = path_website_src + '/lib/sdlc/deck-resize.test.ts'
    assert Path(path_resize_lib).is_file()
    result = run_cmd(['grep', '-qE', 'export function clampDeckWidth', path_resize_lib])
    assert result.returncode == 0, result.output
    assert Path(path_resize_test).is_file()
    result = run_cmd(['grep', '-qF', '-e', 'clampDeckWidth', path_resize_test])
    assert result.returncode == 0, result.output


def test_cockpit_astro_grid_spalte_konsumiert_ls_deck_width_mit_clamp_2(repo_root, run_cmd, tmp_path):
    'cockpit.astro: Grid-Spalte konsumiert --ls-deck-width mit clamp'
    path_website_src = 'components/website/src'
    path_deck_leiste = path_website_src + '/components/leitstand/DeckLeiste.svelte'
    path_cockpit = path_website_src + '/pages/sdlc/cockpit.astro'
    path_resize_lib = path_website_src + '/lib/sdlc/deck-resize.ts'
    path_resize_test = path_website_src + '/lib/sdlc/deck-resize.test.ts'
    assert Path(path_cockpit).is_file()
    result = run_cmd(['grep', '-qF', '-e', 'grid-template-columns', path_cockpit])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '-e', '--ls-deck-width', path_cockpit])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '-e', 'clamp(240px', path_cockpit])
    assert result.returncode == 0, result.output


def test_deckleiste_resize_handle_mit_pointer_capture_und_separator_rolle_3(repo_root, run_cmd, tmp_path):
    'DeckLeiste: Resize-Handle mit Pointer-Capture und Separator-Rolle'
    path_website_src = 'components/website/src'
    path_deck_leiste = path_website_src + '/components/leitstand/DeckLeiste.svelte'
    path_cockpit = path_website_src + '/pages/sdlc/cockpit.astro'
    path_resize_lib = path_website_src + '/lib/sdlc/deck-resize.ts'
    path_resize_test = path_website_src + '/lib/sdlc/deck-resize.test.ts'
    assert Path(path_deck_leiste).is_file()
    result = run_cmd(['grep', '-qF', '-e', 'deck-leiste', path_deck_leiste])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '-e', 'setPointerCapture', path_deck_leiste])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '-e', 'role="separator"', path_deck_leiste])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '-e', 'aria-valuenow', path_deck_leiste])
    assert result.returncode == 0, result.output


def test_deckleiste_persistenz_ueber_localstorage_key_ls_deck_width_4(repo_root, run_cmd, tmp_path):
    'DeckLeiste: Persistenz ueber localStorage-Key ls-deck-width'
    path_website_src = 'components/website/src'
    path_deck_leiste = path_website_src + '/components/leitstand/DeckLeiste.svelte'
    path_cockpit = path_website_src + '/pages/sdlc/cockpit.astro'
    path_resize_lib = path_website_src + '/lib/sdlc/deck-resize.ts'
    path_resize_test = path_website_src + '/lib/sdlc/deck-resize.test.ts'
    assert Path(path_deck_leiste).is_file()
    result = run_cmd(['grep', '-qF', '-e', 'ls-deck-width', path_deck_leiste])
    assert result.returncode == 0, result.output
