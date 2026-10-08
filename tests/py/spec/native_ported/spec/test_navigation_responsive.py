"""Native migration of tests/spec/navigation-responsive.bats."""
import re
from pathlib import Path

import pytest

NAV_REL = "components/website/src/components/Navigation.svelte"
MEDIA_RE = re.compile(r"@media \(max-width: 860px\)")
BLOCK_END_RE = re.compile(r"^  \}$")


def _mobile_block(nav: Path) -> str:
    """Emulate awk '/@media \\(max-width: 860px\\)/,/^  \\}$/' (range pattern)."""
    out = []
    in_range = False
    for line in nav.read_text(encoding="utf-8").splitlines():
        if not in_range and MEDIA_RE.search(line):
            in_range = True
        if in_range:
            out.append(line)
            if BLOCK_END_RE.match(line):
                in_range = False
    return "\n".join(out)


def _rule_lines(block: str, selector_re: str, count: int) -> str:
    """Emulate: grep -n '<selector>' | head -1 | tail -n +N | head -n count."""
    lines = block.splitlines()
    idx = next((i for i, line in enumerate(lines) if re.search(selector_re, line)), None)
    assert idx is not None, f"rule {selector_re} missing from mobile block"
    return "\n".join(lines[idx : idx + count])


@pytest.fixture
def nav_file(repo_root: Path) -> Path:
    nav = repo_root / NAV_REL
    assert nav.is_file(), f"missing component: {nav}"
    return nav


@pytest.fixture
def mobile_block(nav_file: Path) -> str:
    block = _mobile_block(nav_file)
    assert block.strip(), "no @media (max-width: 860px) block in Navigation.svelte"
    return block


def test_t901310_1_mobile_breakpoint_hides_the_header_cta_pill(mobile_block):
    """T901310-1: mobile breakpoint hides the header CTA pill"""
    snippet = _rule_lines(mobile_block, r"\.nav-cta *\{", 5)
    assert re.search(r"display: *none", snippet), (
        ".nav-cta is not hidden (display:none) in mobile block"
    )


def test_t901310_2_mobile_breakpoint_lets_the_brand_name_shrink_with_ellipsis(mobile_block):
    """T901310-2: mobile breakpoint lets the brand name shrink with ellipsis"""
    brand = _rule_lines(mobile_block, r"\.brand *\{", 6)
    assert re.search(r"flex-shrink: *1", brand), ".brand must allow shrinking (flex-shrink: 1) in mobile block"
    assert re.search(r"min-width: *0", brand), ".brand must set min-width: 0 in mobile block"

    name = _rule_lines(mobile_block, r"\.brand-name *\{", 8)
    assert re.search(r"white-space: *nowrap", name), ".brand-name must not wrap in mobile block"
    assert re.search(r"text-overflow: *ellipsis", name), ".brand-name must ellipsis in mobile block"
