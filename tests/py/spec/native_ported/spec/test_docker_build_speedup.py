"""Native migration of tests/spec/docker-build-speedup.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def root(repo_root: Path) -> Path:
    return repo_root


def _read(root: Path, rel: str) -> str:
    path = root / rel
    assert path.is_file(), f"missing file: {rel}"
    return path.read_text(encoding="utf-8", errors="replace")


def _grep_tree(root: Path, rel_dirs: list[str], pattern: str) -> list[str]:
    hits = []
    rx = re.compile(pattern)
    for rel in rel_dirs:
        base = root / rel
        files = [base] if base.is_file() else sorted(p for p in base.rglob("*") if p.is_file())
        for f in files:
            text = f.read_text(encoding="utf-8", errors="replace")
            if rx.search(text):
                hits.append(str(f.relative_to(root)))
    return hits


# ── Phase 1: Layer-Caching ──────────────────────────────────────────────────

def test_p1_website_dockerfile_has_syntax_and_npm_cache_mount(root):
    lines = _read(root, "components/website/Dockerfile").split("\n")
    assert "syntax=docker/dockerfile:1" in lines[0]
    assert "mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile" in "\n".join(lines)


def test_p1_no_no_cache_in_switched_build_workflows(root):
    assert "--no-cache" not in _read(root, ".github/workflows/build-website.yml")
    assert "--no-cache" not in _read(root, ".github/workflows/build-videovault.yml")


def test_p1_website_workflow_uses_build_push_action_and_gha_cache_mode_max(root):
    text = _read(root, ".github/workflows/build-website.yml")
    assert "docker/build-push-action" in text
    assert "cache-to: type=gha,mode=max" in text


def test_p1_videovault_workflow_uses_gha_cache_mode_max(root):
    assert "cache-to: type=gha,mode=max" in _read(root, ".github/workflows/build-videovault.yml")


def test_p1_transcriber_pip_layer_has_cache_mount_and_no_no_cache_dir(root):
    text = _read(root, "k3d/talk-transcriber/Dockerfile")
    assert "mount=type=cache,target=/root/.cache/pip" in text
    assert "no-cache-dir" not in text


def test_p1_mentolder_web_dockerfile_has_pnpm_store_cache_mount(root):
    text = _read(root, "components/mentolder-web/Dockerfile")
    assert "mount=type=cache,target=/root/.local/share/pnpm/store" in text


# ── Phase 2: Website slim + Konsolidierung ─────────────────────────────────

def test_p2_website_dockerfile_prunes_dev_dependencies(root):
    assert "pnpm install --prod" in _read(root, "components/website/Dockerfile")


def test_p2_website_build_workflow_pushes_shared_image(root):
    assert "ghcr.io/paddione/website" in _read(root, ".github/workflows/build-website.yml")


def test_p2_korczewski_website_workflow_is_removed(root):
    assert not (root / ".github/workflows/build-website-korczewski.yml").is_file()


def test_p2_all_env_files_point_website_image_at_shared_name(root):
    rx = re.compile(r"^[ \t]*WEBSITE_IMAGE:[ \t]*website[ \t]*$", re.MULTILINE)
    for brand in ("mentolder", "korczewski", "fleet-mentolder", "fleet-korczewski", "staging", "dev"):
        text = _read(root, f"environments/{brand}.yaml")
        assert rx.search(text), f"WEBSITE_IMAGE not set to 'website' in environments/{brand}.yaml"


def test_p2_no_per_brand_website_image_name_left_in_workflows_or_manifests(root):
    hits = _grep_tree(root, [".github/workflows", "environments"],
                      r"paddione/(mentolder|korczewski)-website")
    assert not hits, f"per-brand website image still referenced: {hits}"


def test_p2_svc_image_repo_returns_shared_website_image_for_both_brands(run_cmd, root):
    for brand in ("mentolder", "korczewski"):
        res = run_cmd(
            ["bash", "-c", 'source scripts/lib/promote-phases.sh; svc_image_repo "$1" "$2"', "_", "website", brand],
            cwd=root,
        )
        assert res.stdout.rstrip("\n") == "ghcr.io/paddione/website", res.output


# ── Phase 3: amd64-only ────────────────────────────────────────────────────

def test_p3_transcriber_builds_amd64_only_without_qemu(root):
    text = _read(root, ".github/workflows/build-transcriber.yml")
    assert re.search(r"^[ \t]*platforms:[ \t]*linux/amd64[ \t]*$", text, re.MULTILINE)
    assert "linux/arm64" not in text
    assert "setup-qemu-action" not in text


def test_p3_collabora_builds_amd64_only_without_qemu(root):
    text = _read(root, ".github/workflows/build-collabora.yml")
    assert re.search(r"^[ \t]*platforms:[ \t]*linux/amd64[ \t]*$", text, re.MULTILINE)
    assert "linux/arm64" not in text
    assert "setup-qemu-action" not in text
