"""Native migration of tests/spec/pipeline-interface.bats."""

from pathlib import Path

STORE = "components/website/src/lib/stores/cockpit-floor-store.ts"
FLOOR = "components/website/src/components/sdlc/CockpitFloor.svelte"
CTRL = "components/website/src/components/sdlc/cockpit/ControlPanel.svelte"
STRIP = "components/website/src/components/sdlc/cockpit/StatusStrip.svelte"
DAG = "components/website/src/components/DependencyGraph.svelte"
SIDEKICK = "components/website/src/components/PortalSidekick.svelte"
PIPEVIEW = "components/website/src/components/assistant/PipelineSidekickView.svelte"
NAV = "components/website/src/components/admin/AdminSidebarNav.astro"
BUDGETAPI = "components/website/src/pages/sdlc/api/cockpit-budget.ts"


def _text(repo_root: Path, rel: str) -> str:
    return (repo_root / rel).read_text(encoding="utf-8")


def _grep_r_q(repo_root: Path, pattern: bytes, rel_paths) -> bool:
    """grep -rq <pattern> <paths>: True, wenn eine Datei den Text enthaelt (fehlende Pfade zaehlen nicht)."""
    for rel in rel_paths:
        p = repo_root / rel
        if p.is_file():
            if pattern in p.read_bytes():
                return True
        elif p.is_dir():
            for f in p.rglob("*"):
                if f.is_file() and pattern in f.read_bytes():
                    return True
    return False


def test_d1_shared_floor_store_exists_and_exports_the_public_surface(repo_root):
    assert (repo_root / STORE).is_file()
    text = _text(repo_root, STORE)
    assert "export const floorStore" in text
    assert "export function seedFloor" in text
    assert "export function acquireFloor" in text
    assert "export function floorSubscriberCount" in text


def test_d1_read_only_consumers_subscribe_to_the_store(repo_root):
    # Entfernte Analytics-Komponenten sind bewusst nicht mehr in der Liste [T003417].
    for f in (STRIP, FLOOR, PIPEVIEW, DAG):
        assert "cockpit-floor-store" in _text(repo_root, f), f


def test_d3_ki_provider_editor_extracted_cockpitfloor_drops_kiproviderdrawer(repo_root):
    assert (repo_root / "components/website/src/components/sdlc/cockpit/KiRoutingPanel.svelte").is_file()
    assert "KiProviderDrawer" not in _text(repo_root, FLOOR)


def test_d2_controlpanel_models_all_7_control_fields(repo_root):
    text = _text(repo_root, CTRL)
    assert "contextBudget" in text
    assert "spawnHarness" in text
    assert "lavishDelegation" in text


def test_d2_portalsidekick_drops_control_edit_ui_links_to_steuerung_tab(repo_root):
    text = _text(repo_root, SIDEKICK)
    assert "bind:value={settings.contextBudget}" not in text
    assert "bind:checked={settings.spawnHarness}" not in text
    assert "tab=control" in text


def test_d5_dependencygraph_has_no_setinterval_poll(repo_root):
    assert "setInterval" not in _text(repo_root, DAG)


def test_d1_statusstrip_drops_the_hardcoded_30s_poll(repo_root):
    assert "setInterval(pollWatchdog, 30000)" not in _text(repo_root, STRIP)


def test_d6_no_pb_palette_remains_in_planungsbuero_components(repo_root):
    files = [
        "components/website/src/components/PlanningOffice.svelte",
        "components/website/src/components/PlanningOfficeItem.svelte",
        "components/website/src/components/PlanningOfficeDetail.svelte",
        "components/website/src/components/PlanningOfficeTriage.svelte",
        "components/website/src/components/PlanningOfficeQueue.svelte",
        "components/website/src/components/sdlc/cockpit/PhaseBadge.svelte",
    ]
    assert not _grep_r_q(repo_root, b"--pb-", files)


def test_d4_der_geteilte_analytics_fensterfilter_ist_mitsamt_seinen_konsumenten_entfernt(repo_root):
    # Positiv-Anker: der Suchpfad existiert, sonst waere die Abwesenheit vakuos.
    assert (repo_root / "components/website/src/components/sdlc/cockpit").is_dir()
    assert not (repo_root / "components/website/src/components/sdlc/cockpit/AnalyticsWindowFilter.svelte").is_file()


def test_d7_3_orphan_viewswitcher_is_deleted_and_unreferenced(repo_root):
    assert not (repo_root / "components/website/src/components/sdlc/cockpit/ViewSwitcher.svelte").is_file()
    assert not _grep_r_q(repo_root, b"ViewSwitcher", ["components/website/src"])


def test_d7_4_dead_dev_status_nav_match_removed(repo_root):
    assert "dev-status" not in _text(repo_root, NAV)


def test_d7_6_api_cockpit_budget_auth_unified_to_401_no_403(repo_root):
    assert "status: 403" not in _text(repo_root, BUDGETAPI)
