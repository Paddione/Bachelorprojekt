"""Native migration of tests/spec/sdlc-cockpit/sdlc-leitstand-tokens.bats."""
# Verbatim-copy check: the design token file minus its first two lines (sed '1,2d') must equal the
# source stylesheet.

def test_design_tokens_css_is_a_verbatim_copy_of_sdlc_leitstand_css_ignoring_generation_comment(repo_root):
    tokens = repo_root / "design/leitstand-ds/_tokens.css"
    source = repo_root / "components/website/src/styles/sdlc-leitstand.css"
    assert tokens.is_file(), f"Missing {tokens}"
    assert source.is_file(), f"Missing {source}"

    # sed '1,2d': erste zwei Zeilen entfernen, Rest unveraendert.
    remainder = "".join(tokens.read_text(encoding="utf-8").splitlines(keepends=True)[2:])
    assert remainder == source.read_text(encoding="utf-8")
