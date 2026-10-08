"""Native migration of tests/spec/sdlc-cockpit/no-direct-fetch.bats."""
# (T002460, E1)

def test_t002460_kein_panel_ruft_fetch_direkt_auf_e1_negativtest_positiv_anker(repo_root):
    kit = repo_root / ".lavish/kit"
    proof = repo_root / ".lavish"

    # POSITIV-ANKER: adapter.js stellt die tickets()-Methode bereit.
    assert "tickets" in (kit / "adapter.js").read_text(encoding="utf-8")

    # NEGATIVTEST: panel.js und cockpit-shell.html enthalten keinen fetch( - Aufruf.
    assert sum(1 for line in (kit / "panel.js").read_text(encoding="utf-8").splitlines() if "fetch(" in line) == 0
    assert sum(1 for line in (proof / "cockpit-shell.html").read_text(encoding="utf-8").splitlines() if "fetch(" in line) == 0
