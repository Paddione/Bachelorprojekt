#!/usr/bin/env python3
"""YAML-Parser-Helfer fuer den Sealer (T901721).

Ersetzt das Zeilen-Parsing (`KEY: value` pro Zeile), das mehrzeilige
Values still auf Zeile 1 kappte (T901720: SSH-Keys, SISH-Liste).

Semantik (bewusst zweigeteilt, Null-Drift-Prinzip):
- Einzeilige Skalare werden BYTE-IDENTISCH zum alten Parser uebernommen
  (rohe Zeile, nur aeussere Quotes gestrippt wie zuvor). Insbesondere
  bleiben `\n`-Escapes aus T901720 literal — keine stille Umdeutung.
- Mehrzeilige Skalare (Literal-/Folded-Bloecke, Fortsetzungszeilen)
  wurden zuvor KORRUPT versiegelt (Truncation); sie werden jetzt korrekt
  nach YAML-Semantik gelesen. Das ist neues Verhalten, aber das alte war
  Datenverlust — `drift-report` macht es sichtbar statt still.

Komplexe Values (Maps/Listen) und Duplikat-Keys -> harter Abbruch
(fr/device Tests pruefen das). Fehlercodes: 2 Usage, 3 YAML-Fehler,
4 PyYAML fehlt.
"""
import base64
import re
import sys

KEY_RE = re.compile(r"^([A-Za-z0-9_]+):[ \t]*(.*)$")


def _old_unquote(value: str) -> str:
    if len(value) >= 2 and value.startswith('"') and value.endswith('"'):
        value = value[1:-1]
    if len(value) >= 2 and value.startswith("'") and value.endswith("'"):
        value = value[1:-1]
    return value


def _is_skip(line: str) -> bool:
    stripped = line.strip(" \t\r\n")
    return not stripped or stripped.startswith("#")


def load_raw(path: str) -> list:
    """Gibt [(key, raw_single_line_oder_None, start, end)] je Top-Level-Key."""
    try:
        import yaml
    except ImportError:
        print("FEHLER: PyYAML fehlt (python3 -m pip install pyyaml) — Sealer braucht es seit T901721.", file=sys.stderr)
        return None
    try:
        text = open(path, encoding="utf-8").read()
    except OSError as exc:
        print(f"FEHLER: secrets-Datei nicht lesbar: {path} ({exc})", file=sys.stderr)
        return None
    lines = text.split("\n")
    try:
        root = yaml.compose(text)
    except yaml.YAMLError as exc:
        print(f"FEHLER: secrets-YAML unguelting: {path} ({exc})", file=sys.stderr)
        return None
    if root is None:
        return []
    if not hasattr(root, "value") or not isinstance(root.value, list):
        print(f"FEHLER: {path} ist kein flaches Key-Value-Mapping.", file=sys.stderr)
        return None
    out = []
    seen = set()
    for knode, vnode in root.value:
        key = str(knode.value)
        if key in seen:
            print(f"FEHLER: doppelter Key '{key}' in {path} (still ueberschreiben verboten).", file=sys.stderr)
            return None
        seen.add(key)
        tag = getattr(vnode, "tag", "")
        if tag not in ("tag:yaml.org,2002:str", "tag:yaml.org,2002:null", "tag:yaml.org,2002:int",
                       "tag:yaml.org,2002:float", "tag:yaml.org,2002:bool"):
            print(f"FEHLER: Key '{key}' ist kein Skalar (Maps/Listen nicht unterstuetzt).", file=sys.stderr)
            return None
        # Nur wenn Key, Value-Anfang UND Value-Ende auf derselben Zeile
        # liegen, ist es ein einzeiliger Skalar (byte-identisch uebernehmen).
        # Block-Header (`KEY: |`) und Fortsetzungszeilen -> komponierter Wert.
        single = (vnode.start_mark.line == knode.start_mark.line == vnode.end_mark.line)
        if single:
            raw_line = lines[knode.start_mark.line]
            m = KEY_RE.match(raw_line)
            if not m or m.group(1) != key:
                print(f"FEHLER: Key-Zeile unerwartet fuer '{key}'.", file=sys.stderr)
                return None
            out.append((key, _old_unquote(m.group(2)), None))
        else:
            val = vnode.value
            if val is None:
                val = ""
            elif not isinstance(val, str):
                val = str(val)
            out.append((key, None, val))
    return out


