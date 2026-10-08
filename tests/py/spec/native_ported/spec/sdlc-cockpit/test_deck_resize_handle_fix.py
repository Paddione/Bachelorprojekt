"""Native migration of tests/spec/sdlc-cockpit/deck-resize-handle-fix.bats."""
import re

import pytest

WEBSITE_SRC = "components/website/src"
DECK_LEISTE = f"{WEBSITE_SRC}/components/leitstand/DeckLeiste.svelte"
RESIZE_LIB = f"{WEBSITE_SRC}/lib/sdlc/deck-resize.ts"


def _awk_ranges(text, start_re, end_re):
    """Emulate awk '/start/,/end/': return all matching blocks as one string."""
    blocks, current, active = [], [], False
    for line in text.splitlines():
        if not active and start_re.search(line):
            active = True
        if active:
            current.append(line)
            if end_re.search(line):
                blocks.append("\n".join(current))
                current, active = [], False
    if active:
        blocks.append("\n".join(current))
    return "\n".join(blocks)


def test_deckleiste_body_is_scroll_container_not_deck_leiste(repo_root):
    # Finding 1+2: der Scroll-Container muss der __body sein, nicht die Leiste selbst.
    path = repo_root / DECK_LEISTE
    assert path.is_file()
    text = path.read_text(encoding="utf-8")
    assert ".deck-leiste__body" in text
    # Kern-Assertion: overflow-y: auto im __body-Regelblock
    body_block = _awk_ranges(text, re.compile(r"\.deck-leiste__body \{"), re.compile(r"\}"))
    assert re.search(r"overflow-y:[ \t\r\n\f\v]*auto", body_block)
    # Positiv-Anker fuer den Range: der .deck-leiste-Block ist nicht leer.
    leiste_block = _awk_ranges(text, re.compile(r"^  \.deck-leiste \{"), re.compile(r"^  \}"))
    assert "position: relative" in leiste_block
    # Negativ: der .deck-leiste-Regelblock traegt KEIN overflow-y mehr.
    assert "overflow-y" not in leiste_block


def test_deck_resize_ts_widthfrompointer_uses_rightedge_not_innerwidth(repo_root):
    path = repo_root / RESIZE_LIB
    assert path.is_file()
    text = path.read_text(encoding="utf-8")
    assert re.search(r"export function widthFromPointer", text)
    # Kern-Assertion: Parametername rightEdge in der Signatur
    assert re.search(r"widthFromPointer\(clientX: number, rightEdge: number\)", text)


def test_deckleiste_drag_call_uses_bounding_client_rect_right(repo_root):
    path = repo_root / DECK_LEISTE
    assert path.is_file()
    text = path.read_text(encoding="utf-8")
    assert "widthFromPointer" in text
    # Kern-Assertionen: Panel-Geometrie statt Fensterbreite im Drag-Pfad
    assert "getBoundingClientRect().right" in text
    assert "widthFromPointer(e.clientX, window.innerWidth)" not in text
