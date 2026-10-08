"""Native pytest migration of tests/spec/sdlc-cockpit/pipeline-slot-uebernahme.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t002531_menu_adminsidebarnav_fuehrt_keinen_admin_cockpit_und_keinen_admin_pipeline_link_1(repo_root, run_cmd, tmp_path):
    'T002531 menu: AdminSidebarNav fuehrt keinen /admin/cockpit- und keinen /admin/pipeline-Link'
    path_nav_file = str(repo_root) + '/components/website/src/components/admin/AdminSidebarNav.astro'
    assert Path(path_nav_file).is_file()
    result = run_cmd(['grep', '-q', 'buildNavSections', path_nav_file])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', "'/admin/cockpit'", path_nav_file])
    assert result.returncode != 0, result.output
    result = run_cmd(['grep', "'/admin/pipeline'", path_nav_file])
    assert result.returncode != 0, result.output


def test_t002531_dashboard_admin_astro_verlinkt_nicht_auf_admin_cockpit_oder_admin_pipeline_2(repo_root, run_cmd, tmp_path):
    'T002531 dashboard: admin.astro verlinkt nicht auf /admin/cockpit oder /admin/pipeline'
    path_admin_file = str(repo_root) + '/components/website/src/pages/admin.astro'
    assert Path(path_admin_file).is_file()
    result = run_cmd(['grep', '-q', 'slot="header"', path_admin_file])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', 'href="/admin/cockpit"', path_admin_file])
    assert result.returncode != 0, result.output
    result = run_cmd(['grep', 'href="/admin/pipeline"', path_admin_file])
    assert result.returncode != 0, result.output


def test_t002531_deletion_orphaned_cockpit_components_deleted_while_keep_list_remains_3(repo_root, run_cmd, tmp_path):
    'T002531 deletion: orphaned Cockpit components deleted while keep-list remains'
    assert Path(str(repo_root) + '/components/website/src/components/assistant/CockpitSidekickView.svelte').is_file()
    assert Path(str(repo_root) + '/components/website/src/pages/sdlc/api/cockpit/portfolio.ts').is_file()
    assert not (Path(str(repo_root) + '/components/website/src/components/admin/Cockpit.svelte').is_file())
    assert not (Path(str(repo_root) + '/components/website/src/components/admin/CockpitTable.svelte').is_file())
    assert not (Path(str(repo_root) + '/components/website/src/components/admin/CockpitExpandRow.svelte').is_file())
    assert not (Path(str(repo_root) + '/components/website/src/components/admin/EmptyStateCockpit.svelte').is_file())
    assert not (Path(str(repo_root) + '/components/website/src/components/admin/TicketCreateModal.svelte').is_file())
    assert not (Path(str(repo_root) + '/components/website/src/components/admin/TicketRow.svelte').is_file())
    assert not (Path(str(repo_root) + '/components/website/src/components/admin/BulkBar.svelte').is_file())
    assert not (Path(str(repo_root) + '/components/website/src/components/admin/Cockpit/MobileToggle.svelte').is_file())
    assert not (Path(str(repo_root) + '/components/website/src/components/admin/Cockpit/FilterBar.svelte').is_file())
    assert not (Path(str(repo_root) + '/components/website/src/lib/sdlc/admin/cockpit-expand.ts').is_file())
    assert not (Path(str(repo_root) + '/components/website/src/lib/sdlc/tickets/cockpit-table-actions.ts').is_file())
    result = run_cmd(['grep', '-rn', 'CockpitTable.svelte', str(repo_root) + '/components/website/src'])
    assert result.returncode != 0, result.output


def test_t002531_of4_mobile_cockpit_css_removed_and_admin_responsive_updated_4(repo_root, run_cmd, tmp_path):
    'T002531 of4: mobile-cockpit.css removed and admin-responsive updated'
    path_admin_resp = str(repo_root) + '/components/website/src/styles/admin-responsive.css'
    assert Path(path_admin_resp).is_file()
    assert not (Path(str(repo_root) + '/components/website/src/styles/mobile-cockpit.css').is_file())
    result = run_cmd(['grep', 'mobile-cockpit', path_admin_resp])
    assert result.returncode != 0, result.output


def test_t003737_redirect_pipeline_astro_entfernt_kein_rueckwaerts_redirect_mehr_5(repo_root, run_cmd, tmp_path):
    'T003737 redirect: pipeline.astro entfernt — kein Rueckwaerts-Redirect mehr'
    path_pipe_file = str(repo_root) + '/components/website/src/pages/sdlc/pipeline.astro'
    assert Path(str(repo_root) + '/components/website/src/pages/sdlc/cockpit.astro').is_file()
    assert not (Path(path_pipe_file).is_file())
