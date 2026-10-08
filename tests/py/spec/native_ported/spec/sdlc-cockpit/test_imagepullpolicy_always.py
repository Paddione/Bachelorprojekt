"""Native migration of tests/spec/sdlc-cockpit/imagepullpolicy-always.bats."""
# (T003740)

import re


def test_t003740_sdlc_console_nutzt_image_pull_policy_always_auf_dem_latest_image(repo_root):
    manifest = repo_root / "k3d/sdlc-stack/sdlc-console.yaml"
    assert manifest.is_file(), f"MISSING: {manifest}"
    text = manifest.read_text(encoding="utf-8")

    # POSITIV-ANKER: Deployment existiert und referenziert das :latest-Image.
    assert "name: sdlc-console" in text, f"FAIL: Deployment sdlc-console nicht in {manifest}"
    assert "ghcr.io/paddione/website-sdlc:latest" in text, f"FAIL: kein :latest-Image in {manifest}"

    # Gegenstand: imagePullPolicy-Feld vorhanden, aber nicht IfNotPresent.
    assert "imagePullPolicy:" in text, "FAIL: kein imagePullPolicy-Feld im sdlc-console-Manifest"
    assert not re.search(r"imagePullPolicy:\s*IfNotPresent", text), (
        f"FAIL: imagePullPolicy IfNotPresent in {manifest}"
    )
