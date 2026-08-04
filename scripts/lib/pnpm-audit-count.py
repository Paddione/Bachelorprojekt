#!/usr/bin/env python3
"""G-DEP01: zaehlt high/critical-Advisories aus `pnpm audit --json` (stdin).

pnpm liefert EIN pretty-printed JSON-Objekt mit einer `advisories`-Map, keine
JSON-Lines. Der bis T002648 verwendete zeilenweise Parser lief darauf in
`AttributeError: 'str' object has no attribute 'get'`; der Fehler wurde vom
Fallback-Zweig des Aufrufers verschluckt und das GATE meldete dauerhaft `n/a`.

Unparsbare Eingabe fuehrt deshalb zu Exit != 0 OHNE Zahl auf stdout. Ein Gate,
das bei kaputter Eingabe `0` druckt, behauptet "keine Schwachstellen gefunden" —
das waere schlimmer als gar keine Messung. Die Unterscheidung "node_modules
fehlt" (legitim nicht messbar) trifft der Aufrufer, bevor er hier landet.
"""

import json
import sys

try:
    data = json.load(sys.stdin)
except (json.JSONDecodeError, UnicodeDecodeError) as exc:
    print(f"pnpm-audit-count: Eingabe nicht als JSON lesbar: {exc}", file=sys.stderr)
    sys.exit(1)

if not isinstance(data, dict):
    print(f"pnpm-audit-count: erwartet ein JSON-Objekt, erhielt {type(data).__name__}", file=sys.stderr)
    sys.exit(1)

advisories = data.get("advisories")
if advisories is None:
    print("pnpm-audit-count: kein 'advisories'-Schluessel — Ausgabeformat geaendert?", file=sys.stderr)
    sys.exit(1)

if isinstance(advisories, dict):
    entries = advisories.values()
else:
    entries = advisories

print(sum(1 for a in entries if isinstance(a, dict) and a.get("severity") in ("high", "critical")))
