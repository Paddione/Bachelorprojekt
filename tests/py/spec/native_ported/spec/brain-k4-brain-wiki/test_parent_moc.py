"""Native migration of tests/spec/brain-k4-brain-wiki/parent-moc.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def chunk_target(monkeypatch):
    monkeypatch.setenv("BRAIN_CHUNK_TARGET_CHARS", "8000")


@pytest.fixture
def chunker(repo_root: Path) -> Path:
    return repo_root / "scripts" / "brain-chunk.sh"


def _write_source(path: Path, title: str, req_prefix: str, filler: str, count: int, per_req: int) -> None:
    text = f"---\ntitle: {title}\n---\n\n# {title}\n\nIntro.\n\n"
    for i in range(1, count + 1):
        text += f"\n### Requirement: {req_prefix}-{i:02d}\n\n"
        for j in range(1, per_req + 1):
            text += f"L{j:<5d} {filler.format(j=j, i=i)} "
        text += "\n"
    path.write_text(text, encoding="utf-8")


def _nonempty_lines(text: str) -> list[str]:
    return [line for line in text.splitlines() if line]


def test_parent_moc_links_exactly_one_wikilink_per_chunk(run_cmd, chunker, tmp_path):
    src = tmp_path / "multi-req.md"
    out = tmp_path / "out"
    moc_file = tmp_path / "parent-moc.md"
    _write_source(src, "MOC Test", "REQ-MOC", "Filler for requirement MOC-{i:02d} beyond target.", 4, 40)

    res = run_cmd(["bash", str(chunker), "--source", str(src), "--slug", "test-moc-source",
                   "--out-dir", str(out), "--moc", str(moc_file)])
    assert res.returncode == 0, res.output
    assert moc_file.is_file()

    moc_links = len(re.findall(r"\[\[[^\]]*\]\]", moc_file.read_text(encoding="utf-8")))
    chunk_count = len(_nonempty_lines(res.output))

    assert moc_links > 1
    assert chunk_count > 1
    assert moc_links == chunk_count, f"MOC has {moc_links} links but {chunk_count} chunks"


def test_every_wikilink_target_resolves_to_an_emitted_chunk_slug(run_cmd, chunker, tmp_path):
    src = tmp_path / "multi-req.md"
    out = tmp_path / "out"
    moc_file = tmp_path / "parent-moc.md"
    _write_source(src, "Resolve Test", "REQ-RES", "Filler for resolve test section {i}.", 3, 45)

    res = run_cmd(["bash", str(chunker), "--source", str(src), "--slug", "test-resolve",
                   "--out-dir", str(out), "--moc", str(moc_file)])
    assert res.returncode == 0, res.output

    moc_slugs = sorted(
        m.strip() for m in re.findall(r"\[\[([^\]]*)\]\]", moc_file.read_text(encoding="utf-8"))
    )
    tsv_slugs = sorted(line.split("\t")[1] if "\t" in line else line
                       for line in _nonempty_lines(res.output))

    assert moc_slugs, "MOC slug list empty"
    assert tsv_slugs, "TSV slug list empty"
    assert moc_slugs == tsv_slugs, f"Mismatch between MOC slugs {moc_slugs} and TSV slugs {tsv_slugs}"


def test_parent_moc_carries_source_back_reference_to_original_path(run_cmd, chunker, tmp_path):
    src = tmp_path / "multi-req.md"
    out = tmp_path / "out"
    moc_file = tmp_path / "parent-moc.md"
    slug = "test-source-ref"
    _write_source(src, "SourceRef Test", "REQ-SRC", "Filler for source-ref section {i}.", 3, 45)

    res = run_cmd(["bash", str(chunker), "--source", str(src), "--slug", slug,
                   "--out-dir", str(out), "--moc", str(moc_file)])
    assert res.returncode == 0, res.output
    assert moc_file.is_file()

    lines = moc_file.read_text(encoding="utf-8").splitlines()
    source_lines = [l for l in lines if l.startswith("source::")]
    assert len(source_lines) == 1, f"expected exactly one source:: line, got {len(source_lines)}"
    assert not re.search(re.escape(slug) + r"-0[0-9]", source_lines[0]), (
        f"source:: points to a chunk file, not the original: {source_lines[0]}"
    )
