"""Native migration of tests/spec/flux-render-security/immutable-image-refs.bats."""

import re
import shutil
from pathlib import Path

import pytest

FIXTURE_ENV = {
    "SMTP_PORT": "587",
    "SMTP_HOST": "smtp.example.org",
    "SMTP_USER": "x",
    "POCKET_ID_SMTP_TLS": "starttls",
    "POCKET_ID_FRONTEND_URL": "https://auth.example",
    "POCKET_ID_URL": "http://pocket-id:1411",
    "POCKET_ID_DOMAIN": "id.example",
    "WEBSITE_IMAGE_DIGEST": "sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41",
    "BRETT_IMAGE_DIGEST": "sha256:9090909090909090909090909090909090909090909090909090909090909090",
}

PLACEHOLDER_WEBSITE = "sha256:1111111111111111111111111111111111111111111111111111111111111111"
PLACEHOLDER_BRETT = "sha256:2222222222222222222222222222222222222222222222222222222222222222"


def _prod_trees(out: Path):
    return [out / "mentolder", out / "korczewski", out / "website-mentolder", out / "website-korczewski"]


def _image_refs_for(out: Path, needle: str) -> list:
    rx = re.compile(r"image: *[^ ]*" + re.escape(needle) + r"[^ ]*")
    refs = []
    for tree in _prod_trees(out):
        if not tree.is_dir():
            continue
        for path in sorted(tree.rglob("*")):
            if not path.is_file():
                continue
            for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
                refs.extend(m.group(0) for m in rx.finditer(line))
    return refs


@pytest.fixture
def render(run_cmd, repo_root, tmp_path):
    script = repo_root / "scripts/flux-render-artifact.sh"
    out = tmp_path / "render"
    out.mkdir()

    def _run(env=None):
        merged = dict(FIXTURE_ENV)
        merged.update(env or {})
        return run_cmd(["bash", str(script), "--out", str(out)], env=merged, timeout=900), out

    return _run


def test_immutable_image_refs_renderer_produces_the_prod_trees_offline_positive_anchor(render):
    res, out = render()
    assert res.returncode == 0, res.output
    found = sum(1 for t in _prod_trees(out) if t.is_dir())
    assert found == 4


def test_immutable_image_refs_website_image_is_pinned_by_digest_in_every_prod_tree(render):
    res, out = render()
    assert res.returncode == 0, res.output
    refs = _image_refs_for(out, "paddione/website")
    assert refs, "no website image references in prod trees"
    bad = [r for r in refs if "@sha256:" not in r]
    assert not bad, "Website-Image ohne Digest im prod-Baum:\n" + "\n".join(bad)


def test_immutable_image_refs_brett_image_is_pinned_by_digest_in_every_prod_tree(render):
    res, out = render()
    assert res.returncode == 0, res.output
    refs = _image_refs_for(out, "workspace-brett")
    assert refs, "no brett image references in prod trees"
    bad = [r for r in refs if "@sha256:" not in r]
    assert not bad, (
        "Brett-Image ohne Digest im prod-Baum:\n" + "\n".join(bad)
        + "\nHinweis: BRETT_IMAGE_TAG erreicht kein Manifest"
    )


def test_immutable_image_refs_no_movable_latest_tag_survives_for_website_or_brett_in_prod(render):
    res, out = render()
    assert res.returncode == 0, res.output
    refs = _image_refs_for(out, "paddione/website") + _image_refs_for(out, "workspace-brett")
    assert refs, "no website/brett references in prod trees"
    movable = [r for r in refs if re.search(r":latest *$", r)]
    assert not movable, "beweglicher :latest-Tag im prod-Baum:\n" + "\n".join(movable)


def test_immutable_image_refs_caller_provided_website_digest_survives_into_the_rendered_artifact(render):
    res, out = render()
    assert res.returncode == 0, res.output
    manifest = out / "website-mentolder" / "website-mentolder.yaml"
    assert manifest.is_file()
    text = manifest.read_text(encoding="utf-8")
    assert "ghcr.io/paddione/website@sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41" in text
    assert PLACEHOLDER_WEBSITE not in text


def test_immutable_image_refs_renderer_aborts_when_a_placeholder_digest_would_reach_the_artifact(render):
    res, _out = render(
        {"WEBSITE_IMAGE_DIGEST": PLACEHOLDER_WEBSITE, "BRETT_IMAGE_DIGEST": PLACEHOLDER_BRETT}
    )
    assert res.returncode != 0
    assert "placeholder digest" in res.output
