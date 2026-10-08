"""Native migration of tests/spec/sdlc-cockpit/layout-kit-asset-wiring.bats."""
# (T002462, K3)
# Ergebnis-Test: layout.js/layout.css muessen unter public/cockpit/kit/ als Symlink aufloesen,
# nicht leer sein, und das Dockerfile holt .lavish/kit ins Image.

import re


def test_t002462_layout_js_layout_css_sind_im_image_layout_aufloesbar_nicht_nur_im_checkout(repo_root):
    kit = repo_root / "components/website/public/cockpit/kit"

    # POSITIV-ANKER: eine bereits vorhandene Kit-Datei existiert.
    assert (kit / "panel.js").is_file(), "Vorbedingung verletzt: components/website/public/cockpit/kit/panel.js fehlt"

    for asset in ["layout.js", "layout.css"]:
        path = kit / asset
        assert path.is_symlink(), f"{asset} ist kein Symlink unter components/website/public/cockpit/kit/"
        assert path.is_file(), f"{asset} loest im Checkout nicht auf (Dev-Server-Fall)"
        assert path.stat().st_size > 0, f"{asset} ist leer"

    # Image-Layout: `COPY .lavish/kit ./public/cockpit/kit` im Dockerfile.
    dockerfile = (repo_root / "components/website/Dockerfile").read_text(encoding="utf-8")
    assert (
        re.search(r"^COPY[ \t]+\.lavish/kit[ \t]+\./public/cockpit/kit", dockerfile, re.MULTILINE)
        or re.search(r"^COPY[ \t]+\.lavish/kit[ \t]+public/cockpit/kit", dockerfile, re.MULTILINE)
    ), "components/website/Dockerfile holt .lavish/kit nicht nach public/cockpit/kit - Image haette tote Symlinks"
