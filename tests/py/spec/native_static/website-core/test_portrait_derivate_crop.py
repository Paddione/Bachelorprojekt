"""Native migration of tests/spec/website-core/portrait-derivate-crop.bats."""

import os
import re
import pytest


DERIVATIVES = ("gerald.avif", "gerald.webp", "gerald-400.avif", "gerald-400.webp")


@pytest.fixture
def portrait_paths(repo_root):
    public = repo_root / "components/website/public"
    component = repo_root / "components/website/src/components/Portrait.svelte"
    return public, component


@pytest.fixture
def image_size(repo_root, run_cmd):
    def read(path):
        assert path.is_file(), f"Image missing: {path}"
        result = run_cmd(["python3", str(repo_root / "tests/spec/website-core/imgsize.py"), str(path)])
        assert result.returncode == 0, result.output
        width, height = map(int, result.stdout.split())
        assert width > 0 and height > 0
        return width, height
    return read


def test_original_is_readable_and_portrait(portrait_paths, image_size):
    public, _ = portrait_paths
    width, height = image_size(public / "gerald.jpg")
    assert height > width


def test_all_derivatives_match_four_by_five_frame(portrait_paths, image_size):
    public, _ = portrait_paths
    for filename in DERIVATIVES:
        width, height = image_size(public / filename)
        assert width * 5 == height * 4, filename


def test_component_declares_derivative_aspect_ratio(portrait_paths):
    _, component = portrait_paths
    match = re.search(r"aspect-ratio:\s*(\d+)\s*/\s*(\d+)", component.read_text())
    assert match
    assert match.groups() == ("4", "5")


def test_declared_img_dimensions_match_served_image(portrait_paths, image_size):
    public, component = portrait_paths
    match = re.search(r"<img[^>]*fetchpriority[^>]*>", component.read_text())
    assert match, "Priority portrait image not found"
    width = re.search(r'width="(\d+)"', match[0])
    height = re.search(r'height="(\d+)"', match[0])
    assert width and height
    assert (int(width[1]), int(height[1])) == image_size(public / "gerald.webp")


def test_crop_is_anchored_at_original_top_edge(portrait_paths):
    image = pytest.importorskip("PIL.Image", reason="Pixel matching needs Pillow")
    chops = pytest.importorskip("PIL.ImageChops")
    public, _ = portrait_paths
    with image.open(public / "gerald.jpg") as source, image.open(public / "gerald.webp") as target:
        original = source.convert("L")
        derivative = target.convert("L")
    dw, dh = derivative.size
    ow, oh = original.size
    crop_height = round(ow * dh / dw)
    assert crop_height <= oh
    errors = []
    for y in range(0, oh - crop_height + 1, 10):
        candidate = original.crop((0, y, ow, y + crop_height)).resize((dw, dh))
        histogram = chops.difference(candidate, derivative).histogram()
        error = sum(i * i * n for i, n in enumerate(histogram)) / (dw * dh)
        errors.append((error, y))
    assert errors
    assert min(errors)[1] <= 10


def test_generator_matches_committed_derivative_dimensions(repo_root, portrait_paths, image_size, run_cmd, tmp_path):
    generator = repo_root / "scripts/build-portrait-derivatives.sh"
    assert generator.is_file() and os.access(generator, os.X_OK)
    pytest.importorskip("PIL", reason="Generator needs Pillow encoder")
    public, _ = portrait_paths
    output = tmp_path / "out"
    output.mkdir()
    result = run_cmd(["bash", str(generator), "--source", str(public / "gerald.jpg"), "--out", str(output)])
    assert result.returncode == 0, result.output
    for filename in DERIVATIVES:
        assert image_size(output / filename) == image_size(public / filename)
