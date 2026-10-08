"""Native migration of tests/unit/brain-chunk-fence.bats."""
import glob
import re

import pytest

# Tests for scripts/brain-chunk.sh oversized-paragraph splitting: a single fenced
# code block larger than the target becomes sequential (Teil i/N) part-chunks whose
# concatenation reproduces the fence byte-exact; an oversized markdown table splits at
# row boundaries with the header pair repeated on every part.

EDGE_LINE = re.compile(r"  node[0-9]{3} -->\|edge[0-9]{3}\| node[0-9]{3}")


@pytest.fixture
def script(repo_root):
    return str(repo_root / "scripts" / "brain-chunk.sh")


def _write_fence_source(path):
    lines = ["## Diagram", "", "```mermaid", "flowchart LR"]
    for i in range(1, 201):
        lines.append(f"  node{i:03d} -->|edge{i:03d}| node{i + 1:03d}")
    lines.append("```")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_table_source(path):
    lines = ["## Endpoints", "", "| a | b |", "|---|---|"]
    for i in range(1, 201):
        lines.append(f"| row{i:03d} | value{i:03d} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _out_files(out_dir, prefix=None):
    pattern = f"{prefix}-*.md" if prefix else "*.md"
    return sorted(glob.glob(str(out_dir / pattern)))


def _size(path):
    with open(path, "rb") as fh:
        return len(fh.read())


def test_splits_oversized_fenced_block_into_sequential_parts(run_cmd, script, tmp_path):
    src = tmp_path / "src.md"
    _write_fence_source(src)
    out = tmp_path / "out"
    r = run_cmd(["bash", script, "--source", str(src), "--slug", "t-fence",
                 "--out-dir", str(out), "--target-chars", "2000"])
    assert r.returncode == 0
    # ~6k fence at target 2000 -> heading chunk + at least 3 fence parts, every file within target.
    assert len(_out_files(out)) >= 4
    for f in _out_files(out):
        assert _size(f) <= 2000
    assert "(Teil 1/" in r.output


def test_part_chunks_reassemble_to_the_original_fence_bytes(run_cmd, script, tmp_path):
    src = tmp_path / "src.md"
    _write_fence_source(src)
    out = tmp_path / "out"
    r = run_cmd(["bash", script, "--source", str(src), "--slug", "t-fence",
                 "--out-dir", str(out), "--target-chars", "2000"])
    assert r.returncode == 0
    # Manifest order is part order; figure lines (200 edges) carry the content.
    parts = _out_files(out, "t-fence")
    text = "".join(open(f, encoding="utf-8").read() for f in parts)
    edge_lines = [line for line in text.splitlines() if "-->" in line]
    assert len(edge_lines) == 200
    # No edge line is truncated: every emitted edge line matches the generator.
    bad = [line for line in edge_lines if not EDGE_LINE.fullmatch(line)]
    assert bad == []


def test_splits_oversized_markdown_table_with_repeated_header(run_cmd, script, tmp_path):
    src = tmp_path / "src.md"
    _write_table_source(src)
    out = tmp_path / "out"
    r = run_cmd(["bash", script, "--source", str(src), "--slug", "t-split-table",
                 "--out-dir", str(out), "--target-chars", "2000"])
    assert r.returncode == 0
    # ~4.6k table at target 2000 -> heading chunk + at least 2 table parts.
    assert len(_out_files(out)) >= 3
    for f in _out_files(out):
        assert _size(f) <= 2000
    # Every multi-row part carries the header pair; all 200 rows present once.
    for f in _out_files(out, "t-split-table"):
        text = open(f, encoding="utf-8").read().splitlines()
        has_header = "| a | b |" in text
        pipe_lines = sum(1 for line in text if line.startswith("|"))
        assert has_header or pipe_lines <= 1, f
    all_text = "".join(open(f, encoding="utf-8").read() for f in _out_files(out))
    assert sum(1 for line in all_text.splitlines() if line.startswith("| row")) == 200
    assert "(Teil 1/" in r.output


def test_small_table_packs_whole_without_parts(run_cmd, script, tmp_path):
    src = tmp_path / "src.md"
    lines = ["## Endpoints", "", "| a | b |", "|---|---|"]
    for i in range(1, 6):
        lines.append(f"| row{i:03d} | value{i:03d} |")
    src.write_text("\n".join(lines) + "\n", encoding="utf-8")
    out = tmp_path / "out"
    r = run_cmd(["bash", script, "--source", str(src), "--slug", "t-small-table",
                 "--out-dir", str(out), "--target-chars", "2000"])
    assert r.returncode == 0
    assert len(_out_files(out)) == 1
    assert "(Teil" not in r.output


def test_oversized_non_fence_non_table_paragraph_still_emitted_whole(run_cmd, script, tmp_path):
    src = tmp_path / "src.md"
    lines = ["## Big list", ""]
    for i in range(1, 201):
        lines.append(f"- item{i:03d} with some filling text to reach the target size")
    src.write_text("\n".join(lines) + "\n", encoding="utf-8")
    out = tmp_path / "out"
    r = run_cmd(["bash", script, "--source", str(src), "--slug", "t-list",
                 "--out-dir", str(out), "--target-chars", "2000"])
    assert r.returncode == 0
    # A bullet list is one paragraph but neither fence nor table: all items
    # land in a single chunk file exceeding the target (fail-closed).
    first = [f for f in _out_files(out) if "item001" in open(f, encoding="utf-8").read()]
    last = [f for f in _out_files(out) if "item200" in open(f, encoding="utf-8").read()]
    assert first == last
    assert len(first) == 1
    assert _size(first[0]) > 2000
