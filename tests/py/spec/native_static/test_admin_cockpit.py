"""Native pytest migration of tests/spec/admin-cockpit.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t001665_coaching_settings_page_mounts_coachingsettings_component_1(repo_root, run_cmd, tmp_path):
    'T001665 coaching settings page mounts CoachingSettings component'
    path_admin_sidebar = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_web = str(repo_root / 'tests/spec') + '/../../components/website/src'
    result = run_cmd(['grep', '-qF', 'CoachingSettings', path_web + '/pages/admin/coaching/settings.astro'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', 'client:load', path_web + '/pages/admin/coaching/settings.astro'])
    assert result.returncode == 0, result.output


def test_admin_content_db_contentdb_svelte_component_exists_2(repo_root, run_cmd, tmp_path):
    'admin-content-db: ContentDb.svelte component exists'
    path_admin_sidebar = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_web = str(repo_root / 'tests/spec') + '/../../components/website/src'
    assert Path(path_web + '/components/admin/ContentDb.svelte').is_file()


def test_admin_content_db_contentdb_svelte_renders_content_database_table_3(repo_root, run_cmd, tmp_path):
    'admin-content-db: ContentDb.svelte renders content database table'
    path_admin_sidebar = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_web = str(repo_root / 'tests/spec') + '/../../components/website/src'
    result = run_cmd(['grep', '-qF', 'ContentDb', path_web + '/components/admin/ContentDb.svelte'])
    assert result.returncode == 0, result.output


def test_admin_nav_accordion_adminsidebarnav_astro_exists_4(repo_root, run_cmd, tmp_path):
    'admin-nav-accordion: AdminSidebarNav.astro exists'
    path_admin_sidebar = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_web = str(repo_root / 'tests/spec') + '/../../components/website/src'
    assert Path(path_admin_sidebar).is_file()
