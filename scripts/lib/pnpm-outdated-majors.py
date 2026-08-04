#!/usr/bin/env python3
"""G-DEP02: zaehlt Major-Spruenge aus `pnpm outdated --format json` (stdin).

Erwartet `{paket: {"current": "1.2.3", "latest": "2.0.0", ...}}` und zaehlt die
Eintraege, deren Major-Komponente sich erhoeht.

Wichtig fuer den Aufrufer: `pnpm outdated` endet MIT gefundenen Paketen als
Exit 1 — sein Fehlercode ist also der Normalfall. Unter `set -o pipefail` machte
das bis T002648 die gesamte Pipeline "fehlerhaft", worauf der Fallback-Zweig ein
zweites Token an den bereits korrekt gedruckten Wert haengte ("3\\n-"). Der
Aufrufer muss die Ausgabe erfassen und dann parsen, statt den Pipeline-Status als
Fehlersignal zu werten.
"""

import json
import sys


def major(version):
    """Fuehrendes ^/~/= strippen und die Major-Komponente als int liefern."""
    head = str(version).lstrip("^~=v").split(".")[0]
    return int(head) if head.isdigit() else None


try:
    data = json.load(sys.stdin)
except (json.JSONDecodeError, UnicodeDecodeError) as exc:
    print(f"pnpm-outdated-majors: Eingabe nicht als JSON lesbar: {exc}", file=sys.stderr)
    sys.exit(1)

if not isinstance(data, dict):
    print(f"pnpm-outdated-majors: erwartet ein JSON-Objekt, erhielt {type(data).__name__}", file=sys.stderr)
    sys.exit(1)

count = 0
for entry in data.values():
    if not isinstance(entry, dict):
        continue
    cur, lat = major(entry.get("current", "")), major(entry.get("latest", ""))
    if cur is not None and lat is not None and lat > cur:
        count += 1

print(count)
