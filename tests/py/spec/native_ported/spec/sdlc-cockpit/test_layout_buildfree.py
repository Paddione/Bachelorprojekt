"""Native migration of tests/spec/sdlc-cockpit/layout-buildfree.bats."""
# (T002462, K3/D1)

import re


def test_t002462_layout_js_ist_syntaktisch_gueltig_und_buildfrei_d1(repo_root, run_cmd):
    # POSITIV-ANKER: node --check auf panel.js laeuft durch.
    anchor = run_cmd(["node", "--check", ".lavish/kit/panel.js"], cwd=repo_root)
    assert anchor.returncode == 0, "Vorbedingung verletzt: node --check auf panel.js schlug fehl"

    check = run_cmd(["node", "--check", ".lavish/kit/layout.js"], cwd=repo_root)
    assert check.returncode == 0, f"layout.js ist syntaktisch ungueltig: {check.output}"

    layout = (repo_root / ".lavish/kit/layout.js").read_text(encoding="utf-8").splitlines()

    # Keine Modul-Syntax.
    module_syntax = [line for line in layout if re.search(r"^\s*(import|export)\b", line)]
    assert module_syntax == [], "layout.js enthaelt Modul-Syntax (import/export) - D1 verletzt"

    # Keine npm-Abhaengigkeit.
    npm_require = [line for line in layout if re.search(r"require\s*\(\s*['\"][A-Za-z]", line)]
    assert npm_require == [], "layout.js enthaelt einen npm-require - D1 verletzt"