def cmd_dump_tsv(path, wanted):
    parsed = load_raw(path)
    if parsed is None:
        return 3
    table = {}
    for key, raw, multi in parsed:
        table[key] = raw if raw is not None else multi
    keys = wanted or sorted(table.keys())
    for key in keys:
        val = table.get(key, "")
        sys.stdout.write(f"{key}\t{base64.b64encode(val.encode('utf-8')).decode('ascii')}\n")
    return 0


def emit_entry(dest: str, val: str) -> str:
    """Eine Manifest-Zeile (oder Literal-Block) fuer stringData."""
    if "\n" not in val:
        escaped = val.replace('"', '\\"')
        return f'  {dest}: "{escaped}"\n'
    if val.endswith("\n") and not val.endswith("\n\n"):
        indicator, body = "|", val[:-1]
    elif "\n" not in val:
        indicator, body = "|-", val
    else:
        indicator, body = "|+", val[:-1] if val.endswith("\n") else val
    lines = [f"  {dest}: {indicator}\n"]
    lines.extend(f"    {bline}\n" for bline in body.split("\n"))
    return "".join(lines)


def cmd_render_entries():
    """Liest `dest<TAB>b64(value)` von stdin, schreibt Manifest-Zeilen."""
    for line in sys.stdin.read().splitlines():
        if not line.strip():
            continue
        if "\t" not in line:
            print(f"FEHLER: ungueltige render-Eingabe: {line[:60]}", file=sys.stderr)
            return 2
        dest, _, b64 = line.partition("\t")
        if not dest:
            print(f"FEHLER: ungueltige render-Eingabe: {line[:60]}", file=sys.stderr)
            return 2
        try:
            val = base64.b64decode(b64).decode("utf-8")
        except Exception as exc:
            print(f"FEHLER: base64 kaputt fuer {dest} ({exc})", file=sys.stderr)
            return 2
        sys.stdout.write(emit_entry(dest, val))
    return 0


def cmd_dump_stringdata(path):
    try:
        import yaml
    except ImportError:
        print("FEHLER: PyYAML fehlt (python3 -m pip install pyyaml) — Sealer braucht es seit T901721.", file=sys.stderr)
        return 4
    parsed = load_raw(path)
    if parsed is None:
        return 3
    for key, raw, multi in parsed:
        val = raw if raw is not None else multi
        sys.stdout.write(emit_entry(key, val))
    return 0


def cmd_drift_report(path):
    """Vergleicht Alt-Parser-Rekonstruktion vs. Neu-Semantik pro Key."""
    parsed = load_raw(path)
    if parsed is None:
        return 3
    # Alt-Parser: strikt einzeilig.
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return 3
    old = {}
    for line in text.split("\n"):
        s = line.strip(" \t\r\n")
        if not s or s.startswith("#"):
            continue
        m = KEY_RE.match(line)
        if m:
            old[m.group(1)] = _old_unquote(m.group(2))
    diffs = 0
    for key, raw, multi in parsed:
        new = raw if raw is not None else multi
        if old.get(key) != new:
            diffs += 1
            reason = "mehrzeilig-korrigiert" if raw is None else "reinterpretiert"
            sys.stdout.write(f"{key}\t{reason}\n")
    return 0


def main(argv):
    if len(argv) < 2 or argv[1] not in ("dump-tsv", "dump-stringdata", "drift-report", "render-entries"):
        print("Usage: parse-secrets-yaml.py {dump-tsv|dump-stringdata|drift-report|render-entries} <file> [keys...]", file=sys.stderr)
        return 2
    cmd = argv[1]
    path = argv[2] if len(argv) > 2 else ""
    wanted = argv[3:]
    if cmd == "render-entries":
        if len(argv) != 2:
            print("Usage: parse-secrets-yaml.py render-entries < stdin", file=sys.stderr)
            return 2
        return cmd_render_entries()
    if cmd == "dump-tsv":
        return cmd_dump_tsv(path, wanted)
    if cmd == "dump-stringdata":
        if wanted:
            print("Usage: dump-stringdata nimmt keine Keys.", file=sys.stderr)
            return 2
        return cmd_dump_stringdata(path)
    return cmd_drift_report(path)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
