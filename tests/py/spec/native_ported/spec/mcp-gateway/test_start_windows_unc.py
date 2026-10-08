"""Native migration of tests/spec/mcp-gateway/start-windows-unc.bats."""
# Source-level case: documented exception (T002448-M4) for PowerShell scripts that do not

# run on the Linux CI, so the content of the scripts is the result.

import re
from pathlib import Path

import pytest


@pytest.fixture
def scripts(repo_root: Path):
    base = repo_root / "scripts" / "mcp-gateway"
    return base / "start-windows.ps1", base / "register-autostart.ps1"


def test_t900190_beide_skripte_loesen_repo_root_ueber_provider_path_auf_keines_ueber_path(scripts):
    """T900190: beide Skripte loesen RepoRoot ueber .ProviderPath auf, keines ueber ).Path"""
    start, autostart = scripts
    for f in (start, autostart):
        assert f.is_file()
        text = f.read_text(encoding="utf-8")
        # Positiv-Anker.
        assert "Resolve-Path" in text
        assert re.search(r"\(Resolve-Path .*\)\.ProviderPath", text)

    # Negativ-Aussage: kein Skript nutzt das UNC-brechende ).Path.
    bad = [f for f in (start, autostart)
           if re.search(r"\(Resolve-Path [^)]*\)\.Path\b", f.read_text(encoding="utf-8"))]
    assert not bad


def test_start_windows_ps1_startet_keinen_lokalen_bge_mcp_prozess_mehr(scripts):
    """start-windows.ps1 startet keinen lokalen bge-mcp-Prozess mehr"""
    start, _ = scripts
    assert start.is_file()
    hits = [l for l in start.read_text(encoding="utf-8").splitlines()
            if re.search(r"node.*bge-mcp[\\/]server\.mjs", l, re.IGNORECASE)]
    assert len(hits) == 0


def test_start_windows_ps1_forwardet_svc_llm_services_aus_dem_devmesh_kontext_mit_allen_drei_ports(scripts):
    """start-windows.ps1 forwardet svc/llm-services aus dem devmesh-Kontext mit allen drei Ports"""
    start, _ = scripts
    assert start.is_file()
    text = start.read_text(encoding="utf-8")
    lines = text.splitlines()

    # Positiv-Anker: das Skript kennt einen zweiten Kontext neben fleet.
    assert "devmesh" in text

    # Der devmesh-Eintrag der $forwards-Tabelle (grep -A2 'Name = "devmesh"').
    block_lines = []
    for i, line in enumerate(lines):
        if 'Name = "devmesh"' in line:
            block_lines.extend(lines[i : i + 3])
    block = "\n".join(block_lines)
    assert block, "kein devmesh-Eintrag in der Forward-Tabelle"
    assert "svc/llm-services" in block, f"devmesh-Eintrag ohne svc/llm-services: {block}"
    assert "$DevmeshContext" in block, f"devmesh-Eintrag ohne DevmeshContext: {block}"
    assert '[string]$DevmeshContext = "devmesh"' in text, "DevmeshContext-Default ist nicht devmesh"
    for port in ("18235", "13001", "13005"):
        assert port in block, f"Port {port} fehlt im devmesh-Eintrag: {block}"
    # Der generische Forward-Pfad nutzt den Eintrags-Kontext fuer kubectl.
    assert "kubectl --context $ctx port-forward" in text
