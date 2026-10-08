"""Native migration of tests/spec/cookie-consent.bats."""


def test_t901370_1_cookie_banner_uses_no_muted_gray_text_on_dark_ground(repo_root):
    """T901370-1: cookie banner uses no muted gray text on dark ground (contrast 3.22 instead of 4.5)."""
    consent = repo_root / "components" / "website" / "src" / "components" / "CookieConsent.svelte"
    assert consent.is_file(), f"missing: {consent}"
    lines = [
        f"{n}:{line}"
        for n, line in enumerate(consent.read_text(encoding="utf-8").splitlines(), 1)
        if "text-muted" in line
    ]
    assert not lines, "text-muted still present in CookieConsent.svelte (3.22 on dark, needs 4.5):\n" + "\n".join(lines[:5])
