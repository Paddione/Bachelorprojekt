"""Native migration of tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats."""
# [T007559]
# Pruefmodus: Quelltext-Pruefung (dokumentierte Ausnahme). The awk/grep pipelines of the original are
# re-expressed as line-based Python checks with the same pass/fail semantics.

import re
from pathlib import Path

import pytest


def _css(repo_root):
    return repo_root / "components/website/src/styles/sdlc-leitstand.css"


def _showcase(repo_root):
    return repo_root / "components/website/src/pages/sdlc/design-system.astro"


def _lines(path):
    return path.read_text(encoding="utf-8").splitlines()


def _count_lines(lines, pattern, flags=0):
    rx = re.compile(pattern, flags)
    return sum(1 for line in lines if rx.search(line))


def test_leitstand_ds_signal_tokens_green_amber_red_info_are_defined(repo_root):
    css = _css(repo_root)
    assert css.is_file(), "fehlt: components/website/src/styles/sdlc-leitstand.css"
    text = css.read_text(encoding="utf-8")
    for sig in ["green", "amber", "red", "info"]:
        assert re.search(rf"--ls-signal-{sig}\s*:", text), f"fehlt: --ls-signal-{sig}"


def test_leitstand_ds_token_structure_covers_surfaces_lines_text_mono_spacing_radii(repo_root):
    css = _css(repo_root)
    if not css.is_file():
        pytest.skip("sdlc-leitstand.css not yet present")
    lines = _lines(css)

    surface_n = _count_lines(lines, r"--ls-surface-[a-z0-9]+\s*:")
    line_n = _count_lines(lines, r"--ls-line[a-z0-9-]*\s*:")
    text_n = _count_lines(lines, r"--ls-text-[a-z0-9]+\s*:")
    mono_n = _count_lines(lines, r"--ls-[a-z0-9-]*mono[a-z0-9-]*\s*:", re.IGNORECASE)
    space_n = _count_lines(lines, r"--ls-space-[a-z0-9]+\s*:")
    assert surface_n >= 2, f"surface tokens < 2 ({surface_n})"
    assert line_n >= 1, f"line tokens < 1 ({line_n})"
    assert text_n >= 2, f"text tokens < 2 ({text_n})"
    assert mono_n >= 1, f"mono token < 1 ({mono_n})"
    assert space_n >= 3, f"space tokens < 3 ({space_n})"

    # Radii: jeder --ls-radius-*-Wert liegt in [2px, 4px].
    radius_rx = re.compile(r"--ls-radius-[a-z0-9]+\s*:\s*[0-9.]+px")
    for line in lines:
        for match in radius_rx.finditer(line):
            value = float(match.group(0).split(":", 1)[1].replace("px", "").replace(" ", ""))
            assert 2 <= value <= 4, f"radius out of range: {match.group(0)}"


def test_leitstand_ds_glow_pulse_only_bound_to_running_states(repo_root):
    css = _css(repo_root)
    if not css.is_file():
        pytest.skip("sdlc-leitstand.css not yet present")
    lines = _lines(css)

    # POSITIV-ANKER: es gibt eine running-gebundene Glow/Puls-Regel.
    sel = ""
    found = False
    for line in lines:
        if "{" in line:
            sel = line
        if re.search(r"glow|pulse", line) and "running" in sel:
            found = True
    assert found

    # NEGATIV: keine Glow/Puls-Deklaration ohne "running" im umschliessenden Selektor.
    sel = ""
    bad = []
    for nr, line in enumerate(lines, start=1):
        if "{" in line:
            sel = line
        if re.search(r"(glow|pulse)", line) and "running" not in sel:
            bad.append(f"{nr}: {sel}")
    assert bad == [], "\n".join(bad)


