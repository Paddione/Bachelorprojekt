"""Native migration of tests/spec/sdlc-cockpit/rail-representation.bats."""
# (T002460, D3)
# Port note: the original's every grep is either followed by `continue` or by `|| true`, so the test
# cannot fail and asserts nothing. The port keeps the same grep checks and the same (non-)assertion.

import re


def test_t002460_jeder_panel_typ_hat_rail_darstellung_d3(repo_root):
    shell = (repo_root / ".lavish/cockpit-shell.html").read_text(encoding="utf-8")
    for panel_type in ["status", "strom", "canvas", "terminal"]:
        # Gleiche Pruefungen wie im Original; keine Zusicherung (siehe Hinweis oben).
        re.search(rf'data-panel-type="{panel_type}".*panel--rail', shell)
        re.search(rf'panel--rail.*data-panel-type="{panel_type}"', shell)
        "panel--rail" in shell and f'data-panel-type="{panel_type}"' in shell
