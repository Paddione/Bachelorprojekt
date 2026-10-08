"""Native migration of tests/spec/fleet-operations/powershell-ascii-only.bats."""
import re
from pathlib import Path

import pytest

UTF8_BOM = b"\xef\xbb\xbf"


@pytest.fixture
def llm_ps1_files(repo_root: Path):
    return sorted((repo_root / "scripts" / "llm").glob("*.ps1"))


def _non_ascii_lines(path: Path):
    """Lines (1-based number, text) containing non-ASCII bytes."""
    hits = []
    for number, raw in enumerate(path.read_bytes().splitlines(), start=1):
        if any(b > 0x7F for b in raw):
            hits.append((number, raw.decode("utf-8", errors="replace")))
    return hits


def test_every_scripts_llm_ps1_is_pure_ascii(llm_ps1_files):
    # Positiv-Anker: ohne Dateien waere die Negativ-Aussage vakuos.
    assert len(llm_ps1_files) >= 3, \
        f"expected at least 3 .ps1 files under scripts/llm, found {len(llm_ps1_files)}"

    offenders = []
    for f in llm_ps1_files:
        hits = _non_ascii_lines(f)
        if hits:
            snippet = " ".join(f"{n}:{text[:60]}" for n, text in hits[:3])
            offenders.append(f"{f.name}: {snippet}")
    assert not offenders, "non-ASCII found in PowerShell scripts (breaks CP1252 parsing):\n  " + \
        "\n  ".join(offenders)


def test_no_scripts_llm_ps1_writes_config_files_with_set_content_encoding_utf8(llm_ps1_files):
    assert len(llm_ps1_files) >= 3  # Positiv-Anker
    pattern = re.compile(r"Set-Content.*-Encoding\s+UTF8")
    hits = []
    for f in llm_ps1_files:
        for number, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if pattern.search(line):
                hits.append(f"{f.name}:{number}:{line}")
    assert not hits, "Set-Content -Encoding UTF8 writes a BOM; use ASCII for config files:\n" + \
        "\n".join(hits)


def test_t006143_start_tablet_rerank_ps1_existiert_und_ist_ascii_ohne_bom(repo_root):
    ps1 = repo_root / "scripts" / "llm" / "start-tablet-rerank.ps1"
    # Positiv-Anker: die Datei existiert und ist nicht leer.
    assert ps1.is_file() and ps1.stat().st_size > 0
    # Kein BOM.
    assert ps1.read_bytes()[:3] != UTF8_BOM
    # Rein ASCII.
    assert not _non_ascii_lines(ps1)


def test_t006143_start_tablet_rerank_ps1_traegt_die_rerank_flags(repo_root):
    ps1 = repo_root / "scripts" / "llm" / "start-tablet-rerank.ps1"
    text = ps1.read_text(encoding="utf-8", errors="replace")
    for needle in (
        "--reranking",
        "-ngl",
        "8080",
        "bge-reranker-v2-m3-Q8_0.gguf",
        r".lmstudio\models",
    ):
        assert needle in text, f"{needle} fehlt in {ps1.name}"
