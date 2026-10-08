#!/usr/bin/env python3
"""Emit test-inventory entries (JSON lines) for the native pytest modules. [T901392]

Called by scripts/build-test-inventory.sh. Covers tests/py/local (tier "local")
and tests/py/spec (tier "spec"). IDs follow the rules the BATS discovery used, so
the website's requirement traceability keeps its IDs:

1. The module docstring names its original source (``tests/<tier>/<rel>.bats``).
   A filename ID (FA-30, NFA-12, MCP-TASK-RUNNER-001, ...) is taken from it.
2. Otherwise structured IDs at the start of test-function docstrings
   (e.g. ``"HWS-3: ..."``) become one entry each.
3. Otherwise the source path relative to its tier dir is the ID, and its first
   directory (or the bare name) is the category.
Modules without a declared source use their own path the same way.
Split modules (``_partN``) share an ID; only the first file is listed.
"""
import ast
import json
import re
import subprocess
import sys
from pathlib import Path

FILE_ID = re.compile(r"^(FA|SA|NFA|AK)(-[A-Z]+)?-([0-9]+)")
MULTI_ID = re.compile(r"^([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+)-([0-9]+)$")
TITLE_ID = re.compile(r"^([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-[0-9]+)")
SOURCE = re.compile(r"tests/(local|prod|spec)/([A-Za-z0-9_./-]+)\.bats")


def _ids_for(rel_to_tier: str, tree, rel_file: str):
    rel_to_tier = re.sub(r"_part[0-9]+$", "", rel_to_tier)
    base = rel_to_tier.rsplit("/", 1)[-1]
    m = FILE_ID.match(base)
    if m:
        ident = f"{m.group(1)}{m.group(2) or ''}-{m.group(3)}"
        return [(ident, rel_file, ident.split("-", 1)[0])]
    m = MULTI_ID.match(base)
    if m:
        ident = f"{m.group(1)}-{m.group(2)}"
        return [(ident, rel_file, ident.split("-", 1)[0])]
    return []


def entries_for(path: Path, repo: Path, tier: str):
    rel_file = path.relative_to(repo).as_posix()
    tree = ast.parse(path.read_text(encoding="utf-8"))
    doc = ast.get_docstring(tree) or ""
    sources = list(dict.fromkeys(m.group(2) for m in SOURCE.finditer(doc)))
    if not sources:
        own = path.relative_to(repo / "tests" / "py" / tier).with_suffix("").as_posix()
        sources = [re.sub(r"(^|/)test_", r"\1", own)]

    filename_ids = [e for src in sources for e in _ids_for(src, tree, rel_file)]
    if filename_ids:
        return filename_ids

    titled = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
            tm = TITLE_ID.match(ast.get_docstring(node) or "")
            if tm and tm.group(1) not in titled:
                titled.append(tm.group(1))
    entries = [(i, rel_file, i.split("-", 1)[0]) for i in titled]
    # Sources without structured title IDs keep their path-derived ID, as before.
    if not titled or len(sources) > 1:
        for src in sources:
            src = re.sub(r"_part[0-9]+$", "", src)
            entries.append((src, rel_file, src.split("/", 1)[0]))
    return entries


def _discover(repo: Path, root: Path):
    """Test modules under root; inside a git work tree .gitignore is honoured [T002664]."""
    inside = subprocess.run(["git", "-C", str(repo), "rev-parse", "--is-inside-work-tree"],
                            capture_output=True, text=True, check=False).returncode == 0
    if not inside:
        return sorted(root.rglob("test_*.py"))
    listed = subprocess.run(
        ["git", "-C", str(repo), "ls-files", "--cached", "--others", "--exclude-standard", "-z",
         root.relative_to(repo).as_posix()],
        capture_output=True, text=True, check=True).stdout.split("\0")
    return sorted(repo / p for p in listed
                  if p and Path(p).name.startswith("test_") and p.endswith(".py") and (repo / p).is_file())


def main() -> int:
    repo = Path(sys.argv[1]).resolve()
    seen = set()
    for tier in ("local", "spec"):
        root = repo / "tests" / "py" / tier
        if not root.is_dir():
            continue
        for path in _discover(repo, root):
            for ident, rel_file, category in entries_for(path, repo, tier):
                if (ident, tier) in seen:
                    continue
                seen.add((ident, tier))
                print(json.dumps({"id": ident, "file": rel_file, "category": category,
                                  "kind": "pytest", "tier": tier}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
