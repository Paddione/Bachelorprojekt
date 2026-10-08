"""Native migration of tests/spec/repo-hygiene/dead-path-references.bats."""
# The bats helper functions (_normalize_repo_relpath, _resolve_tracked_symlinks)

# are reimplemented in Python with the same semantics.

import posixpath
import subprocess
from pathlib import Path

import pytest


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)


def _normalize_repo_relpath(path: str) -> str:
    parts: list[str] = []
    for seg in path.split("/"):
        if seg == "" or seg == ".":
            continue
        if seg == "..":
            if parts:
                parts.pop()
        else:
            parts.append(seg)
    return "/".join(parts)


def _resolve_tracked_symlinks(repo: Path, path: str) -> str:
    """Resolve intermediate tracked symlinks through the git tree (T900836)."""
    hops = 0
    while hops < 16:
        segs = path.split("/")
        n = len(segs)
        replaced = False
        prefix = ""
        for i in range(n - 1):
            seg = segs[i]
            prefix = f"{prefix}/{seg}" if prefix else seg
            mode = _git(repo, "ls-tree", "HEAD", "--", prefix).stdout.split(" ", 1)[0]
            if mode == "120000":
                link_target = _git(repo, "cat-file", "-p", f"HEAD:{prefix}").stdout.rstrip("\n")
                if not link_target:
                    break
                rest = "/".join(segs[i + 1:])
                directory = posixpath.dirname(prefix)
                if directory == ".":
                    directory = ""
                head = f"{directory}/" if directory else ""
                path = _normalize_repo_relpath(f"{head}{link_target}/{rest}")
                replaced = True
                break
        if not replaced:
            break
        hops += 1
    return path


@pytest.fixture
def repo(repo_root: Path) -> Path:
    return repo_root


def test_t002688_dockerignore_declares_no_missing_literals(repo):
    missing = False
    offenders = []
    candidates = 0
    for line in (repo / ".dockerignore").read_text(encoding="utf-8").split("\n"):
        if line == "":
            continue
        if line.startswith("#") or line.startswith("!"):
            continue
        if "*" in line or "?" in line or "[" in line:
            continue
        if "# runtime" in line:
            continue
        if _git(repo, "check-ignore", "-q", line).returncode == 0:
            continue
        candidates += 1
        if not (repo / line).exists():
            missing = True
            offenders.append(line)

    assert candidates > 0, "FATAL: keine pruefbaren Literale aus .dockerignore extrahiert, Extraktion defekt"
    assert not missing, f"FEHLT: .dockerignore verweist auf: {' '.join(offenders)}"


def test_t900836_intermediate_symlinks_resolve_via_git_tree(repo):
    # Positiv-Anker: der Zwischen-Symlink, an dem der Guard scheiterte, ist getrackt.
    mode = _git(repo, "ls-tree", "HEAD", "--", ".agents/skills").stdout.split(" ", 1)[0]
    assert mode == "120000"

    resolved = _resolve_tracked_symlinks(repo, ".agents/skills/repo-hygiene/SKILL.md")
    assert _git(repo, "cat-file", "-e", f"HEAD:{resolved}").returncode == 0, resolved

    unchanged = _resolve_tracked_symlinks(repo, "tests/spec/repo-hygiene/dead-path-references.bats")
    assert unchanged == "tests/spec/repo-hygiene/dead-path-references.bats"

    # Negativ: ein fehlendes Ziel hinter dem Symlink bleibt fehlend.
    missing = _resolve_tracked_symlinks(repo, ".agents/skills/gibt-es-nicht-T900836")
    assert _git(repo, "cat-file", "-e", f"HEAD:{missing}").returncode != 0


def test_t002688_no_tracked_symlink_dangles(repo):
    ls = _git(repo, "ls-files", "-s").stdout
    links = []
    for line in ls.split("\n"):
        fields = line.split()
        if len(fields) >= 4 and fields[0] == "120000":
            links.append((fields[1], line.split("\t", 1)[1]))
    assert links, "FATAL: kein getrackter Symlink gefunden, Extraktion defekt"

    missing = False
    offenders = []
    candidates = 0
    for sha, p in links:
        candidates += 1
        target = _git(repo, "cat-file", "-p", sha).stdout.rstrip("\n")
        if not target:
            missing = True
            offenders.append(f"{p}(unreadable-blob)")
            continue
        if len(target.split("\n")) > 1:
            missing = True
            offenders.append(f"{p}(multiline-content)")
            continue
        directory = posixpath.dirname(p)
        combined = target if directory == "." else f"{directory}/{target}"
        resolved = _resolve_tracked_symlinks(repo, _normalize_repo_relpath(combined))
        if _git(repo, "cat-file", "-e", f"HEAD:{resolved}").returncode != 0:
            missing = True
            offenders.append(f"{p}->{target}")

    assert candidates > 0, "FATAL: keine getrackten Symlinks verarbeitet, Extraktion defekt"
    assert not missing, f"FEHLT: Symlink haengt in der Luft: {' '.join(offenders)}"
