"""Native pytest migration of tests/spec/sdlc-cockpit/deck-kompakt-layout.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_deckleiste_body_ist_css_query_container_container_type_inline_size_1(repo_root, run_cmd, tmp_path):
    'DeckLeiste: __body ist CSS-Query-Container (container-type: inline-size)'
    path_website_src = 'components/website/src'
    path_deck_leiste = path_website_src + '/components/leitstand/DeckLeiste.svelte'
    path_control_panel = path_website_src + '/components/sdlc/cockpit/ControlPanel.svelte'
    path_observability = path_website_src + '/components/sdlc/cockpit/CockpitObservability.svelte'
    path_budget_page = path_website_src + '/components/sdlc/cockpit/CockpitBudgetPage.svelte'
    assert Path(path_deck_leiste).is_file()
    result = run_cmd(['grep', '-qF', '-e', '.deck-leiste__body', path_deck_leiste])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qE', 'container-type:[[:space:]]*inline-size', path_deck_leiste])
    assert result.returncode == 0, result.output


def test_controlpanel_container_regel_kollabiert_das_2_spalten_grid_2(repo_root, run_cmd, tmp_path):
    'ControlPanel: @container-Regel kollabiert das 2-Spalten-Grid'
    path_website_src = 'components/website/src'
    path_deck_leiste = path_website_src + '/components/leitstand/DeckLeiste.svelte'
    path_control_panel = path_website_src + '/components/sdlc/cockpit/ControlPanel.svelte'
    path_observability = path_website_src + '/components/sdlc/cockpit/CockpitObservability.svelte'
    path_budget_page = path_website_src + '/components/sdlc/cockpit/CockpitBudgetPage.svelte'
    assert Path(path_control_panel).is_file()
    result = run_cmd(['grep', '-qF', '-e', '.control-panel__grid', path_control_panel])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '-e', 'repeat(2, 1fr)', path_control_panel])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '-e', '@container', path_control_panel])
    assert result.returncode == 0, result.output


def test_cockpitobservability_container_regel_fuer_kpi_row_vorhanden_3(repo_root, run_cmd, tmp_path):
    'CockpitObservability: @container-Regel fuer kpi-row vorhanden'
    path_website_src = 'components/website/src'
    path_deck_leiste = path_website_src + '/components/leitstand/DeckLeiste.svelte'
    path_control_panel = path_website_src + '/components/sdlc/cockpit/ControlPanel.svelte'
    path_observability = path_website_src + '/components/sdlc/cockpit/CockpitObservability.svelte'
    path_budget_page = path_website_src + '/components/sdlc/cockpit/CockpitBudgetPage.svelte'
    assert Path(path_observability).is_file()
    result = run_cmd(['grep', '-qF', '-e', '.kpi-row', path_observability])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '-e', '@container', path_observability])
    assert result.returncode == 0, result.output


def test_cockpitbudgetpage_container_regel_fuer_kompakt_layout_vorhanden_4(repo_root, run_cmd, tmp_path):
    'CockpitBudgetPage: @container-Regel fuer Kompakt-Layout vorhanden'
    path_website_src = 'components/website/src'
    path_deck_leiste = path_website_src + '/components/leitstand/DeckLeiste.svelte'
    path_control_panel = path_website_src + '/components/sdlc/cockpit/ControlPanel.svelte'
    path_observability = path_website_src + '/components/sdlc/cockpit/CockpitObservability.svelte'
    path_budget_page = path_website_src + '/components/sdlc/cockpit/CockpitBudgetPage.svelte'
    assert Path(path_budget_page).is_file()
    result = run_cmd(['grep', '-qF', '-e', '.dashboard-grid', path_budget_page])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '-e', '@container', path_budget_page])
    assert result.returncode == 0, result.output
