"""Guards for the WSL design-asset inventory (T901038):
- docs/design-assets/manifest.json (committed PRE baseline)
- docs/design-assets/catalog.md (source/derived classification)
- docs/design-assets/consumer-map.md (dependency/consumer map)
- scripts/design-assets-inventory.sh (bounded read-only inventory command)
"""

import hashlib
import json
import re
import subprocess
from pathlib import Path

SCOPE_ROOTS = [
    "assets/",
    ".design-sync/",
    "packages/design-system/",
    "design/leitstand-ds/",
    "components/website/public/brand/",
    "components/brett/public/assets/",
]

# NOTE: no bare "shadow" — it matches design vocabulary (shadows.html, elevation
# shadows). Secret-adjacent names are covered by the remaining alternatives.
SECRET_ADJACENT = re.compile(
    r"(secret|credentials?|passwd|\.pem$|\.key$|id_rsa|/\.env|history)",
    re.IGNORECASE,
)

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def _load_manifest(repo_root: Path) -> dict:
    manifest = repo_root / "docs" / "design-assets" / "manifest.json"
    assert manifest.is_file(), f"MISSING manifest: {manifest}"
    return json.loads(manifest.read_text(encoding="utf-8"))


def test_manifest_schema(repo_root: Path):
    """Every manifest entry carries stable ID, 64-hex SHA-256, size and format."""
    data = _load_manifest(repo_root)
    assert isinstance(data.get("files"), list) and data["files"], "manifest has no files"
    for entry in data["files"]:
        assert isinstance(entry.get("id"), str) and entry["id"], f"bad id: {entry!r}"
        assert not entry["id"].startswith("/"), f"absolute id: {entry['id']}"
        assert SHA256_RE.match(entry.get("sha256", "")), f"bad sha256: {entry!r}"
        assert isinstance(entry.get("size"), int) and entry["size"] >= 0, f"bad size: {entry!r}"
        assert isinstance(entry.get("format"), str), f"bad format: {entry!r}"
        assert isinstance(entry.get("mime"), str) and "/" in entry["mime"], f"bad mime: {entry!r}"


def test_manifest_sorted_and_duplicates_consistent(repo_root: Path):
    """IDs are stably sorted; duplicate groups reference known IDs sharing one hash."""
    data = _load_manifest(repo_root)
    ids = [entry["id"] for entry in data["files"]]
    assert ids == sorted(ids), "manifest files are not sorted by stable ID"
    by_id = {entry["id"]: entry["sha256"] for entry in data["files"]}
    for group in data.get("duplicates", []):
        assert SHA256_RE.match(group.get("sha256", "")), f"bad group hash: {group!r}"
        members = group.get("members", [])
        assert len(members) >= 2, f"duplicate group with <2 members: {group!r}"
        assert members == sorted(members), f"unsorted duplicate members: {group!r}"
        for member in members:
            assert member in by_id, f"duplicate member not in files: {member}"
            assert by_id[member] == group["sha256"], f"hash mismatch for {member}"


def test_inventory_reproducible(repo_root: Path, tmp_path: Path):
    """Re-running the inventory command reproduces the committed manifest byte-identically."""
    script = repo_root / "scripts" / "design-assets-inventory.sh"
    assert script.is_file(), f"MISSING script: {script}"
    manifest = repo_root / "docs" / "design-assets" / "manifest.json"
    assert manifest.is_file(), f"MISSING manifest: {manifest}"
    rerun = tmp_path / "manifest-rerun.json"
    res = subprocess.run(
        ["bash", str(script), "--out", str(rerun)],
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert res.returncode == 0, f"inventory command failed: {res.stderr}"
    assert rerun.is_file(), "inventory command produced no output file"
    committed = hashlib.sha256(manifest.read_bytes()).hexdigest()
    regenerated = hashlib.sha256(rerun.read_bytes()).hexdigest()
    assert regenerated == committed, "re-run manifest bytes differ from committed baseline"


def test_manifest_hygiene_no_absolute_or_secret_paths(repo_root: Path):
    """No manifest ID contains absolute WSL paths or secret-adjacent name patterns."""
    data = _load_manifest(repo_root)
    for entry in data["files"]:
        assert "/home/" not in entry["id"], f"absolute WSL path: {entry['id']}"
        assert not SECRET_ADJACENT.search(entry["id"]), f"secret-adjacent id: {entry['id']}"


def test_consumer_map_names_known_couplings(repo_root: Path):
    """Consumer map documents token extraction, SVG snapshots and the three sync mappings."""
    consumer_map = repo_root / "docs" / "design-assets" / "consumer-map.md"
    assert consumer_map.is_file(), f"MISSING consumer map: {consumer_map}"
    text = consumer_map.read_text(encoding="utf-8")
    for needle in (
        "colors_and_type.css",
        "build.mjs",
        "assets-sync.sh",
        "assets/audio/",
        "assets/game/",
        "assets/branding/",
        "/sfx",
        "/combat",
        "website/public/brand",
    ):
        assert needle in text, f"consumer map missing coupling evidence: {needle}"


def test_catalog_marks_every_scope_root(repo_root: Path):
    """Catalog gives every scope root a source/derived verdict with origin and rights."""
    catalog = repo_root / "docs" / "design-assets" / "catalog.md"
    assert catalog.is_file(), f"MISSING catalog: {catalog}"
    lines = catalog.read_text(encoding="utf-8").splitlines()
    for root in SCOPE_ROOTS:
        hits = [line for line in lines if root.rstrip("/") in line]
        assert hits, f"catalog never mentions scope root: {root}"
        assert any("source" in line or "derived" in line for line in hits), (
            f"catalog has no source/derived verdict for scope root: {root}"
        )
    text = "\n".join(lines)
    assert "unverified" in text or "verified" in text, "catalog states no rights verdicts"