def test_leitstand_ds_print_light_only_inside_media_print_no_theme_toggle_outside(repo_root):
    css = _css(repo_root)
    if not css.is_file():
        pytest.skip("sdlc-leitstand.css not yet present")
    lines = _lines(css)

    # POSITIV-ANKER: der erste @media print-Block redefiniert mindestens ein --ls-Token.
    block = []
    started = False
    for line in lines:
        if "@media print" in line:
            started = True
        if started:
            block.append(line)
            if "}" in line:
                break
    assert any(re.search(r"--ls-[a-z0-9-]+\s*:", line) for line in block)

    # NEGATIV: ausserhalb von @media print kein Theme-Umschalt-Selektor.
    outside = []
    depth = 0
    for line in lines:
        if "@media print" in line:
            depth = 1
            continue
        if depth != 0:
            if "{" in line:
                depth += 1
            if "}" in line:
                depth -= 1
            continue
        outside.append(line)
    assert not any(re.search(r"data-theme|theme-light", line, re.IGNORECASE) for line in outside)


def test_leitstand_ds_design_system_astro_imports_the_token_stylesheet(repo_root):
    assert "sdlc-leitstand.css" in _showcase(repo_root).read_text(encoding="utf-8")


def test_leitstand_ds_showcase_style_block_contains_no_ad_hoc_hex_colors(repo_root):
    css = _css(repo_root)
    if not css.is_file():
        pytest.skip("sdlc-leitstand.css not yet present")

    # POSITIV-ANKER: die Token-Datei definiert Werte.
    assert re.search(r"--ls-[a-z0-9-]+\s*:", css.read_text(encoding="utf-8"))

    # NEGATIV: kein Hex-Farbwert im <style>-Block von design-system.astro.
    block = []
    inside = False
    for line in _lines(_showcase(repo_root)):
        if "<style" in line:
            inside = True
        if inside:
            block.append(line)
        if "</style>" in line and inside:
            break
    hex_rx = re.compile(r"#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?")
    assert _count_lines(block, hex_rx.pattern) == 0


def _files_mentioning_css(repo_root):
    src = repo_root / "components/website/src"
    hits = []
    for path in src.rglob("*"):
        if path.is_file() and path.suffix in (".astro", ".svelte", ".ts"):
            try:
                if "sdlc-leitstand.css" in path.read_text(encoding="utf-8"):
                    hits.append(path)
            except UnicodeDecodeError:
                continue
    return hits


def test_leitstand_ds_no_importer_of_the_stylesheet_outside_pages_sdlc(repo_root):
    # POSITIV-ANKER: SDLC-Seiten referenzieren die Datei.
    sdlc_hits = [p for p in _files_mentioning_css(repo_root) if "/pages/sdlc/" in str(p)]
    assert len(sdlc_hits) >= 1

    # NEGATIV: ausserhalb von pages/sdlc/ referenziert nichts die Datei.
    prod_hits = [p for p in _files_mentioning_css(repo_root) if "/pages/sdlc/" not in str(p)]
    assert prod_hits == []


def test_leitstand_ds_tokens_css_is_a_verbatim_copy_of_sdlc_leitstand_css_staleness_guard(repo_root):
    css = _css(repo_root)
    tokens = repo_root / "design/leitstand-ds/_tokens.css"
    if not css.is_file():
        pytest.skip("sdlc-leitstand.css not yet present")
    assert tokens.is_file(), "fehlt: design/leitstand-ds/_tokens.css"

    # POSITIV-ANKER: GENERATED-Header aus build.mjs.
    head = tokens.read_text(encoding="utf-8").splitlines()[:2]
    assert any("GENERATED by design/leitstand-ds/build.mjs" in line for line in head)

    # NEGATIV: Inhalt == Header + Quell-CSS, byte-genau.
    header = (
        "/* GENERATED by design/leitstand-ds/build.mjs — verbatim copy of\n"
        "   components/website/src/styles/sdlc-leitstand.css. Do not edit by hand. */\n"
    )
    expected = header + css.read_text(encoding="utf-8")
    assert tokens.read_text(encoding="utf-8") == expected, (
        "_tokens.css ist stale - 'node design/leitstand-ds/build.mjs' ausfuehren und committen"
    )
