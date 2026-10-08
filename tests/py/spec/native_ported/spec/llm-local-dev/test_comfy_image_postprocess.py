"""Native migration of tests/spec/llm-local-dev/comfy-image-postprocess.bats."""

import os
import subprocess

import pytest

PY = os.environ.get("COMFY_IMAGE_TEST_PYTHON", "python3")

MAKE_INPUT = """
import sys
from PIL import Image, ImageDraw, ImageFilter
img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
for r in range(100, 0, -4):
    d.ellipse((128 - r, 128 - r, 128 + r, 128 + r), fill=(255 - r, 2 * r, 120, 255))
img = img.filter(ImageFilter.GaussianBlur(6))
img.save(sys.argv[1])
"""

INSPECT = """
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGBA")
raw = img.tobytes()
px = [tuple(raw[i:i + 4]) for i in range(0, len(raw), 4)]
opaque = {p[:3] for p in px if p[3] > 0}
alphas = sorted({p[3] for p in px})
print(img.width, img.height, len(opaque), ",".join(map(str, alphas)))
"""

SMALL_SUBJECT = """
import sys
from PIL import Image, ImageDraw
img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
ImageDraw.Draw(img).rectangle((100, 60, 139, 139), fill=(200, 40, 40, 255))
img.save(sys.argv[1])
"""

BLOCKS = """
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGBA")
assert img.size == (128, 128), img.size
for by in range(0, 128, 4):
    for bx in range(0, 128, 4):
        block = {img.getpixel((bx + x, by + y)) for x in range(4) for y in range(4)}
        assert len(block) == 1, (bx, by, block)
print("blocks ok")
"""

BBOX = """
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGBA")
bbox = img.getchannel("A").getbbox()
print(img.height, bbox[1], img.height - bbox[3])
"""


@pytest.fixture(scope="module")
def have_pil(repo_root):
    if subprocess.run([PY, "-c", "import PIL"], capture_output=True).returncode != 0:
        pytest.skip("Pillow not installed")


@pytest.fixture
def pp(repo_root, have_pil):
    script = repo_root / "scripts" / "comfy-image-mcp" / "postprocess.py"
    return script


@pytest.fixture
def img_in(tmp_path, run_cmd):
    path = tmp_path / "in.png"
    res = run_cmd([PY, "-c", MAKE_INPUT, str(path)])
    res.check()
    return path


def _inspect(run_cmd, path):
    res = run_cmd([PY, "-c", INSPECT, str(path)])
    res.check()
    return res.stdout.split()


def test_pixelate_yields_the_target_grid_a_small_palette_and_a_hard_alpha(tmp_path, run_cmd, pp, img_in):
    out = tmp_path / "px.png"
    res = run_cmd([PY, str(pp), "--in", str(img_in), "--out", str(out), "--pixelate", "32", "--colors", "8"])
    assert res.returncode == 0
    w, h, n, a = _inspect(run_cmd, out)
    assert int(w) == 32 and int(h) == 32
    assert 1 <= int(n) <= 8
    assert a == "0,255"


def test_scale_upsamples_with_whole_pixel_blocks(tmp_path, run_cmd, pp, img_in):
    out = tmp_path / "px4.png"
    res = run_cmd([PY, str(pp), "--in", str(img_in), "--out", str(out), "--pixelate", "32", "--colors", "8", "--scale", "4"])
    assert res.returncode == 0
    res = run_cmd([PY, "-c", BLOCKS, str(out)])
    assert res.returncode == 0, res.output
    assert res.output == "blocks ok"


def test_transparent_produces_an_rgba_image(tmp_path, run_cmd, pp, img_in):
    if subprocess.run([PY, "-c", "import rembg"], capture_output=True).returncode != 0:
        pytest.skip("rembg not installed")
    out = tmp_path / "cut.png"
    res = run_cmd([PY, str(pp), "--in", str(img_in), "--out", str(out), "--transparent"])
    assert res.returncode == 0
    mode = run_cmd([PY, "-c", f"from PIL import Image;print(Image.open('{out}').mode)"])
    assert mode.stdout.strip() == "RGBA"


def test_trim_crops_to_the_subject_plus_a_small_margin(tmp_path, run_cmd, pp):
    small = tmp_path / "small.png"
    run_cmd([PY, "-c", SMALL_SUBJECT, str(small)]).check()
    out = tmp_path / "trim.png"
    res = run_cmd([PY, str(pp), "--in", str(small), "--out", str(out), "--trim"])
    assert res.returncode == 0
    w, h, _n, _a = _inspect(run_cmd, out)
    # Motiv 40x80, Rand max(1, round(0.02*256)) = 5 px je Seite -> 50x90
    assert int(w) == 50 and int(h) == 90


def test_trim_before_pixelate_lets_the_subject_fill_the_longer_side(tmp_path, run_cmd, pp):
    small = tmp_path / "small.png"
    run_cmd([PY, "-c", SMALL_SUBJECT, str(small)]).check()
    out = tmp_path / "tp.png"
    res = run_cmd([PY, str(pp), "--in", str(small), "--out", str(out), "--trim", "--pixelate", "32", "--colors", "4"])
    assert res.returncode == 0
    res = run_cmd([PY, "-c", BBOX, str(out)])
    assert res.returncode == 0
    h, top, bottom = (int(x) for x in res.stdout.split())
    assert h == 32
    assert top <= 2 and bottom <= 2


def test_trim_leaves_an_image_without_alpha_unchanged(tmp_path, run_cmd, pp):
    rgb = tmp_path / "rgb.png"
    run_cmd([PY, "-c", f"from PIL import Image; Image.new('RGB', (120, 80), (10, 20, 30)).save('{rgb}')"]).check()
    out = tmp_path / "rgbt.png"
    res = run_cmd([PY, str(pp), "--in", str(rgb), "--out", str(out), "--trim"])
    assert res.returncode == 0
    w, h, _n, _a = _inspect(run_cmd, out)
    assert int(w) == 120 and int(h) == 80


def test_an_unreadable_input_fails_with_a_message(tmp_path, run_cmd, pp):
    bad = tmp_path / "bad.png"
    bad.write_text("not a png\n")
    res = run_cmd([PY, str(pp), "--in", str(bad), "--out", str(tmp_path / "o.png"), "--pixelate", "16"])
    assert res.returncode != 0
    assert res.output
