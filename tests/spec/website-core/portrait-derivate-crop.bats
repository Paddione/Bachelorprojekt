#!/usr/bin/env bats
# tests/spec/website-core/portrait-derivate-crop.bats
# SSOT: openspec/specs/website-core.md
# Ticket: T002507
#
# Pruefmodus (Konvention T002448-M4): RESULTAT-basiert. Die Tests messen die
# intrinsischen Dimensionen der ausgelieferten Bilddateien und den tatsaechlichen
# Crop-Offset gegen das Original — nicht Muster im Quelltext. Einzige Ausnahme ist
# das Auslesen der deklarierten width/height- und aspect-ratio-Werte aus
# Portrait.svelte: diese Werte existieren nur dort, und sie werden nicht auf ein
# Muster geprueft, sondern gegen die gemessenen Dateidimensionen verglichen.
#
# Der Dimensions-Reader tests/spec/website-core/imgsize.py ist bewusst
# dependency-frei, damit diese Tests auf dem nackten CI-Runner echt laufen und
# nicht still uebersprungen werden.

ROOT="$BATS_TEST_DIRNAME/../../.."
PUBLIC="$ROOT/website/public"
PORTRAIT="$ROOT/website/src/components/Portrait.svelte"
ORIGINAL="$PUBLIC/gerald.jpg"
IMGSIZE="$BATS_TEST_DIRNAME/imgsize.py"
GENERATOR="$ROOT/scripts/build-portrait-derivatives.sh"

# Alle ausgelieferten Portrait-Derivate.
DERIVATES=(gerald.avif gerald.webp gerald-400.avif gerald-400.webp)

# Erwartetes Seitenverhaeltnis des .portrait-Rahmens.
EXPECTED_W=4
EXPECTED_H=5

_size() {
  python3 "$IMGSIZE" "$1"
}

_has_pillow() {
  python3 -c 'import PIL' 2>/dev/null
}

@test "Original gerald.jpg ist lesbar und hochkant (Positiv-Anker)" {
  # Ohne diesen Anker koennten alle folgenden Aussagen vakuos gelten, wenn die
  # Quelldatei fehlt oder der Reader nichts liefert.
  [ -f "$ORIGINAL" ]
  run _size "$ORIGINAL"
  [ "$status" -eq 0 ]
  local w h
  read -r w h <<<"$output"
  [ "$w" -gt 0 ]
  [ "$h" -gt "$w" ]
}

@test "alle Portrait-Derivate haben das Seitenverhaeltnis des Rahmens (4:5)" {
  local missing=0
  for f in "${DERIVATES[@]}"; do
    [ -f "$PUBLIC/$f" ] || { echo "fehlt: $f"; missing=1; continue; }
    run _size "$PUBLIC/$f"
    [ "$status" -eq 0 ]
    local w h
    read -r w h <<<"$output"
    # w/h == 4/5  <=>  w*5 == h*4  (ganzzahlig, kein Float-Vergleich)
    if [ $(( w * EXPECTED_H )) -ne $(( h * EXPECTED_W )) ]; then
      echo "FAIL $f: ${w}x${h} ist nicht ${EXPECTED_W}:${EXPECTED_H}"
      missing=1
    fi
  done
  [ "$missing" -eq 0 ]
}

@test "Portrait.svelte deklariert dasselbe Seitenverhaeltnis wie die Derivate" {
  [ -f "$PORTRAIT" ]
  run grep -oE 'aspect-ratio:[[:space:]]*[0-9]+[[:space:]]*/[[:space:]]*[0-9]+' "$PORTRAIT"
  [ "$status" -eq 0 ]
  local declared
  declared="$(echo "$output" | head -1 | grep -oE '[0-9]+[[:space:]]*/[[:space:]]*[0-9]+' | tr -d '[:space:]')"
  [ "$declared" = "${EXPECTED_W}/${EXPECTED_H}" ]
}

@test "deklarierte width/height am Portrait-img entsprechen der ausgelieferten Datei" {
  [ -f "$PORTRAIT" ]
  local img_line declared_w declared_h
  img_line="$(grep -E '<img[^>]*fetchpriority' "$PORTRAIT" | head -1)"
  [ -n "$img_line" ]
  declared_w="$(echo "$img_line" | grep -oE 'width="[0-9]+"' | grep -oE '[0-9]+')"
  declared_h="$(echo "$img_line" | grep -oE 'height="[0-9]+"' | grep -oE '[0-9]+')"
  [ -n "$declared_w" ]
  [ -n "$declared_h" ]

  # src zeigt auf das WebP-Derivat (avatarSrc der Brand-Config).
  run _size "$PUBLIC/gerald.webp"
  [ "$status" -eq 0 ]
  local actual_w actual_h
  read -r actual_w actual_h <<<"$output"

  [ "$declared_w" -eq "$actual_w" ]
  [ "$declared_h" -eq "$actual_h" ]
}

@test "Derivat-Crop ist am oberen Rand des Originals verankert (y=0)" {
  _has_pillow || skip "Pillow nicht verfuegbar — Pixel-Match braucht echtes Decoding"
  [ -f "$PUBLIC/gerald.webp" ]

  run python3 - "$ORIGINAL" "$PUBLIC/gerald.webp" <<'PY'
import sys
from PIL import Image, ImageChops

orig = Image.open(sys.argv[1]).convert("L")
deriv = Image.open(sys.argv[2]).convert("L")
dw, dh = deriv.size
ow, oh = orig.size

# Hoehe des Ausschnitts im Original, der auf das Derivat abgebildet wurde.
crop_h = round(ow * dh / dw)
if crop_h > oh:
    print("-1")
    sys.exit(0)

best_y, best_err = None, None
for y in range(0, oh - crop_h + 1, 10):
    cand = orig.crop((0, y, ow, y + crop_h)).resize((dw, dh))
    hist = ImageChops.difference(cand, deriv).histogram()
    err = sum(i * i * n for i, n in enumerate(hist)) / (dw * dh)
    if best_err is None or err < best_err:
        best_y, best_err = y, err
print(best_y)
PY
  [ "$status" -eq 0 ]
  local best_y
  best_y="$(echo "$output" | tail -1)"
  # Positiv-Anker: der Match muss ueberhaupt einen gueltigen Offset gefunden haben.
  [ "$best_y" -ge 0 ]
  # Toleranz 10 = Schrittweite der Suche.
  [ "$best_y" -le 10 ]
}

@test "Generator erzeugt Derivate, die den committeten entsprechen" {
  [ -x "$GENERATOR" ]
  _has_pillow || skip "Pillow nicht verfuegbar — Generator braucht einen Encoder"

  local tmp="$BATS_TEST_TMPDIR/out"
  mkdir -p "$tmp"
  run bash "$GENERATOR" --source "$ORIGINAL" --out "$tmp"
  [ "$status" -eq 0 ]

  for f in "${DERIVATES[@]}"; do
    [ -f "$tmp/$f" ]
    run _size "$tmp/$f"
    [ "$status" -eq 0 ]
    local gen_w gen_h
    read -r gen_w gen_h <<<"$output"

    run _size "$PUBLIC/$f"
    [ "$status" -eq 0 ]
    local com_w com_h
    read -r com_w com_h <<<"$output"

    [ "$gen_w" -eq "$com_w" ]
    [ "$gen_h" -eq "$com_h" ]
  done
}
