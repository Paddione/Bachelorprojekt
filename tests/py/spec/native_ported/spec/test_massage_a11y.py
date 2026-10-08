"""Native migration of tests/spec/massage-a11y.bats."""
import re

import pytest


@pytest.fixture
def paths(repo_root):
    web = repo_root / "components/website"
    return {
        "massage_css": web / "public/brand/massage/colors_and_type.css",
        "mentolder_css": web / "public/brand/mentolder/colors_and_type.css",
        "nav": web / "src/components/Navigation.svelte",
        "cta": web / "src/components/CallToAction.svelte",
        "footer": web / "src/components/Footer.astro",
        "hub": web / "src/components/ContactHub.svelte",
    }


def _read_lines(path):
    assert path.is_file(), f"missing: {path}"
    return path.read_text(encoding="utf-8").splitlines()


def _first_index(lines, pattern):
    """Index (0-based) of the first line matching the regex, or None."""
    rx = re.compile(pattern)
    for i, line in enumerate(lines):
        if rx.search(line):
            return i
    return None


def test_t901312_1_on_brass_token_exists_in_both_brand_stylesheets(paths):
    """T901312-1: on-brass text token exists in both brand stylesheets"""
    assert paths["massage_css"].is_file(), f"missing: {paths['massage_css']}"
    assert paths["mentolder_css"].is_file(), f"missing: {paths['mentolder_css']}"
    assert "--on-brass:" in paths["massage_css"].read_text(encoding="utf-8"), "--on-brass missing from massage brand CSS"
    assert "--on-brass:" in paths["mentolder_css"].read_text(encoding="utf-8"), "--on-brass missing from mentolder brand CSS"


def test_t901312_2_nav_cta_reads_the_on_brass_token(paths):
    """T901312-2: nav-cta reads the on-brass token"""
    lines = _read_lines(paths["nav"])
    idx = _first_index(lines, r"\.nav-cta *\{")
    assert idx is not None, ".nav-cta rule missing from Navigation.svelte"
    chunk = "\n".join(lines[idx : idx + 16])
    assert "var(--on-brass)" in chunk, ".nav-cta must read var(--on-brass)"


def test_t901312_3_primary_cta_button_reads_the_on_brass_token(paths):
    """T901312-3: primary CTA button reads the on-brass token"""
    lines = _read_lines(paths["cta"])
    idx = _first_index(lines, r"\.btn-primary *\{")
    assert idx is not None, ".btn-primary rule missing from CallToAction.svelte"
    chunk = "\n".join(lines[idx : idx + 8])
    assert "var(--on-brass)" in chunk, ".btn-primary must read var(--on-brass)"


def test_t901312_4_footer_renders_mailto_only_with_non_empty_address(paths):
    """T901312-4: footer renders mailto only with a non-empty address"""
    lines = _read_lines(paths["footer"])
    idx = _first_index(lines, r"mailto:")
    assert idx is not None, "no mailto link in Footer.astro (unexpected)"
    chunk = "\n".join(lines[max(0, idx - 7) : idx + 1])
    assert "{footerEmail &&" in chunk, "footer mailto must be guarded by {footerEmail && ...} like the phone link"


def test_t901312_5_contact_hub_renders_mailto_only_with_non_empty_address(paths):
    """T901312-5: contact hub renders mailto only with a non-empty address"""
    lines = _read_lines(paths["hub"])
    idx = _first_index(lines, r"mailto:")
    assert idx is not None, "no mailto link in ContactHub.svelte (unexpected)"
    chunk = "\n".join(lines[max(0, idx - 7) : idx + 1])
    assert "{#if email}" in chunk, "hub mailto must be guarded by {#if email} like the phone link"
