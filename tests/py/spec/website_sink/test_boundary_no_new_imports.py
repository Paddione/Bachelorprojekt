"""Boundary: scripts/* must reach website code ONLY via lib/ports.

Call-site migration (goal od1-website-sink): external callers
(`scripts/coaching/*`, `scripts/build-route-manifest.mjs`) import website
internals exclusively through `components/website/src/lib/ports/*`.
Any direct `components/website/src/...` import that does NOT contain
`lib/ports` is a violation (lib/ports carve-out is documented, not blanket:
ports lives inside website, so its path still matches the literal prefix).

Methodology: literal static-import scan (P0 packet) — lines matching
`from '...components/website/src...'` or `import('...components/website/src...')`,
excluding `//` comment lines. Path-string configs (route-manifest PAGES_DIR,
OUT, extractSlugsFromSource args) are NOT imports and never match.

STOP remainder: NONE. The former entry `scripts/coaching/merge-books.mts:11`
imported `lib/coaching-merge.ts`, a module removed together with the books
infrastructure (#849); the orphaned CLI was deleted in #7233, so
`STOP_REMAINDER` is empty. Because both maps are now empty, a broken scanner
would pass vacuously — `test_detector_flags_direct_import` pins the detector
itself so this gate cannot silently become a no-op.
"""

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]

# In-scope prod callers (P0 boundary table; sdlc/llm-proxy/code-quality/
# index-repo/knowledge have 0 prod imports — VANTA, nothing to scan).
# `merge-books.mts` was removed from this list together with the orphan
# script itself (#7233); the other five are the real prod surface.
CALLERS = [
    "scripts/coaching/ingest-book.mts",
    "scripts/coaching/batch-ingest-dir.mts",
    "scripts/coaching/classify-book.mts",
    "scripts/coaching/ingest-json.mts",
    "scripts/build-route-manifest.mjs",
]

_FROM_RE = re.compile(r"from\s+['\"][^'\"]*components/website/src")
_DYNAMIC_RE = re.compile(r"import\s*\(\s*['\"][^'\"]*components/website/src")

# Target state: EMPTY. No direct-import allowlist entries.
ALLOWLIST: dict[str, list[int]] = {}

# Target state reached: no unmigratable prod caller remains (#7233).
# Keep fail-closed: any entry added here must be justified in the docstring.
STOP_REMAINDER: dict[str, list[int]] = {}

# Migrated sites must reference the ports facade (guards silent revert).
MIGRATED_TO_PORTS = [
    "scripts/coaching/ingest-book.mts",
    "scripts/coaching/batch-ingest-dir.mts",
    "scripts/coaching/classify-book.mts",
    "scripts/coaching/ingest-json.mts",
    "scripts/build-route-manifest.mjs",
]


def _violations(rel: str, repo: Path = REPO) -> list[int]:
    path = repo / rel
    assert path.exists(), f"caller file missing: {rel}"
    hits = []
    for i, line in enumerate(path.read_text().splitlines(), start=1):
        stripped = line.lstrip()
        if stripped.startswith("//"):
            continue
        if "lib/ports" in line:
            continue  # documented carve-out: the allowed facade path
        if _FROM_RE.search(line) or _DYNAMIC_RE.search(line):
            hits.append(i)
    return hits


def test_no_direct_imports_outside_allowlist_and_remainder():
    found: dict[str, list[int]] = {}
    for rel in CALLERS:
        hits = _violations(rel)
        if hits:
            found[rel] = hits
    expected = {**ALLOWLIST, **STOP_REMAINDER}
    assert found == expected, (
        f"direct components/website/src imports changed.\n"
        f"found={found}\nexpected={expected}\n"
        f"(new entries = regression; missing STOP_REMAINDER entries = "
        f"clean up STOP_REMAINDER)"
    )


def test_migrated_sites_use_ports_facade():
    for rel in MIGRATED_TO_PORTS:
        text = (REPO / rel).read_text()
        assert "lib/ports" in text, f"{rel}: no lib/ports import — migration reverted?"


def test_detector_flags_direct_import(tmp_path):
    """Fail-closed self-test: the scanner itself must keep detecting.

    ALLOWLIST and STOP_REMAINDER are both empty, so a regression in the
    regexes would make the main gate pass forever. These four lines pin the
    behaviour: static + dynamic direct imports are violations, `lib/ports`
    and `//`-comments are not.
    """
    (tmp_path / "probe.mts").write_text(
        "import { getSession } from '../../components/website/src/lib/auth.ts';\n"
        "const db = await import('../../components/website/src/lib/knowledge-db.ts');\n"
        "import { getSessionViaPorts } from '../../components/website/src/lib/ports/index.ts';\n"
        "// import { legacy } from '../../components/website/src/lib/legacy.ts';\n"
    )
    assert _violations("probe.mts", tmp_path) == [1, 2]
