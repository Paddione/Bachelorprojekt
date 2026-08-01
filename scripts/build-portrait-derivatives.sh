#!/usr/bin/env bash
# build-portrait-derivatives.sh — erzeugt die Portrait-Derivate reproduzierbar
# aus dem Original.  Ticket T002507.
#
# Vorgeschichte: die Derivate waren handgemacht und quadratisch aus der MITTE des
# hochkanten Originals geschnitten (Ausschnitt y=340..1705 von 2048) — dabei ist
# der Oberkopf verlorengegangen, ohne dass es irgendwo dokumentiert war.  Dieses
# Skript friert den Ausschnitt ein: Anker y=0, Seitenverhaeltnis wie der
# .portrait-Rahmen (4:5).  Siehe openspec/specs/website-core.md.
#
# Aufruf:
#   bash scripts/build-portrait-derivatives.sh [--source <jpg>] [--out <dir>]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$REPO_ROOT/website/public/gerald.jpg"
OUT_DIR="$REPO_ROOT/website/public"

# Seitenverhaeltnis des .portrait-Rahmens in Portrait.svelte.  Aendert sich das
# dort, muss es hier mitgeaendert werden — der BATS-Test
# tests/spec/website-core/portrait-derivate-crop.bats vergleicht beide.
RATIO_W=4
RATIO_H=5

usage() {
  cat <<EOF
Usage: $(basename "$0") [--source <jpg>] [--out <dir>]

Erzeugt die vier Portrait-Derivate aus dem Original.  Der Ausschnitt ist am
oberen Rand des Originals verankert (y=0), damit der Kopf vollstaendig im Bild
bleibt, und traegt das Seitenverhaeltnis ${RATIO_W}:${RATIO_H} des Rahmens.

Optionen:
  --source <jpg>   Originalbild (Default: website/public/gerald.jpg)
  --out <dir>      Zielverzeichnis (Default: website/public)
  -h, --help       Diese Hilfe
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    --out)    OUT_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unbekannte Option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -f "$SOURCE" ] || { echo "FEHLER: Quelldatei nicht gefunden: $SOURCE" >&2; exit 1; }
[ -d "$OUT_DIR" ] || { echo "FEHLER: Zielverzeichnis nicht gefunden: $OUT_DIR" >&2; exit 1; }

# Encoder-Preflight.  Fehlt der AVIF-Support, wird hart abgebrochen statt still
# nur WebP zu schreiben: ein Generator, der die Haelfte der Ausgabe unterschlaegt
# und trotzdem Erfolg meldet, erzeugt genau die unbemerkte Drift, gegen die
# dieses Skript existiert.
if ! python3 -c 'from PIL import features; import sys; sys.exit(0 if features.check("avif") else 1)' 2>/dev/null; then
  echo "FEHLER: Pillow mit AVIF-Support wird benoetigt." >&2
  echo "        Installation: python3 -m pip install --upgrade 'pillow>=11.3'" >&2
  exit 1
fi

python3 - "$SOURCE" "$OUT_DIR" "$RATIO_W" "$RATIO_H" <<'PY'
import sys
from pathlib import Path

from PIL import Image

source, out_dir, ratio_w, ratio_h = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])

# Zielgroessen: (breite, hoehe, dateipraefix). Die Hoehen folgen aus dem
# Rahmenverhaeltnis, nicht aus einer separat gepflegten Liste.
WIDTHS = [(600, "gerald"), (400, "gerald-400")]

img = Image.open(source)
orig_w, orig_h = img.size

crop_h = round(orig_w * ratio_h / ratio_w)
if crop_h > orig_h:
    print(
        f"FEHLER: Original {orig_w}x{orig_h} ist zu flach fuer {ratio_w}:{ratio_h} "
        f"(benoetigt {crop_h} px Hoehe).",
        file=sys.stderr,
    )
    sys.exit(1)

# ── Der Kern des Fixes (T002507) ──────────────────────────────────────────────
# Anker y=0: der obere Rand des Originals.  Das ist der einzige Anker, bei dem
# der Verlust von Kopfraum konstruktiv unmoeglich ist.  Jeder Offset > 0 waere
# wieder eine Ermessensentscheidung ohne Pruefkriterium — genau der Zustand, der
# zu diesem Ticket gefuehrt hat.
cropped = img.crop((0, 0, orig_w, crop_h))

written = []
for width, prefix in WIDTHS:
    height = round(width * ratio_h / ratio_w)
    scaled = cropped.resize((width, height), Image.LANCZOS)
    # Qualitaeten kalibriert gegen die Groessen der Vorgaenger-Derivate: das
    # 4:5-Bild hat 25 % mehr Flaeche als das quadratische, und der Hero ist das
    # LCP-Element — ohne Kalibrierung waere der Fix ein Performance-Regress
    # (unkalibriert: AVIF 22656 B gegen vorher 9671 B).
    for ext, params in (("avif", {"quality": 45}), ("webp", {"quality": 75, "method": 6})):
        target = out_dir / f"{prefix}.{ext}"
        scaled.save(target, **params)
        written.append((target, width, height))

print(f"Original: {orig_w}x{orig_h} · Ausschnitt: (0, 0, {orig_w}, {crop_h}) · Anker y=0")
for target, width, height in written:
    print(f"  {target.name}: {width}x{height} ({target.stat().st_size} B)")
PY
