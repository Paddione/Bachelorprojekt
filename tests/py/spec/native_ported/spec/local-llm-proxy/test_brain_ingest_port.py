"""Native migration of tests/spec/local-llm-proxy/brain-ingest-port.bats."""

import glob
import json
import re
from pathlib import Path


def _forward_ports(repo_root: Path) -> set:
    """Local side of every port-forward in the mcp-gateway / semantic-code-search unit files."""
    ports = set()
    for d in ["scripts/mcp-gateway", "scripts/semantic-code-search"]:
        for svc in sorted(glob.glob(str(repo_root / d / "*.service"))):
            for line in Path(svc).read_text(encoding="utf-8", errors="replace").splitlines():
                if not re.search(r"^ExecStart.*port-forward", line):
                    continue
                for m in re.finditer(r"[0-9]{4,5}:[0-9]{4,5}", line):
                    ports.add(m.group(0).split(":", 1)[0])
    return ports


def _loadouts(repo_root: Path):
    return json.loads((repo_root / "scripts/llm/loadouts.json").read_text(encoding="utf-8"))["loadouts"]


def test_brain_ingest_port_t003203_extraktion_liefert_ueberhaupt_ports_anker_fuer_beide_invarianten(repo_root):
    assert (repo_root / "scripts/llm/loadouts.json").is_file()
    assert len(_loadouts(repo_root)) > 0
    fp = _forward_ports(repo_root)
    assert fp, "keine port-forward-Ports extrahiert"
    # devmesh-forward lauscht stabil auf 18235 (llm-proxy).
    assert "18235" in fp


def test_brain_ingest_port_t003203_kein_loadout_port_ist_zugleich_lokale_seite_eines_port_forwards(repo_root):
    loadout_ports = {str(l.get("port")) for l in _loadouts(repo_root)}
    assert loadout_ports, "keine Loadout-Ports"
    overlap = sorted(loadout_ports & _forward_ports(repo_root))
    assert not overlap, (
        f"Port(s) doppelt beansprucht — Loadout UND Port-Forward: {' '.join(overlap)}\n"
        + "\n".join(f"  {l.get('slug')} → {l.get('port')}" for l in _loadouts(repo_root) if str(l.get("port")) in overlap)
    )
