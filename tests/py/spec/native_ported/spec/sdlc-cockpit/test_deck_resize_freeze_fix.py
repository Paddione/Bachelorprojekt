"""Native migration of tests/spec/sdlc-cockpit/deck-resize-freeze-fix.bats."""
# (T011501)
# Pruefmodus: Source-Grep (Querschnitts-/Konventionstest, dokumentierte Ausnahme).

import re

DECK_LEISTE = "components/website/src/components/leitstand/DeckLeiste.svelte"


def _awk_range(text, start, end):
    """Lines of every range from a line matching `start` up to the next line matching `end` (inclusive)."""
    out = []
    active = False
    for line in text.splitlines():
        if not active and re.search(start, line):
            active = True
        if active:
            out.append(line)
            if re.search(end, line):
                active = False
    return out


def test_deckleiste_body_reserviert_stabilen_scrollbar_gutter(repo_root):
    path = repo_root / DECK_LEISTE
    assert path.is_file()
    block = _awk_range(path.read_text(encoding="utf-8"), r"\.deck-leiste__body \{", r"\}")

    # Positiv-Anker fuer den Range: der __body-Block traegt die bekannten Deklarationen.
    assert any(re.search(r"container-type:\s*inline-size", line) for line in block)
    assert any(re.search(r"overflow-y:\s*auto", line) for line in block)
    # Kern-Assertion: stabiler Gutter im selben Block.
    assert any(re.search(r"scrollbar-gutter:\s*stable", line) for line in block)
