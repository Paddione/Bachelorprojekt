"""Native migration of tests/unit/admin-nav.bats."""
import re
from pathlib import Path

ADMIN_LAYOUT = "components/website/src/layouts/AdminLayout.astro"
PORTAL_LAYOUT = "components/website/src/layouts/PortalLayout.astro"
EINSTELLUNGEN_TABS = "components/website/src/components/AdminEinstellungenTabs.astro"
TERMINE = "components/website/src/pages/admin/termine.astro"
CLIENTS = "components/website/src/pages/admin/clients.astro"
SESSIONS = "components/website/src/pages/admin/coaching/sessions/index.astro"
RECHNUNGEN = "components/website/src/pages/admin/rechnungen.astro"
BUCHHALTUNG = "components/website/src/pages/admin/buchhaltung.astro"
PLATFORM_HUB = "components/website/src/components/admin/PlatformHub.svelte"


def _grep_count(repo_root: Path, rel: str, pattern: str, regex: bool = False) -> int:
    """Emulate `grep -c PATTERN FILE`. A missing file fails the test instead of counting 0."""
    path = repo_root / rel
    assert path.is_file(), f"missing file: {rel}"
    count = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if (re.search(pattern, line) if regex else pattern in line):
            count += 1
    return count


def test_adminlayout_admin_meetings_not_in_navgroups(repo_root):
    assert _grep_count(repo_root, ADMIN_LAYOUT, "href: '/admin/meetings'") == 0


def test_adminlayout_admin_kalender_not_in_navgroups(repo_root):
    assert _grep_count(repo_root, ADMIN_LAYOUT, "href: '/admin/kalender'") == 0


def test_adminlayout_admin_coaching_projekte_not_in_navgroups(repo_root):
    assert _grep_count(repo_root, ADMIN_LAYOUT, "href: '/admin/coaching/projekte'") == 0


def test_adminlayout_admin_coaching_settings_not_in_navgroups(repo_root):
    assert _grep_count(repo_root, ADMIN_LAYOUT, "href: '/admin/coaching/settings'") == 0


def test_adminlayout_admin_zeiterfassung_not_in_navgroups(repo_root):
    assert _grep_count(repo_root, ADMIN_LAYOUT, "href: '/admin/zeiterfassung'") == 0


def test_adminlayout_admin_steuer_not_in_navgroups(repo_root):
    assert _grep_count(repo_root, ADMIN_LAYOUT, "href: '/admin/steuer'") == 0


def test_adminlayout_admin_software_history_not_in_navgroups(repo_root):
    assert _grep_count(repo_root, ADMIN_LAYOUT, "href: '/admin/software-history'") == 0


def test_adminlayout_admin_systemtest_not_in_navgroups(repo_root):
    assert _grep_count(repo_root, ADMIN_LAYOUT, "'/admin/systemtest'") == 0


def test_adminlayout_einstellungen_uses_settings_icon_not_bell(repo_root):
    assert _grep_count(repo_root, ADMIN_LAYOUT, r"label: 'Einstellungen'.*icon: 'bell'", regex=True) == 0


def test_portallayout_buchung_present_in_navitems(repo_root):
    assert _grep_count(repo_root, PORTAL_LAYOUT, "id: 'buchung'") != 0


def test_admineinstellungentabs_coaching_ki_tab_present(repo_root):
    assert _grep_count(repo_root, EINSTELLUNGEN_TABS, "coaching/settings") != 0


def test_termine_astro_kalender_tab_present(repo_root):
    assert _grep_count(repo_root, TERMINE, 'href="/admin/kalender"') != 0


def test_clients_astro_meetings_tab_present(repo_root):
    assert _grep_count(repo_root, CLIENTS, "href.*meetings", regex=True) != 0


def test_coaching_sessions_index_astro_kein_studio_link_mehr_breadcrumb_vorhanden_post_t001792(repo_root):
    assert _grep_count(repo_root, SESSIONS, 'href="/admin/coaching/studio"') == 0
    assert _grep_count(repo_root, SESSIONS, 'href="/admin"') != 0


def test_rechnungen_astro_zeiterfassung_tab_present(repo_root):
    assert _grep_count(repo_root, RECHNUNGEN, "href.*zeiterfassung", regex=True) != 0


def test_buchhaltung_astro_steuer_tab_present(repo_root):
    assert _grep_count(repo_root, BUCHHALTUNG, 'href="/admin/steuer"') != 0


def test_platformhub_svelte_software_history_link_present(repo_root):
    assert _grep_count(repo_root, PLATFORM_HUB, "software-history") != 0


def test_platformhub_svelte_systemtest_link_present(repo_root):
    assert _grep_count(repo_root, PLATFORM_HUB, "systemtest") != 0
