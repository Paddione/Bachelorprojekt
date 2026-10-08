"""Native migration of tests/spec/sdlc-cockpit/document-tokens-only.bats."""
# (T002460)

import re

HEX_COLOR = re.compile(r"#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}")


def test_t002460_dokument_bausteine_nutzen_ausschliesslich_tokens_e11_negativtest_positiv_anker(repo_root):
    kit = repo_root / ".lavish/kit"

    # POSITIV-ANKER: tokens.css existiert und definiert die Basisfarbe.
    tokens = kit / "tokens.css"
    assert tokens.is_file()
    assert "--color-bg-base" in tokens.read_text(encoding="utf-8")

    # NEGATIVTEST: keine hartcodierten Hex-Farben in document.css.
    hits = [line for line in (kit / "document.css").read_text(encoding="utf-8").splitlines()
            if HEX_COLOR.search(line)]
    assert hits == []
