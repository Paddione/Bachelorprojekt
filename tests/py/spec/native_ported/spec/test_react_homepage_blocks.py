"""Native migration of tests/spec/react-homepage-blocks.bats."""

import re
from pathlib import Path

import pytest

WEB = "components/mentolder-web"
SCHEMA = f"{WEB}/src/blocks/schema.ts"
SEED = f"{WEB}/src/blocks/seed.ts"
RENDERER = f"{WEB}/src/blocks/BlockRenderer.tsx"
HOMEPAGE = f"{WEB}/src/pages/HomePage.tsx"
VITEST = f"{WEB}/vitest.config.ts"
CATALOG = ("hero", "stats", "services", "whyMe", "process", "faq", "cta")


@pytest.fixture
def repo(repo_root):
    return repo_root


def _text(repo_root: Path, rel: str) -> str:
    return (repo_root / rel).read_text(encoding="utf-8")


def test_schema_covers_all_7_catalog_block_type_literals(repo_root):
    pattern = r"z\.literal\('(hero|stats|services|whyMe|process|faq|cta)'\)"
    lines = [line for line in _text(repo_root, SCHEMA).splitlines() if re.search(pattern, line)]
    assert lines, "grep -E z.literal: kein Treffer"
    output = "\n".join(lines)
    for t in CATALOG:
        assert f"'{t}'" in output, t


def test_schema_covers_the_3_generic_block_type_literals(repo_root):
    text = _text(repo_root, SCHEMA)
    for t in ("richText", "image", "spacer"):
        assert re.search(rf"z\.literal\('{t}'\)", text), t


def test_schema_exports_a_single_schema_version_constant(repo_root):
    text = _text(repo_root, SCHEMA)
    assert len([line for line in text.splitlines() if re.search(r"export const SCHEMA_VERSION", line)]) >= 1
    # Muss ein Literal (Zahl) sein.
    assert re.search(r"export const SCHEMA_VERSION = [0-9]+", text)


def test_services_items_icon_is_a_closed_enum_of_icon_registry_keys(repo_root):
    text = _text(repo_root, SCHEMA)
    for key in ("fuehrung", "digitalisierung", "team", "strategie", "kommunikation", "resilienz"):
        assert re.search(rf"'{key}'", text), key


def test_why_me_props_intro_is_structured_as_prefix_emphasis_suffix(repo_root):
    text = _text(repo_root, SCHEMA)
    for field in ("prefix", "emphasis", "suffix"):
        assert re.search(rf"{field}: z\.string\(\)", text), field


# ── Seed contract ──────────────────────────────────────────────────────

def test_seed_ts_contains_all_7_catalog_block_type_literals_in_order(repo_root):
    matches = re.findall(r"type: '(hero|stats|services|whyMe|process|faq|cta)'", _text(repo_root, SEED))
    assert matches, "grep -oE type: kein Treffer"
    joined = " ".join(f"type: '{m}'" for m in matches[:7])
    assert re.search(
        r"type: 'hero'.*type: 'stats'.*type: 'services'.*type: 'whyMe'.*type: 'process'.*type: 'faq'.*type: 'cta'",
        joined), joined


def test_seed_ts_contains_the_inline_testimonial_quote_name_quote_role(repo_root):
    text = _text(repo_root, SEED)
    assert "quoteName: 'Gerald Korczewski'" in text
    assert "quoteRole: 'Coach und digitaler Begleiter'" in text


def test_seed_ts_uses_structured_why_me_intro_with_prefix_emphasis_suffix(repo_root):
    text = _text(repo_root, SEED)
    assert "prefix: 'Ich kenne beide Welten: '" in text
    assert "emphasis: '40 Jahre etablierte Strukturen'" in text
    assert "suffix: ' UND modernste KI-Tools" in text


# ── BlockRenderer contract ─────────────────────────────────────────────

def test_block_renderer_validates_the_document_with_zod(repo_root):
    text = _text(repo_root, RENDERER)
    assert "HomepageBlocksDocument" in text
    assert "safeParse" in text


def test_block_renderer_falls_back_to_seed_on_schema_version_mismatch(repo_root):
    text = _text(repo_root, RENDERER)
    assert "schemaVersion !== SCHEMA_VERSION" in text
    assert "homepageSeed" in text


# ── HomePage refactor contract ─────────────────────────────────────────

def test_homepage_tsx_no_longer_renders_inline_homepage_content_no_hero_direct_import(repo_root):
    path = repo_root / HOMEPAGE
    # Fehlende Datei: grep schlaegt fehl, '!' macht daraus Erfolg (Original-Semantik).
    if not path.is_file():
        return
    assert "from '@/components/Hero'" not in path.read_text(encoding="utf-8")


def test_homepage_tsx_no_longer_imports_homepage_content_fields_from_content_ts(repo_root):
    path = repo_root / HOMEPAGE
    if not path.is_file():
        return
    lines = path.read_text(encoding="utf-8").splitlines()
    imports = [line for line in lines if re.search(r"from '@/content'", line)]
    if not imports:
        return
    # Nur SITE (SEO-Metadaten) ist erlaubt.
    assert any(re.search(r"\{ ?SITE ?\}", line) for line in imports)
    assert not any(re.search(r"(heroContent|stats|services|faqItems|processSteps|whyMe)", line) for line in imports)


def test_homepage_tsx_is_reduced_to_less_than_50_lines_null_diff_refactor(repo_root):
    lines = (repo_root / HOMEPAGE).read_bytes().count(b"\n")
    assert lines < 50


def test_no_block_component_imports_content_ts(repo_root):
    blocks = repo_root / WEB / "src" / "blocks"
    if not blocks.is_dir():
        return
    for f in sorted(blocks.rglob("*.tsx")):
        if f.name.endswith(".test.tsx"):
            continue
        if re.search(r"from '@/content'", f.read_text(encoding="utf-8")):
            pytest.fail(f"Block imports content.ts: {f}")


# ── Test stack contract ────────────────────────────────────────────────

def test_vitest_config_has_jsdom_environment_and_at_alias(repo_root):
    text = _text(repo_root, VITEST)
    assert "jsdom" in text
    assert "find: '@'" in text


def test_svg_react_imports_are_stubbed_in_vitest_config(repo_root):
    assert re.search(r"svg.*react", _text(repo_root, VITEST))
    assert (repo_root / WEB / "src" / "test" / "svg-stub.tsx").is_file()
