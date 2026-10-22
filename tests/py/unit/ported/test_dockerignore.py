"""Guards fuer .dockerignore (F9): Docker kennt keine Inline-Kommentare —
nur Zeilen, die mit # beginnen, sind Kommentare. Ein Muster mit
angehaengtem Kommentar matched nichts und das Exclude wirkt nicht."""

from pathlib import Path

DOCKERIGNORE = ".dockerignore"


def _lines(repo_root: Path):
    text = (repo_root / DOCKERIGNORE).read_text(encoding="utf-8")
    return text.splitlines()


def test_dockerignore_hat_keine_inline_kommentare(repo_root):
    # F9: `muster  # kommentar` ist ein literales Muster und matched nie.
    bad = [
        (i + 1, line)
        for i, line in enumerate(_lines(repo_root))
        if line.strip() and not line.lstrip().startswith(("#", "!")) and "#" in line
    ]
    assert bad == [], f"inline comments (dead excludes): {bad}"


def test_dockerignore_schliesst_env_und_dist_aus(repo_root):
    text = "\n".join(_lines(repo_root))
    assert "components/website/.env\n" in text or "components/website/.env" in text.splitlines()
    assert "components/website/dist" in text.splitlines()
