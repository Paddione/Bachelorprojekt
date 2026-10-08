"""Tests migrating Paket 6B sdlc-cockpit specs to pytest (47 specs)."""

import subprocess
from pathlib import Path
import pytest


def _run_bats(repo_root: Path, bats_file: str) -> subprocess.CompletedProcess:
    res = subprocess.run(
        ["bats", bats_file],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    return res


def test_action_inventory_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/action-inventory.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/action-inventory.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/action-inventory.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_adapter_contract_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/adapter-contract.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/adapter-contract.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/adapter-contract.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_adapter_sdlc_paths_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_api_inventory_drift_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/api-inventory-drift.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/api-inventory-drift.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/api-inventory-drift.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_build_target_runtime_env_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/build-target-runtime-env.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/build-target-runtime-env.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/build-target-runtime-env.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_daemon_endpoints_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/daemon-endpoints.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/daemon-endpoints.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/daemon-endpoints.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_daemon_port_binding_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/daemon-port-binding.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/daemon-port-binding.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/daemon-port-binding.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_daemon_runtime_contract_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/daemon-runtime-contract.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/daemon-runtime-contract.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/daemon-runtime-contract.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_daemon_runtime_files_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/daemon-runtime-files.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/daemon-runtime-files.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/daemon-runtime-files.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_daemon_test_no_leak_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/daemon-test-no-leak.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/daemon-test-no-leak.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/daemon-test-no-leak.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_daemon_token_endpoint_removed_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_daemon_token_mode_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/daemon-token-mode.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/daemon-token-mode.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/daemon-token-mode.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_deck_kompakt_layout_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/deck-kompakt-layout.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/deck-kompakt-layout.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/deck-kompakt-layout.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_deck_resize_freeze_fix_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/deck-resize-freeze-fix.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/deck-resize-freeze-fix.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/deck-resize-freeze-fix.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_deck_resize_handle_fix_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/deck-resize-handle-fix.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/deck-resize-handle-fix.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/deck-resize-handle-fix.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_deck_resize_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/deck-resize.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/deck-resize.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/deck-resize.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_document_tokens_only_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/document-tokens-only.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/document-tokens-only.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/document-tokens-only.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_endpoint_host_map_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/endpoint-host-map.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/endpoint-host-map.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/endpoint-host-map.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_freshness_timestamp_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/freshness-timestamp.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/freshness-timestamp.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/freshness-timestamp.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_imagepullpolicy_always_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/imagepullpolicy-always.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/imagepullpolicy-always.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/imagepullpolicy-always.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_k5_epic_canvas_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/k5-epic-canvas.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/k5-epic-canvas.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/k5-epic-canvas.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_k9_stil_datenbank_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/k9-stil-datenbank.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/k9-stil-datenbank.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/k9-stil-datenbank.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ki_deck_eine_tabelle_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_kit_artifacts_exist_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/kit-artifacts-exist.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/kit-artifacts-exist.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/kit-artifacts-exist.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_kit_assets_in_image_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/kit-assets-in-image.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/kit-assets-in-image.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/kit-assets-in-image.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_kit_binding_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/kit-binding.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/kit-binding.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/kit-binding.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_layout_buildfree_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/layout-buildfree.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/layout-buildfree.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/layout-buildfree.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_layout_kit_asset_wiring_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/layout-kit-asset-wiring.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/layout-kit-asset-wiring.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/layout-kit-asset-wiring.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_layout_rail_fixed_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/layout-rail-fixed.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/layout-rail-fixed.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/layout-rail-fixed.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_leitstand_absorption_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/leitstand-absorption.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/leitstand-absorption.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/leitstand-absorption.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_leitstand_ds_tokens_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_leitstand_help_overlay_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/leitstand-help-overlay.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/leitstand-help-overlay.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/leitstand-help-overlay.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_leitstand_livedaten_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/leitstand-livedaten.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/leitstand-livedaten.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/leitstand-livedaten.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_leitstand_purpose_registry_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_leitstand_url_scheme_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/leitstand-url-scheme.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/leitstand-url-scheme.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/leitstand-url-scheme.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_login_redirect_all_pages_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/login-redirect-all-pages.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/login-redirect-all-pages.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/login-redirect-all-pages.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_navigation_no_dead_links_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/navigation-no-dead-links.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/navigation-no-dead-links.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/navigation-no-dead-links.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_no_direct_fetch_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/no-direct-fetch.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/no-direct-fetch.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/no-direct-fetch.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_no_silent_fallback_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/no-silent-fallback.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/no-silent-fallback.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/no-silent-fallback.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_panel_type_declaration_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/panel-type-declaration.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/panel-type-declaration.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/panel-type-declaration.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pipeline_slot_uebernahme_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/pipeline-slot-uebernahme.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/pipeline-slot-uebernahme.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/pipeline-slot-uebernahme.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_proxy_unreachable_vs_stopped_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/proxy-unreachable-vs-stopped.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/proxy-unreachable-vs-stopped.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/proxy-unreachable-vs-stopped.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_public_assets_no_server_code_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/public-assets-no-server-code.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/public-assets-no-server-code.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/public-assets-no-server-code.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_rail_representation_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/rail-representation.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/rail-representation.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/rail-representation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_redesign_struktur_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/redesign-struktur.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/redesign-struktur.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/redesign-struktur.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_sdlc_leitstand_tokens_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/sdlc-leitstand-tokens.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/sdlc-leitstand-tokens.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/sdlc-leitstand-tokens.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_write_token_removed_spec(repo_root: Path):
    """Executes tests/spec/sdlc-cockpit/write-token-removed.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-cockpit/write-token-removed.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-cockpit/write-token-removed.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"
