#!/usr/bin/env python3
"""G-IF01: zaehlt MCP-Registry-Endpunkte ohne Listener.

Beruecksichtigt ausschliesslich `clients` mit `transport: http` — die uebrigen
Eintraege werden per `command` als Subprozess gestartet und haben gar keinen
Port, der antworten koennte. Sie gehoeren weder in den Zaehler noch in den
Nenner.

Gibt die Zahl nicht erreichbarer Endpunkte auf stdout aus.

Ist die Kandidatenmenge LEER, ist das kein Messergebnis, sondern ein
Strukturbruch: dann wird ein das Ziel verletzender Wert ausgegeben und die
Ursache nach stderr geschrieben. Genau dieser Fall lag von der Registry-Umstellung
auf `clients`/`cluster` bis T002648 vor — die Messung suchte weiter einen
`servers`-Schluessel, fand nie einen und meldete dauerhaft nichts, ohne dass ein
Ziel es anzeigte.

Registry-Pfad ueberschreibbar per HG_MCP_REGISTRY (fuer Tests).
"""

import os
import socket
import sys
from urllib.parse import urlparse

# Sentinel fuer "nicht messbar, aber nicht gruen": ueberschreitet jedes
# realistische Target und faellt im Report sofort auf.
STRUCTURE_BROKEN = 99

# Auch der Import-Fehler muss einen WOHLGEFORMTEN Wert liefern. Ohne das faellt
# ein fehlendes PyYAML als leerer Wert bei row() an und erzeugt wieder
# "[: integer expression expected" — dasselbe Symptom, das dieser Fix beseitigt,
# nur mit anderer Ursache. CI installiert PyYAML ausdruecklich (ci.yml).
try:
    import yaml
except ImportError as exc:  # pragma: no cover — Umgebungsdefekt, nicht Logik
    print(f"G-IF01: PyYAML nicht verfuegbar: {exc}", file=sys.stderr)
    print(STRUCTURE_BROKEN)
    sys.exit(0)

registry = os.environ.get("HG_MCP_REGISTRY", "docs/agent-guide/registry/mcp.yaml")

try:
    with open(registry) as fh:
        data = yaml.safe_load(fh) or {}
except (OSError, yaml.YAMLError) as exc:
    print(f"G-IF01: Registry {registry} nicht lesbar: {exc}", file=sys.stderr)
    print(STRUCTURE_BROKEN)
    sys.exit(0)

clients = (data.get("clients") or {}).items()
candidates = [(n, c) for n, c in clients if (c or {}).get("transport") == "http"]

if not candidates:
    print(
        f"G-IF01: {registry} fuehrt keinen Client mit transport=http. "
        "Struktur geaendert? Die Messung zaehlt sonst dauerhaft eine leere Menge.",
        file=sys.stderr,
    )
    print(STRUCTURE_BROKEN)
    sys.exit(0)

dead = 0
for name, client in candidates:
    url = urlparse(client.get("endpoint") or "")
    if not url.hostname or not url.port:
        print(f"G-IF01: {name} hat transport=http ohne brauchbaren endpoint", file=sys.stderr)
        dead += 1
        continue
    try:
        socket.create_connection((url.hostname, url.port), timeout=2).close()
    except OSError:
        dead += 1

print(dead)
