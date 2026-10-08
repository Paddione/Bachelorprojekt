"""Native migration of tests/spec/pocket-id-client-seed-pagination.bats."""

from pathlib import Path


def _lines(repo_root: Path):
    return (repo_root / "k3d" / "pocket-id-client-seed.yaml").read_text(encoding="utf-8").splitlines()


def _grep_after(lines, pattern: str, after: int) -> str:
    out = []
    for i, line in enumerate(lines):
        if pattern in line:
            out.extend(lines[i:i + after + 1])
    return "\n".join(out)


def test_find_client_id_paginates_across_pages_red_single_unpaginated_get_is_the_bug(repo_root):
    output = _grep_after(_lines(repo_root), "find_client_id() {", 6)
    assert "pagination%5Bpage%5D" in output


def test_find_client_id_stops_once_total_pages_is_exhausted(repo_root):
    output = _grep_after(_lines(repo_root), "find_client_id() {", 20)
    assert "totalPages" in output
