"""tests/py/integration/test_brett_templates.py — Migration of tests/integration/brett-templates.bats."""
import os
import urllib.request
from pathlib import Path
import pytest


def test_admin_routes_register_get_api_templates(repo_root: Path):
    """routes/admin.ts registers GET /api/templates route and index.ts mounts adminRouter."""
    admin_routes = (
        repo_root / "components" / "brett" / "src" / "server" / "routes" / "admin.ts"
    )
    server_index = repo_root / "components" / "brett" / "src" / "server" / "index.ts"

    assert admin_routes.is_file()
    assert server_index.is_file()

    admin_content = admin_routes.read_text(encoding="utf-8")
    index_content = server_index.read_text(encoding="utf-8")

    assert "adminRouter.get('/api/templates'" in admin_content
    assert "app.use(adminRouter)" in index_content


def test_admin_routes_register_get_api_templates_id(repo_root: Path):
    """routes/admin.ts registers GET /api/templates/:id route."""
    admin_routes = (
        repo_root / "components" / "brett" / "src" / "server" / "routes" / "admin.ts"
    )
    assert admin_routes.is_file()
    admin_content = admin_routes.read_text(encoding="utf-8")
    assert "adminRouter.get('/api/templates/:id'" in admin_content


def test_migration_seeds_beziehungsdynamik_system_template(repo_root: Path):
    """migration seeds the Beziehungsdynamik system template."""
    migration = (
        repo_root
        / "components"
        / "brett"
        / "src"
        / "server"
        / "migrations"
        / "002_coaching_templates.sql"
    )
    assert migration.is_file()
    content = migration.read_text(encoding="utf-8")
    assert "sys-beziehungsdynamik-familiensystem" in content


def test_live_get_api_templates_returns_seeded_template():
    """live: GET /api/templates returns the seeded template."""
    base_url = os.environ.get("BRETT_BASE_URL")
    if not base_url:
        pytest.skip("BRETT_BASE_URL not set")

    req = urllib.request.Request(f"{base_url}/api/templates?brand=mentolder")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        body = resp.read().decode("utf-8")
        assert "Beziehungsdynamik" in body
