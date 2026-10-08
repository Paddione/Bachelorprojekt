"""Native migration of tests/spec/admin-cockpit.bats."""

from pathlib import Path


def _web(repo_root: Path) -> Path:
    return repo_root / "components" / "website" / "src"


def test_t001665_coaching_settings_page_mounts_coachingsettings_component(repo_root):
    text = (_web(repo_root) / "pages/admin/coaching/settings.astro").read_text(encoding="utf-8")
    assert "CoachingSettings" in text
    assert "client:load" in text


def test_admin_content_db_contentdb_svelte_component_exists(repo_root):
    assert (_web(repo_root) / "components/admin/ContentDb.svelte").is_file()


def test_admin_content_db_contentdb_svelte_renders_content_database_table(repo_root):
    text = (_web(repo_root) / "components/admin/ContentDb.svelte").read_text(encoding="utf-8")
    assert "ContentDb" in text


def test_admin_nav_accordion_adminsidebarnav_astro_exists(repo_root):
    assert (_web(repo_root) / "components/admin/AdminSidebarNav.astro").is_file()
