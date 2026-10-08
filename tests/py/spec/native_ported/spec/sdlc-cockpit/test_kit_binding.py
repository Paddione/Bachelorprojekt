"""Native migration of tests/spec/sdlc-cockpit/kit-binding.bats."""
# (T002460)

def test_t002460_referenz_board_bindet_tokens_css_und_document_css_per_link_ein(repo_root):
    text = (repo_root / ".lavish/reference-board.html").read_text(encoding="utf-8")
    assert text.count("tokens.css") > 0
    assert text.count("document.css") > 0


def test_t002460_cockpit_huelle_bindet_kit_per_link_und_script_ein(repo_root):
    text = (repo_root / ".lavish/cockpit-shell.html").read_text(encoding="utf-8")
    assert text.count("tokens.css") > 0
    assert text.count("panel.css") > 0
    assert text.count("panel.js") > 0
    assert text.count("adapter.js") > 0
