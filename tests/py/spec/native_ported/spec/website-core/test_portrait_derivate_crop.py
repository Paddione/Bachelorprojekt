"""Native migration of tests/spec/website-core/portrait-derivate-crop.bats."""
# [T002507]
# Result-based checks: intrinsic dimensions of the shipped image files and the crop offset against
# the original. The declared width/height/aspect-ratio values are read from Portrait.svelte only,
# and compared to the measured file dimensions. The dimension reader tests/spec/website-core/imgsize.py

# is dependency-free and is run as a helper.

import re
import shutil
import subprocess

import pytest

DERIVATES = ["gerald.avif", "gerald.webp", "gerald-400.avif", "gerald-400.webp"]
EXPECTED_W = 4
EXPECTED_H = 5


@pytest.fixture
def paths(repo_root):
    public = repo_root / "components" / "website" / "public"
    return {
        "public": public,
        "portrait": repo_root / "components" / "website" / "src" / "components" / "Portrait.svelte",
        "original": public / "gerald.jpg",
        "imgsize": repo_root / "tests" / "spec" / "website-core" / "imgsize.py",
        "generator": repo_root / "scripts" / "build-portrait-derivatives.sh",
        "repo": repo_root,
    }


@pytest.fixture
def size(run_cmd, paths):
    def _size(path):
        res = run_cmd(["python3", str(paths["imgsize"]), str(path)], cwd=paths["repo"])
        assert res.returncode == 0, res.output
        parts = res.stdout.split()
        return int(parts[0]), int(parts[1])

    return _size


def _has_pillow():
    if shutil.which("python3") is None:
        return False
    res = subprocess.run(["python3", "-c", "import PIL"], capture_output=True)
    return res.returncode == 0


def test_original_gerald_jpg_ist_lesbar_und_hochkant_positiv_anker(paths, size):
    assert paths["original"].is_file()
    w, h = size(paths["original"])
    assert w > 0
    assert h > w


def test_alle_portrait_derivate_haben_das_seitenverhaeltnis_des_rahmens_4_5(paths, size):
    missing = []
    for name in DERIVATES:
        f = paths["public"] / name
        if not f.is_file():
            missing.append(f"fehlt: {name}")
            continue
        w, h = size(f)
        if w * EXPECTED_H != h * EXPECTED_W:
            missing.append(f"FAIL {name}: {w}x{h} ist nicht {EXPECTED_W}:{EXPECTED_H}")
    assert not missing, "\n".join(missing)


def test_portrait_svelte_deklariert_dasselbe_seitenverhaeltnis_wie_die_derivate(paths):
    assert paths["portrait"].is_file()
    matches = re.findall(r"aspect-ratio:[ \t]*[0-9]+[ \t]*/[ \t]*[0-9]+", paths["portrait"].read_text(encoding="utf-8"))
    assert matches, "grep -oE aspect-ratio: lieferte keinen Treffer"
    declared = re.sub(r"\s", "", re.search(r"[0-9]+[ \t]*/[ \t]*[0-9]+", matches[0]).group(0))
    assert declared == f"{EXPECTED_W}/{EXPECTED_H}"


def test_deklarierte_width_height_am_portrait_img_entsprechen_der_ausgelieferten_datei(paths, size):
    assert paths["portrait"].is_file()
    lines = [l for l in paths["portrait"].read_text(encoding="utf-8").splitlines()
             if re.search(r"<img[^>]*fetchpriority", l)]
    assert lines, "kein <img ... fetchpriority>"
    img_line = lines[0]
    w_match = re.search(r'width="([0-9]+)"', img_line)
    h_match = re.search(r'height="([0-9]+)"', img_line)
    assert w_match and h_match
    # src points at the WebP derivative (avatarSrc of the brand config).
    actual_w, actual_h = size(paths["public"] / "gerald.webp")
    assert int(w_match.group(1)) == actual_w
    assert int(h_match.group(1)) == actual_h


def test_derivat_crop_ist_am_oberen_rand_des_originals_verankert_y_0(paths, run_cmd):
    if not _has_pillow():
        pytest.skip("Pillow nicht verfuegbar - Pixel-Match braucht echtes Decoding")
    assert (paths["public"] / "gerald.webp").is_file()

    script = (
        "import sys\n"
        "from PIL import Image, ImageChops\n"
        "orig = Image.open(sys.argv[1]).convert('L')\n"
        "deriv = Image.open(sys.argv[2]).convert('L')\n"
        "dw, dh = deriv.size\n"
        "ow, oh = orig.size\n"
        "crop_h = round(ow * dh / dw)\n"
        "if crop_h > oh:\n"
        "    print('-1')\n"
        "    sys.exit(0)\n"
        "best_y, best_err = None, None\n"
        "for y in range(0, oh - crop_h + 1, 10):\n"
        "    cand = orig.crop((0, y, ow, y + crop_h)).resize((dw, dh))\n"
        "    hist = ImageChops.difference(cand, deriv).histogram()\n"
        "    err = sum(i * i * n for i, n in enumerate(hist)) / (dw * dh)\n"
        "    if best_err is None or err < best_err:\n"
        "        best_y, best_err = y, err\n"
        "print(best_y)\n"
    )
    res = run_cmd(["python3", "-c", script, str(paths["original"]), str(paths["public"] / "gerald.webp")],
                  cwd=paths["repo"])
    assert res.returncode == 0, res.output
    best_y = int(res.stdout.strip().splitlines()[-1])
    # Positive anchor: the match found a valid offset at all.
    assert best_y >= 0
    # Tolerance 10 = search step size.
    assert best_y <= 10


def test_generator_erzeugt_derivate_die_den_committeten_entsprechen(paths, size, run_cmd, tmp_path):
    assert paths["generator"].exists()
    import os
    assert os.access(paths["generator"], os.X_OK), "generator not executable"
    if not _has_pillow():
        pytest.skip("Pillow nicht verfuegbar - Generator braucht einen Encoder")

    out = tmp_path / "out"
    out.mkdir()
    res = run_cmd(["bash", str(paths["generator"]), "--source", str(paths["original"]), "--out", str(out)],
                  cwd=paths["repo"])
    assert res.returncode == 0, res.output

    for name in DERIVATES:
        assert (out / name).is_file()
        gen_w, gen_h = size(out / name)
        com_w, com_h = size(paths["public"] / name)
        assert gen_w == com_w
        assert gen_h == com_h
