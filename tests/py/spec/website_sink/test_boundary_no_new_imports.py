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

STOP remainder (packet STOP rule): `scripts/coaching/merge-books.mts:11`
imports `lib/coaching-merge.ts`, which DOES NOT EXIST in the repo (nearest
real module `lib/content-db-merge.ts` exports only `mergeContentEntries`,
none of the 4 imported symbols). Unmigratable without behavior change ->
left untouched, documented here. This map is fail-closed: if the remainder
disappears (owner fixes the dangling import), the test forces map cleanup.
"""

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]

# In-scope prod callers (P0 boundary table; sdlc/llm-proxy/code-quality/
# index-repo/knowledge have 0 prod imports — VANTA, nothing to scan).
CALLERS = [
    "scripts/coaching/ingest-book.mts",
    "scripts/coaching/merge-books.mts",
    "scripts/coaching/batch-ingest-dir.mts",
    "scripts/coaching/classify-book.mts",
    "scripts/coaching/ingest-json.mts",
    "scripts/build-route-manifest.mjs",
]

_FROM_RE = re.compile(r"from\s+['\"][^'\"]*components/website/src")
_DYNAMIC_RE = re.compile(r"import\s*\(\s*['\"][^'\"]*components/website/src")

# Target state: EMPTY. No direct-import allowlist entries.
ALLOWLIST: dict[str, list[int]] = {}

# STOP remainder — NOT migrated (see module docstring). Fail-closed.
STOP_REMAINDER: dict[str, list[int]] = {
    "scripts/coaching/merge-books.mts": [11],
}

# Migrated sites must reference the ports facade (guards silent revert).
MIGRATED_TO_PORTS = [
    "scripts/coaching/ingest-book.mts",
    "scripts/coaching/batch-ingest-dir.mts",
    "scripts/coaching/classify-book.mts",
    "scripts/coaching/ingest-json.mts",
    "scripts/build-route-manifest.mjs",
]


def _violations(rel: str) -> list[int]:
    path = REPO / rel
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
