"""Fixtures fuer die korczewski-prod-Lieferkette (design.md §10)."""

from pathlib import Path
import subprocess

import pytest


@pytest.fixture(scope="session")
def render_tree(repo_root: Path, tmp_path_factory) -> Path:
    """Rendert den korczewski-prod-Baum einmal pro Session und liefert das --out-Verzeichnis.

    Offline: der Renderer (design.md §4, D3) liest environments/korczewski-prod.yaml und
    schreibt {cluster-bootstrap,platform,secrets,apps}. Kein Cluster, kein Netz.
    """
    out = tmp_path_factory.mktemp("korczewski-prod-render")
    res = subprocess.run(
        ["bash", "scripts/korczewski-prod/render-stack.sh", "--out", str(out)],
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=600,
    )
    assert res.returncode == 0, f"render-stack.sh failed ({res.returncode}):\n{res.stdout}\n{res.stderr}"
    return out
