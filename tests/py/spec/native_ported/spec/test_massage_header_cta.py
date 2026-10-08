"""Massage header-CTA and contact-tab guards (OQ-10, T901431).

The massage brand shows a brand-specific header CTA wording instead of the
shared `nav.cta-label` string, and a journey-controlled message-tab wording.
All other brands keep the shared fallback. Static guards in the style of the
ported website specs (e.g. test_massage_a11y.py).
"""

from pathlib import Path

import pytest


@pytest.fixture
def web(repo_root: Path) -> Path:
    return repo_root / "components/website/src"


def _read(path: Path) -> str:
    assert path.is_file(), f"missing: {path}"
    return path.read_text(encoding="utf-8")


def test_t901431_1_massage_brand_sets_navigation_cta(web: Path):
    """T901431-1: massage brand config sets navigationCta to 'Termin anfragen'"""
    text = _read(web / "config/brands/massage.ts")
    assert "navigationCta: 'Termin anfragen'" in text, (
        "massage.ts must set navigationCta: 'Termin anfragen'"
    )


def test_t901431_2_navigation_renders_override_or_fallback(web: Path):
    """T901431-2: Navigation.svelte renders the ctaLabel override with shared fallback in the .nav-cta anchor"""
    lines = _read(web / "components/Navigation.svelte").splitlines()
    idx = next((i for i, line in enumerate(lines) if 'class="nav-cta"' in line), None)
    assert idx is not None, ".nav-cta anchor missing from Navigation.svelte"
    chunk = "\n".join(lines[idx : idx + 3])
    assert "ctaLabel ?? t(locale, 'nav.cta-label')" in chunk, (
        ".nav-cta anchor must render {ctaLabel ?? t(locale, 'nav.cta-label')}"
    )
    count = sum(1 for line in lines if 'class="nav-cta"' in line and "<a " in line)
    assert count == 1, f"header must keep exactly one CTA button, found {count}"


def test_t901431_3_contact_tab_wording_is_journey_controlled(web: Path):
    """T901431-3: ContactHub.svelte message-tab wording is journey-controlled"""
    lines = _read(web / "components/ContactHub.svelte").splitlines()
    assert any(
        "journeyEnabled" in line and "Schriftliche Rückfrage stellen" in line
        for line in lines
    ), "ContactHub.svelte needs a journeyEnabled line with 'Schriftliche Rückfrage stellen'"


def test_t901431_4_other_brands_keep_the_shared_fallback(web: Path):
    """T901431-4: mentolder and korczewski configs contain no navigationCta"""
    for brand in ("mentolder", "korczewski"):
        text = _read(web / f"config/brands/{brand}.ts")
        assert "navigationCta" not in text, (
            f"{brand}.ts must not set navigationCta (shared fallback stays intact)"
        )
