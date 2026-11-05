"""RED-Test zum Decommission-Plan: keine Referenzen auf retirierte Prod-Dienste.

Laeuft ROT, solange Manifeste/Code/Doku Nextcloud, Whiteboard, Coturn/TURN, NATS,
Janus oder Nextcloud-Redis referenzieren (ausser Allowlist: Archiv-Historie, der
Decommission-Plan selbst, ADR-Kontext). Nach p1-p5 GRUeN.
"""

import re

import pytest

from pathlib import Path

ALLOWLIST_DIRS = {
    "docs/superpowers/specs/archive",
    ".agents/plans/decommission-prod-services",
}

ALLOWLIST_FILES = {
    "docs/adr/ADR-0xx-decommission-prod-services.md",
}

PATTERN = re.compile(
    r"nextcloud|whiteboard|coturn|\bjanus\b|\bnats\b|nextcloud-redis|talk-hpb",
    re.IGNORECASE,
)

SUFFIXES = {".yaml", ".yml", ".ts", ".tsx", ".svelte", ".py", ".sh", ".md"}


def test_keine_prod_service_referenzen_ausser_allowlist(repo_root):
    root = Path(str(repo_root))
    hits = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUFFIXES:
            continue
        rel = path.relative_to(root).as_posix()
        if rel.startswith(".git/") or "node_modules" in rel or "__pycache__" in rel:
            continue
        if any(rel.startswith(d + "/") for d in ALLOWLIST_DIRS):
            continue
        if rel in ALLOWLIST_FILES:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="strict")
        except (OSError, ValueError):
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if PATTERN.search(line):
                hits.append(f"{rel}:{lineno}:{line.strip()[:100]}")
                break
    assert not hits, (
        "Retirierte Prod-Dienste werden noch referenziert:\n" + "\n".join(hits[:20])
    )
