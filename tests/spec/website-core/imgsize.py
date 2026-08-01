#!/usr/bin/env python3
"""Intrinsische Bilddimensionen ohne externe Bibliotheken auslesen.

Bewusst dependency-frei: der CI-Runner (ubuntu-latest) hat kein Pillow, und ein
Test, der dort still uebersprungen wird, bewacht nichts. Unterstuetzt genau die
Formate, die als Portrait-Derivate ausgeliefert werden: JPEG, WebP, AVIF.

Aufruf:  imgsize.py <datei>   ->  "<breite> <hoehe>" auf stdout, rc=0
         bei unlesbarem/unbekanntem Format: Meldung auf stderr, rc=1
"""
import struct
import sys


def jpeg_size(data):
    # SOFn-Marker suchen; Segmentlaengen ueberspringen statt blind zu scannen,
    # sonst trifft man Bytefolgen in den Bilddaten.
    i = 2
    while i < len(data) - 9:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seglen = struct.unpack(">H", data[i + 2:i + 4])[0]
        # SOF0..SOF15, ausgenommen DHT(C4), JPGA(C8), DAC(CC)
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        i += 2 + seglen
    return None


def webp_size(data):
    if data[8:12] != b"WEBP":
        return None
    fmt = data[12:16]
    if fmt == b"VP8X":
        # 24-bit little-endian, gespeichert als wert-1
        w = int.from_bytes(data[24:27], "little") + 1
        h = int.from_bytes(data[27:30], "little") + 1
        return w, h
    if fmt == b"VP8 ":
        w = int.from_bytes(data[26:28], "little") & 0x3FFF
        h = int.from_bytes(data[28:30], "little") & 0x3FFF
        return w, h
    if fmt == b"VP8L":
        bits = int.from_bytes(data[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    return None


def avif_size(data):
    # ISOBMFF: die ispe-Box traegt die intrinsische Groesse. Bei mehreren Items
    # (z.B. Alpha-Ebene) ist die groesste Flaeche das Hauptbild.
    best = None
    pos = data.find(b"ispe")
    while pos != -1:
        w, h = struct.unpack(">II", data[pos + 8:pos + 16])
        if best is None or w * h > best[0] * best[1]:
            best = (w, h)
        pos = data.find(b"ispe", pos + 4)
    return best


def main():
    if len(sys.argv) != 2:
        print("usage: imgsize.py <datei>", file=sys.stderr)
        return 1
    path = sys.argv[1]
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError as exc:
        print(f"imgsize: {exc}", file=sys.stderr)
        return 1

    if data[:2] == b"\xff\xd8":
        size = jpeg_size(data)
    elif data[:4] == b"RIFF":
        size = webp_size(data)
    elif data[4:8] == b"ftyp":
        size = avif_size(data)
    else:
        print(f"imgsize: unbekanntes Format: {path}", file=sys.stderr)
        return 1

    if size is None:
        print(f"imgsize: Dimensionen nicht lesbar: {path}", file=sys.stderr)
        return 1
    print(f"{size[0]} {size[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
