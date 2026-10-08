"""Native migration of tests/spec/business-homepage.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root):
    root = repo_root
    brand_dir = root / "components/website/public/brand/massage"
    content_dir = root / "components/website/content/massage"
    pages_dir = root / "components/website/src/pages"
    public_dir = root / "components/website/public"
    slug_pages = [
        pages_dir / "index.astro",
        pages_dir / "leistungen.astro",
        pages_dir / "faq.astro",
        pages_dir / "ueber-mich.astro",
        pages_dir / "404.astro",
        pages_dir / "impressum.astro",
        pages_dir / "datenschutz.astro",
    ]
    return {
        "root": root,
        "brand_dir": brand_dir,
        "brand_css": brand_dir / "colors_and_type.css",
        "content_dir": content_dir,
        "pages_dir": pages_dir,
        "public_dir": public_dir,
        "config_ts": root / "components/website/src/config/brands/massage.ts",
        "slug_pages": slug_pages,
    }


def read(path):
    return Path(path).read_text(encoding="utf-8", errors="replace")


def test_t901028_1_massage_brand_folder_ships_tokens_and_favicon(paths):
    """T901028-1: massage brand folder ships tokens and favicon"""
    css = paths["brand_css"]
    assert css.is_file(), f"missing brand tokens: {css}"
    assert (paths["brand_dir"] / "favicon.svg").is_file(), f"missing favicon: {paths['brand_dir']}/favicon.svg"
    assert css.stat().st_size > 0, f"brand tokens file is empty: {css}"
    text = read(css)
    assert "--sage" in text, f"color tokens missing from {css} (want --sage)"
    assert "--serif" in text, f"typo tokens missing from {css} (want --serif)"
    assert "--sans" in text, f"typo tokens missing from {css} (want --sans)"


def test_t901028_2_homepage_ctas_point_at_the_kontakt_journey_entry(paths):
    """T901028-2: homepage CTAs point at the /kontakt journey entry"""
    config = paths["config_ts"]
    assert config.is_file(), f"missing brand config: {config}"
    assert "href: '/kontakt'" in read(config), f"leistungenCta.href is not '/kontakt' in {config}"
    index = paths["pages_dir"] / "index.astro"
    leistungen = paths["pages_dir"] / "leistungen.astro"
    assert index.is_file(), f"missing page: {index}"
    assert leistungen.is_file(), f"missing page: {leistungen}"
    assert "/kontakt" in read(index), "no /kontakt CTA in index.astro"
    assert "service=" in read(leistungen), "no service-keyed journey link in leistungen.astro"
    hits = [
        f"{path}:{n}:{line}"
        for path in (index, leistungen)
        for n, line in enumerate(read(path).splitlines(), 1)
        if 'href="#"' in line
    ]
    assert not hits, f"placeholder href found at CTA position: {hits}"


def test_t901028_3_no_dead_internal_links_on_the_7_slug_pages(paths):
    """T901028-3: no dead internal links on the 7 slug pages"""
    sources = paths["slug_pages"] + [
        paths["content_dir"] / "navigation.json",
        paths["content_dir"] / "footer.json",
    ]
    for f in sources:
        assert f.is_file(), f"missing link source: {f}"
    targets = set()
    for f in sources:
        for href in re.findall(r'href="/[^"]*"', read(f)):
            value = href[len('href="'):-1]
            value = re.split(r"[?#]", value, maxsplit=1)[0]
            targets.add(value)
    assert targets, "no internal links found at all"
    for target in sorted(targets):
        if target == "/":
            want = paths["pages_dir"] / "index.astro"
        elif "." in target:
            # Static assets (brand CSS, favicons, downloads) resolve under public/.
            want = Path(str(paths["public_dir"]) + target)
        else:
            want = Path(str(paths["pages_dir"]) + target + ".astro")
        assert want.is_file(), f"dead internal link target: {target} (want {want})"


def test_t901028_4_reduced_motion_query_disables_animation_or_transition(paths):
    """T901028-4: reduced-motion query disables animation or transition"""
    candidates = [paths["brand_css"], paths["root"] / "components/website/src/styles/global.css"]
    pattern = re.compile(r"animation:[ \t\r\f\v]*none|transition:[ \t\r\f\v]*none")
    for css in candidates:
        if not css.is_file():
            continue
        lines = read(css).splitlines()
        if not any("prefers-reduced-motion" in ln for ln in lines):
            continue
        # grep -A10: die Trefferzeile plus die zehn folgenden Zeilen.
        window = set()
        for i, ln in enumerate(lines):
            if "prefers-reduced-motion" in ln:
                window.update(range(i, min(i + 11, len(lines))))
        if any(pattern.search(lines[i]) for i in window):
            return
    pytest.fail("no prefers-reduced-motion block with animation:none/transition:none in brand or global CSS")


def test_t901028_5_no_heilversprechen_phrases_in_massage_content_and_pages(paths):
    """T901028-5: no Heilversprechen phrases in massage content and pages"""
    config = paths["config_ts"]
    for f in [config] + paths["slug_pages"]:
        assert f.is_file(), f"missing spec file: {f}"
    assert paths["content_dir"].is_dir(), f"missing content dir: {paths['content_dir']}"
    files = [config] + [p for p in sorted(paths["content_dir"].rglob("*")) if p.is_file()] + paths["slug_pages"]
    phrases = [
        "heilt",
        "Heilung",
        "garantiert",
        "schmerzfrei",
        "beseitigt Schmerzen",
        "medizinisch nachgewiesen",
    ]
    for phrase in phrases:
        hits = []
        for f in files:
            for n, line in enumerate(read(f).splitlines(), 1):
                if phrase.lower() in line.lower():
                    hits.append(f"{f}:{n}:{line}")
        assert not hits, f"verbotene Phrase '{phrase}' gefunden: {hits}"


def test_t901028_6_no_full_cream_body_gradient_headlines_or_slop_grids(paths):
    """T901028-6: no full-cream body, gradient headlines, or slop grids"""
    css = paths["brand_css"]
    assert css.is_file(), f"missing brand tokens: {css}"
    for f in paths["slug_pages"]:
        assert f.is_file(), f"missing slug page: {f}"
    lines = read(css).splitlines()
    # grep -A6 '^body': Trefferzeile plus sechs Folgezeilen, in Dateireihenfolge.
    window = set()
    for i, ln in enumerate(lines):
        if ln.startswith("body"):
            window.update(range(i, min(i + 7, len(lines))))
    body_text = "\n".join(lines[i] for i in sorted(window))
    hex_hits = re.findall(r"#[0-9A-Fa-f]{6}", body_text)
    body_bg = hex_hits[0] if hex_hits else ""
    assert body_bg == "#FDFCF9", f"body background is '{body_bg or '?'}', want #FDFCF9 (paper, not creme)"
    files = [css] + paths["slug_pages"]
    gradient = [f"{f}:{n}" for f in files for n, ln in enumerate(read(f).splitlines(), 1) if "linear-gradient" in ln]
    assert not gradient, f"gradient headline pattern found: {gradient}"
    slop = re.compile(r"bento|card-grid|features-grid|glass-card", re.IGNORECASE)
    slop_hits = [f"{f}:{n}" for f in files for n, ln in enumerate(read(f).splitlines(), 1) if slop.search(ln)]
    assert not slop_hits, f"slop grid pattern found: {slop_hits}"
