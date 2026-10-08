"""Native pytest migration of tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_a_factorymodelslots_svelte_existiert_nicht_mehr_2(repo_root, run_cmd, tmp_path):
    '(a) FactoryModelSlots.svelte existiert nicht mehr'
    path_src = str(repo_root) + '/components/website/src'
    assert not (Path(path_src + '/components/sdlc/cockpit/FactoryModelSlots.svelte').exists())


def test_b_kein_getrackter_pfad_nennt_factory_model_slots_5(repo_root, run_cmd, tmp_path):
    '(b) kein getrackter Pfad nennt factory_model_slots'
    path_src = str(repo_root) + '/components/website/src'
    result = run_cmd(['git', '-C', str(repo_root), 'grep', '-l', 'factory_model_slots', '--', 'components/website/src', 'scripts/', ':!scripts/migrations'])
    assert result.returncode != 0, result.output


def test_c_positiv_anker_deckki_svelte_bindet_weiterhin_seine_module_ein_6(repo_root, run_cmd, tmp_path):
    '(c) Positiv-Anker: DeckKi.svelte bindet weiterhin seine Module ein'
    path_src = str(repo_root) + '/components/website/src'
    result = run_cmd(['grep', '-q', 'import LlmProxyPanel', path_src + '/components/leitstand/decks/DeckKi.svelte'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'import KiRoutingPanel', path_src + '/components/leitstand/decks/DeckKi.svelte'])
    assert result.returncode == 0, result.output
