#!/usr/bin/env bats
# tests/spec/llm-local-dev/comfy-image-postprocess.bats — T900379
# SSOT: openspec/specs/llm-local-dev.md
#   Requirement: Generated Images Can Be Cut Out and Pixelated
#
# PRUEFMODUS: Output-Verifikation. postprocess.py wird mit einem generierten
# Testbild AUFGERUFEN; geprueft werden Groesse, Farbanzahl und Alpha des Ergebnisses.

setup() {
  PY="${COMFY_IMAGE_TEST_PYTHON:-python3}"
  "$PY" -c 'import PIL' 2>/dev/null || skip "Pillow not installed"
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  PP="$REPO/scripts/comfy-image-mcp/postprocess.py"
  IN="$BATS_TEST_TMPDIR/in.png"
  "$PY" - "$IN" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFilter
img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
for r in range(100, 0, -4):
    d.ellipse((128 - r, 128 - r, 128 + r, 128 + r), fill=(255 - r, 2 * r, 120, 255))
img = img.filter(ImageFilter.GaussianBlur(6))
img.save(sys.argv[1])
PY
}

# Gibt "breite hoehe deckende_farben alpha_werte" aus.
inspect() {
  "$PY" - "$1" <<'PY'
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGBA")
raw = img.tobytes()
px = [tuple(raw[i:i + 4]) for i in range(0, len(raw), 4)]
opaque = {p[:3] for p in px if p[3] > 0}
alphas = sorted({p[3] for p in px})
print(img.width, img.height, len(opaque), ",".join(map(str, alphas)))
PY
}

@test "pixelate yields the target grid, a small palette and a hard alpha" {
  run "$PY" "$PP" --in "$IN" --out "$BATS_TEST_TMPDIR/px.png" --pixelate 32 --colors 8
  [ "$status" -eq 0 ]
  read -r w h n a <<<"$(inspect "$BATS_TEST_TMPDIR/px.png")"
  [ "$w" -eq 32 ] && [ "$h" -eq 32 ]
  [ "$n" -ge 1 ] && [ "$n" -le 8 ]
  [ "$a" = "0,255" ]
}

@test "scale upsamples with whole pixel blocks" {
  run "$PY" "$PP" --in "$IN" --out "$BATS_TEST_TMPDIR/px4.png" --pixelate 32 --colors 8 --scale 4
  [ "$status" -eq 0 ]
  run "$PY" - "$BATS_TEST_TMPDIR/px4.png" <<'PY'
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGBA")
assert img.size == (128, 128), img.size
for by in range(0, 128, 4):
    for bx in range(0, 128, 4):
        block = {img.getpixel((bx + x, by + y)) for x in range(4) for y in range(4)}
        assert len(block) == 1, (bx, by, block)
print("blocks ok")
PY
  [ "$status" -eq 0 ]
  [ "$output" = "blocks ok" ]
}

@test "transparent produces an RGBA image" {
  "$PY" -c 'import rembg' 2>/dev/null || skip "rembg not installed"
  run "$PY" "$PP" --in "$IN" --out "$BATS_TEST_TMPDIR/cut.png" --transparent
  [ "$status" -eq 0 ]
  [ "$("$PY" -c "from PIL import Image;print(Image.open('$BATS_TEST_TMPDIR/cut.png').mode)")" = "RGBA" ]
}

# Kleines deckendes Rechteck (40x80) auf 256x256 transparenter Leinwand. [T900386]
small_subject() {
  "$PY" - "$1" <<'PY'
import sys
from PIL import Image, ImageDraw
img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
ImageDraw.Draw(img).rectangle((100, 60, 139, 139), fill=(200, 40, 40, 255))
img.save(sys.argv[1])
PY
}

@test "trim crops to the subject plus a small margin" {
  small_subject "$BATS_TEST_TMPDIR/small.png"
  run "$PY" "$PP" --in "$BATS_TEST_TMPDIR/small.png" --out "$BATS_TEST_TMPDIR/trim.png" --trim
  [ "$status" -eq 0 ]
  read -r w h n a <<<"$(inspect "$BATS_TEST_TMPDIR/trim.png")"
  # Motiv 40x80, Rand max(1, round(0.02*256)) = 5 px je Seite -> 50x90
  [ "$w" -eq 50 ] && [ "$h" -eq 90 ]
}

@test "trim before pixelate lets the subject fill the longer side" {
  small_subject "$BATS_TEST_TMPDIR/small.png"
  run "$PY" "$PP" --in "$BATS_TEST_TMPDIR/small.png" --out "$BATS_TEST_TMPDIR/tp.png" --trim --pixelate 32 --colors 4
  [ "$status" -eq 0 ]
  run "$PY" - "$BATS_TEST_TMPDIR/tp.png" <<'PY'
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGBA")
bbox = img.getchannel("A").getbbox()
print(img.height, bbox[1], img.height - bbox[3])
PY
  [ "$status" -eq 0 ]
  read -r h top bottom <<<"$output"
  [ "$h" -eq 32 ]
  [ "$top" -le 2 ] && [ "$bottom" -le 2 ]
}

@test "trim leaves an image without alpha unchanged" {
  "$PY" -c "from PIL import Image; Image.new('RGB', (120, 80), (10, 20, 30)).save('$BATS_TEST_TMPDIR/rgb.png')"
  run "$PY" "$PP" --in "$BATS_TEST_TMPDIR/rgb.png" --out "$BATS_TEST_TMPDIR/rgbt.png" --trim
  [ "$status" -eq 0 ]
  read -r w h n a <<<"$(inspect "$BATS_TEST_TMPDIR/rgbt.png")"
  [ "$w" -eq 120 ] && [ "$h" -eq 80 ]
}

@test "an unreadable input fails with a message" {
  echo "not a png" > "$BATS_TEST_TMPDIR/bad.png"
  run "$PY" "$PP" --in "$BATS_TEST_TMPDIR/bad.png" --out "$BATS_TEST_TMPDIR/o.png" --pixelate 16
  [ "$status" -ne 0 ]
  [ -n "$output" ]
}
