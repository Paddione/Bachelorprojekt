"""Native migration of tests/spec/sdlc-cockpit/panel-type-declaration.bats."""
# (T002460, D2)
# Note: the original has no positive anchor; with no data-panel-type attribute present the loop body
# never runs and the test passes. The port keeps that semantics.

import re

VALID_TYPES = {"status", "strom", "canvas", "terminal"}


def test_t002460_jedes_panel_deklariert_gueltigen_data_panel_type_d2(repo_root):
    shell = (repo_root / ".lavish/cockpit-shell.html").read_text(encoding="utf-8")
    for match in re.finditer(r'data-panel-type="([^"]*)"', shell):
        assert match.group(1) in VALID_TYPES, f"ungueltiger data-panel-type: {match.group(1)}"
