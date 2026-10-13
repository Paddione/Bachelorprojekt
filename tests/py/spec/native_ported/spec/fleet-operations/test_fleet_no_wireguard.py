"""Guard: fleet (Prod) ohne WireGuard — keine wg-fleet-/Alt-IP-/WG_MESH-Referenzen.

Pruefmodus: Quelltext-Querschnitt (grep-aequivalent). Das gepruefte Ergebnis —
Abwesenheit toter WireGuard-Referenzen — manifestiert sich ausschliesslich im
Quelltext der Manifeste, cloud-init-Dateien und Skripte; es gibt kein
Laufzeitverhalten, das es belegen koennte (siehe tests/CLAUDE.md, Ausnahme
fuer Querschnittstests).

Scope (Plan fleet-gekko-ohne-wg, p5 / T016529): prod/, prod-fleet/, die
cloud-init-Dateien (prod/cloud-init*.yaml, scripts/hetzner/cloud-init*.tmpl)
und scripts/. Muster: wg-fleet, alte WG-Adressierung 10.20.0.x, WG_MESH-Secrets.
Ausgenommen ist der devmesh-Kontext (k3s-internes flannel-wg bleibt, ADR-008):
Dateien und Zeilen mit devmesh-Bezug werden uebersprungen.

RED-first: Der Guard ist bei Anlage rot (Alt-Referenzen existieren noch) und
wird erst durch den WG-Abbau (p4) gruen.
"""
import re
from pathlib import Path

import pytest

# Alte WG-Adressierung: 10.20.0.<host>, inkl. Netzschreibweise 10.20.0.0/16.
PATTERNS = (
    ("wg-fleet", re.compile(r"wg-fleet")),
    ("10.20.0.x", re.compile(r"10\.20\.0\.\d+")),
    ("WG_MESH", re.compile(r"WG_MESH")),
)


def _is_devmesh_exempt(rel_path: Path, line: str) -> bool:
    """devmesh-Kontext ausgenommen (flannel-wg in devmesh bleibt bestehen)."""
    if "devmesh" in str(rel_path).lower():
        return True
    return "devmesh" in line.lower()


def _candidate_files(repo_root: Path) -> list[Path]:
    """Alle zu durchsuchenden Textdateien in prod/, prod-fleet/ und scripts/."""
    files: list[Path] = []
    for base in (repo_root / "prod", repo_root / "prod-fleet", repo_root / "scripts"):
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file():
                continue
            if "__pycache__" in path.parts:
                continue
            files.append(path)
    return files


def _collect_hits(repo_root: Path) -> list[str]:
    hits: list[str] = []
    root = repo_root.resolve()
    for path in _candidate_files(repo_root):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        try:
            rel = path.resolve().relative_to(root)
        except ValueError:
            rel = Path(path.name)
        for lineno, line in enumerate(text.splitlines(), start=1):
            if _is_devmesh_exempt(rel, line):
                continue
            for name, pattern in PATTERNS:
                if pattern.search(line):
                    hits.append(f"{rel}:{lineno}: [{name}] {line.strip()}")
    return hits


@pytest.mark.xfail(
    strict=True,
    reason="T016529 Uebergang: Alt-Referenzen fallen erst mit p4 (WG-Abbau). "
    "Sobald der Guard gruen wird, XPASS-strict rot und der Marker muss raus.",
)
def test_fleet_prod_umfang_ist_frei_von_wireguard_altreferenzen(repo_root):
    candidates = _candidate_files(repo_root)

    # Positiv-Anker (T002356-M1): Scope und cloud-init-Dateien existieren
    # wirklich, sonst waere die Negativ-Aussage vakuos wahr.
    assert (repo_root / "prod").is_dir(), "MISSING: prod/"
    assert (repo_root / "prod-fleet").is_dir(), "MISSING: prod-fleet/"
    assert (repo_root / "scripts").is_dir(), "MISSING: scripts/"
    for cloud_init in (
        repo_root / "prod" / "cloud-init.yaml",
        repo_root / "prod" / "cloud-init-join-cp.yaml",
        repo_root / "prod" / "cloud-init-worker.yaml",
        repo_root / "scripts" / "hetzner" / "cloud-init-server.yaml.tmpl",
        repo_root / "scripts" / "hetzner" / "cloud-init.yaml.tmpl",
    ):
        assert cloud_init.is_file(), f"MISSING cloud-init: {cloud_init}"
    assert candidates, "FAIL: keine Kandidatendateien im Scope gefunden."

    hits = _collect_hits(repo_root)
    assert not hits, (
        "FAIL: WireGuard-Alt-Referenzen (wg-fleet / 10.20.0.x / WG_MESH) "
        f"im Prod-Umfang gefunden ({len(hits)} Treffer):\n" + "\n".join(hits)
    )


def test_devmesh_kontext_bleibt_vom_guard_ausgenommen(repo_root):
    # Positiv-Anker: der devmesh-Kontext existiert im Repo (ADR-008) und der
    # Guard-Scope wird tatsaechlich durchsucht.
    assert (repo_root / "environments" / "dev.yaml").is_file(), \
        "MISSING: environments/dev.yaml (devmesh-Anker)"
    assert _candidate_files(repo_root), "FAIL: keine Kandidatendateien gefunden."

    # Die Ausnahme greift fuer Pfad- und Zeilenbezug auf devmesh.
    assert _is_devmesh_exempt(Path("k3d/devmesh/node.yaml"), "flannel-iface: wg")
    assert _is_devmesh_exempt(Path("prod/example.yaml"), "# devmesh: wg-fleet bleibt")
    assert not _is_devmesh_exempt(Path("prod/cloud-init.yaml"), "wg-fleet")
