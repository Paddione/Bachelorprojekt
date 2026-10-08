"""Native migration of tests/spec/brain-k4-brain-wiki/chunking.bats."""

import re
import subprocess
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def chunk_target(monkeypatch):
    monkeypatch.setenv("BRAIN_CHUNK_TARGET_CHARS", "8000")


@pytest.fixture
def chunker(repo_root: Path) -> Path:
    return repo_root / "scripts" / "brain-chunk.sh"


def _requirement_source(path: Path, hdr: str, count: int, fill) -> None:
    text = hdr
    for i in range(1, count + 1):
        text += f"\n### Requirement: REQ-{i:02d}\n\n"
        for j in range(1, 41):
            text += f"L{j:<5d} " + fill(i) + " "
        text += "\n"
    path.write_text(text, encoding="utf-8")


def _rows(output: str) -> list[list[str]]:
    rows = []
    for line in output.split("\n"):
        if line == "":
            rows.append(["", "", "", ""])
            continue
        parts = line.split("\t", 3)
        parts += [""] * (4 - len(parts))
        rows.append(parts)
    return rows


def _run_chunker(run_cmd, chunker, src: Path, slug: str, out: Path):
    return run_cmd(["bash", str(chunker), "--source", str(src), "--slug", slug, "--out-dir", str(out)])


def _nonempty(output: str) -> list[str]:
    return [line for line in output.split("\n") if line]


def test_chunker_splits_a_plan_spec_at_requirement_headings(run_cmd, chunker, tmp_path):
    src = tmp_path / "spec-mit-requirements.md"
    out = tmp_path / "out"
    _requirement_source(
        src,
        "---\ntitle: Test\n---\n\n# Test Spec\n\nIntro paragraph.\n\n",
        4,
        lambda i: f"This is filler text for requirement REQ-{i:02d} padding the chunk beyond the threshold.",
    )
    res = _run_chunker(run_cmd, chunker, src, "test-spec-with-requirements", out)
    assert res.returncode == 0, res.output
    assert len(_nonempty(res.output)) > 1

    for chunk_file, _slug, chunk_index, _heading in _rows(res.output):
        path = Path(chunk_file)
        if not path.is_file():
            continue
        if chunk_index and int(chunk_index) > 1:
            first_line = path.read_text(encoding="utf-8").split("\n", 1)[0].strip()
            assert re.match(r"^###\s+Requirement:", first_line), (
                f"chunk {chunk_index} first line: '{first_line}'"
            )


def test_no_chunk_exceeds_the_configured_target_size(run_cmd, chunker, tmp_path):
    src = tmp_path / "spec-mit-requirements.md"
    out = tmp_path / "out"
    _requirement_source(
        src,
        "---\ntitle: Test\n---\n\n# Test Spec\n\nIntro.\n\n",
        4,
        lambda i: f"Padding text for requirement REQ-{i:02d} past 8000 threshold.",
    )
    res = _run_chunker(run_cmd, chunker, src, "test-spec-size-check", out)
    assert res.returncode == 0, res.output

    chunk_count = 0
    for chunk_file, _slug, chunk_index, _heading in _rows(res.output):
        if not chunk_file:
            continue
        chunk_count += 1
        size = Path(chunk_file).stat().st_size
        assert size <= 8000, f"chunk {chunk_index} size {size} exceeds 8000"
    assert chunk_count > 0


def test_chunker_falls_back_to_h2_for_sources_without_requirement_level(run_cmd, chunker, tmp_path):
    src = tmp_path / "ohne-requirements.md"
    out = tmp_path / "out"
    parts = ["# Architecture Overview\n", "\n"]
    for i in range(1, 6):
        parts.append(f"## Section {i}\n")
        for j in range(1, 41):
            parts.append(f"L{j:<5d} Filler for section {i} in architecture doc past threshold. ")
        parts.append("\n")
    src.write_text("".join(parts), encoding="utf-8")

    res = _run_chunker(run_cmd, chunker, src, "test-no-requirements", out)
    assert res.returncode == 0, res.output
    assert len(_nonempty(res.output)) > 1

    combined = "".join(
        Path(row[0]).read_text(encoding="utf-8") for row in _rows(res.output) if row[0]
    )

    def _norm(text: str) -> str:
        lines = text.split("\n")
        while lines and lines[0] == "":
            lines.pop(0)
        while lines and lines[-1] == "":
            lines.pop()
        return "\n".join(lines) + "\n" if lines else ""

    assert _norm(src.read_text(encoding="utf-8")) == _norm(combined), (
        "chunk concatenation does not match source"
    )


def test_chunk_manifest_is_tab_separated_with_four_columns(run_cmd, chunker, tmp_path):
    src = tmp_path / "spec-mit-requirements.md"
    out = tmp_path / "out"
    _requirement_source(
        src,
        "---\ntitle: Test\n---\n\n# Test\n\n",
        2,
        lambda i: "Fill.",
    )
    res = _run_chunker(run_cmd, chunker, src, "test-tab-cols", out)
    assert res.returncode == 0, res.output

    prev_idx = 0
    for line in _nonempty(res.output):
        assert len(line.split("\t")) == 4, f"not 4 tab-separated fields: {line!r}"
        chunk_file, _slug, chunk_index, _heading = line.split("\t")
        assert Path(chunk_file).is_file(), f"column 1 is not an existing file: {chunk_file}"
        assert int(chunk_index) == prev_idx + 1, f"index not incrementing from 1: {chunk_index}"
        prev_idx = int(chunk_index)


def test_chunk_slugs_sort_lexicographically_in_numeric_order(run_cmd, chunker, tmp_path):
    src = tmp_path / "spec-mit-requirements.md"
    out = tmp_path / "out"
    _requirement_source(
        src,
        "---\ntitle: Test\n---\n\n# Test\n\n",
        4,
        lambda i: "Fill.",
    )
    res = _run_chunker(run_cmd, chunker, src, "test-sort", out)
    assert res.returncode == 0, res.output

    rows = _nonempty(res.output)
    lex = subprocess.run(
        ["sort", "-t", "\t", "-k2"], input="\n".join(rows) + "\n",
        capture_output=True, text=True, check=True,
    ).stdout
    num = subprocess.run(
        ["sort", "-t", "\t", "-k3", "-n"], input="\n".join(rows) + "\n",
        capture_output=True, text=True, check=True,
    ).stdout
    assert lex == num, "lexical sort by slug does not match numeric sort by index"


def test_a_source_below_the_target_size_yields_exactly_one_chunk(run_cmd, chunker, tmp_path):
    src = tmp_path / "kurz.md"
    out = tmp_path / "out"
    src.write_text(
        "# Short Doc\n\n"
        "This is a short document with just a few lines.\n"
        "It should fit in a single chunk without splitting.\n",
        encoding="utf-8",
    )
    res = _run_chunker(run_cmd, chunker, src, "test-short", out)
    assert res.returncode == 0, res.output

    lines = _nonempty(res.output)
    assert len(lines) == 1, f"expected exactly one chunk line, got {len(lines)}"
    assert lines[0].split("\t")[2] == "1", "index must be 1"
