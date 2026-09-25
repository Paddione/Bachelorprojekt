#!/usr/bin/env python3
"""Nachbearbeitung fuer comfy-image-mcp (T900379, Design D6).

Freistellung (rembg, Modell isnet-general-use) und Pixelate (Pillow) fuer Webgame-Assets.
Laeuft im ComfyUI-venv (COMFY_IMAGE_PYTHON); rembg wird nur fuer --transparent importiert.

  postprocess.py --in raw.png --out asset.png [--transparent] [--pixelate SIZE --colors N --scale K]

Reihenfolge: erst Freistellung, dann Pixelate. Exit 0 = Datei geschrieben, sonst Meldung auf stderr.
"""
import argparse
import sys

REMBG_MODEL = "isnet-general-use"
ALPHA_THRESHOLD = 128


def bounded(lo, hi):
    def parse(value):
        n = int(value)
        if not lo <= n <= hi:
            raise argparse.ArgumentTypeError(f"{n} liegt nicht in [{lo}, {hi}]")
        return n
    return parse


def cut_out(img):
    try:
        from rembg import new_session, remove
    except ImportError:
        print("postprocess: rembg fehlt — task llm:comfy-image:install ausfuehren", file=sys.stderr)
        sys.exit(3)
    return remove(img, session=new_session(REMBG_MODEL)).convert("RGBA")


def pixelate(img, size, colors, scale):
    from PIL import Image

    img = img.convert("RGBA")
    ratio = size / max(img.width, img.height)
    small = img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.Resampling.BOX)

    # Alpha hart machen: Pixel-Art kennt keine halbtransparenten Kanten.
    alpha = small.getchannel("A").point(lambda a: 255 if a >= ALPHA_THRESHOLD else 0)
    # Nur deckende Pixel zaehlen zur Palette: transparente vorher auf eine deckende Nachbarfarbe setzen
    # waere Aufwand ohne Nutzen, sie werden nach der Quantisierung ohnehin wieder ausgeblendet.
    rgb = small.convert("RGB")
    # tobytes statt getdata (in Pillow 14 entfernt): 3 Byte RGB je Pixel, 1 Byte Alpha je Pixel.
    raw, amask = rgb.tobytes(), alpha.tobytes()
    opaque = [tuple(raw[i * 3:i * 3 + 3]) for i, a in enumerate(amask) if a]
    if opaque:
        sample = Image.new("RGB", (len(opaque), 1))
        sample.putdata(opaque)
        palette = sample.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
        rgb = rgb.quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    # Transparente Pixel einheitlich schwarz, damit sie keine Restfarbe tragen.
    out = Image.composite(out, Image.new("RGBA", out.size, (0, 0, 0, 0)), alpha)
    if scale > 1:
        out = out.resize((out.width * scale, out.height * scale), Image.Resampling.NEAREST)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--transparent", action="store_true")
    ap.add_argument("--pixelate", type=bounded(8, 512), metavar="SIZE")
    ap.add_argument("--colors", type=bounded(2, 256), default=16)
    ap.add_argument("--scale", type=bounded(1, 16), default=1)
    args = ap.parse_args(argv)

    try:
        from PIL import Image
    except ImportError:
        print("postprocess: Pillow fehlt im Interpreter " + sys.executable, file=sys.stderr)
        return 3
    try:
        img = Image.open(args.src)
        img.load()
    except Exception as exc:  # noqa: BLE001 — jede Lesefehlerart ist fuer den Aufrufer gleich
        print(f"postprocess: {args.src} ist kein lesbares Bild: {exc}", file=sys.stderr)
        return 2
    if args.transparent:
        img = cut_out(img)
    if args.pixelate:
        img = pixelate(img, args.pixelate, args.colors, args.scale)
    img.save(args.dst, format="PNG")
    return 0


if __name__ == "__main__":
    sys.exit(main())
