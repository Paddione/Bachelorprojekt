#!/usr/bin/env python3
"""gguf-tensor-names.py — Liest Tensor-Namen und ausgewaehlte Metadaten aus dem
GGUF-Header, ohne die Gewichte zu laden.

Zweck [T012414]: belegen, ob ein GGUF einen eingebauten Zusatz-Head traegt
(z. B. Multi-Token-Prediction) oder ob dieser als separate Datei danebenliegen
muss. Die Modellkarte allein beantwortet das nicht zuverlaessig — der Header
schon, und er steht in den ersten Megabytes der Datei.

Aufruf:
    python3 scripts/llm/gguf-tensor-names.py <datei.gguf> [suchbegriff ...]

Ohne Suchbegriff werden Anzahl und ein Ausschnitt der Namen ausgegeben; mit
Suchbegriffen nur die Treffer (Teilstring, klein geschrieben verglichen).
"""
import struct
import sys

# GGUF-Werttypen (gguf-Spezifikation)
U8, I8, U16, I16, U32, I32, F32, BOOL, STRING, ARRAY, U64, I64, F64 = range(13)
_FIXED = {
    U8: ("<B", 1), I8: ("<b", 1), U16: ("<H", 2), I16: ("<h", 2),
    U32: ("<I", 4), I32: ("<i", 4), F32: ("<f", 4), BOOL: ("<?", 1),
    U64: ("<Q", 8), I64: ("<q", 8), F64: ("<d", 8),
}


class Reader:
    def __init__(self, fh):
        self.fh = fh

    def raw(self, n):
        b = self.fh.read(n)
        if len(b) != n:
            raise EOFError("GGUF-Header unerwartet zu Ende")
        return b

    def u32(self):
        return struct.unpack("<I", self.raw(4))[0]

    def u64(self):
        return struct.unpack("<Q", self.raw(8))[0]

    def string(self):
        return self.raw(self.u64()).decode("utf-8", "replace")

    def value(self, vtype):
        if vtype in _FIXED:
            fmt, size = _FIXED[vtype]
            return struct.unpack(fmt, self.raw(size))[0]
        if vtype == STRING:
            return self.string()
        if vtype == ARRAY:
            etype = self.u32()
            n = self.u64()
            return [self.value(etype) for _ in range(n)]
        raise ValueError(f"unbekannter GGUF-Werttyp {vtype}")


def main(argv):
    if len(argv) < 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    path, needles = argv[1], [a.lower() for a in argv[2:]]

    with open(path, "rb") as fh:
        r = Reader(fh)
        if r.raw(4) != b"GGUF":
            print(f"{path}: kein GGUF (Magic fehlt)", file=sys.stderr)
            return 1
        version = r.u32()
        n_tensors = r.u64()
        n_kv = r.u64()

        meta = {}
        for _ in range(n_kv):
            key = r.string()
            meta[key] = r.value(r.u32())

        names = []
        for _ in range(n_tensors):
            names.append(r.string())
            n_dims = r.u32()
            r.raw(8 * n_dims)   # Dimensionen
            r.u32()             # ggml-Typ
            r.u64()             # Offset

    print(f"datei:       {path}")
    print(f"gguf-version {version}, tensoren {n_tensors}, kv-eintraege {n_kv}")
    for k in ("general.architecture", "general.name", "general.size_label"):
        if k in meta:
            print(f"{k}: {meta[k]}")
    # Architektur-Schluessel, die auf einen Zusatz-Head hindeuten.
    for k in sorted(meta):
        kl = k.lower()
        if any(t in kl for t in ("nextn", "mtp", "draft", "vision", "clip", "mm.", "audio")):
            v = meta[k]
            if isinstance(v, list):
                v = f"<liste, {len(v)} eintraege>"
            print(f"{k}: {v}")

    if needles:
        hits = [n for n in names if any(t in n.lower() for t in needles)]
        print(f"\ntreffer fuer {needles}: {len(hits)}")
        for n in hits[:40]:
            print(f"  {n}")
    else:
        print("\nerste tensor-namen:")
        for n in names[:10]:
            print(f"  {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
