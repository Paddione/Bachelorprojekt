#!/usr/bin/env python3
"""Liest die /admin/loadouts/status-Antwort von stdin und gibt den Slug des
laufenden chat-gpu-Loadouts aus (leer, wenn keines laeuft).  [T013593]

Die Gruppenzugehoerigkeit steht nicht im Status-Endpunkt, sondern in
loadouts.json — deshalb die zwei Quellen.

Eigene Datei statt Heredoc im Shell-Skript: die Proxy-Antwort kommt ueber
stdin, nicht per Interpolation in den Quelltext.
"""
import json
import sys


def main() -> int:
    loadouts_path, own_slug = sys.argv[1], sys.argv[2]
    try:
        status = json.load(sys.stdin)
    except ValueError:
        print("running-chat-gpu: Status-Antwort nicht parsbar", file=sys.stderr)
        return 1
    with open(loadouts_path) as fh:
        loadouts = json.load(fh)

    group = {l["slug"]: l.get("exclusiveGroup") for l in loadouts.get("loadouts", [])}
    for entry in status.get("status", []):
        slug = entry.get("slug")
        if entry.get("running") and slug != own_slug and group.get(slug) == "chat-gpu":
            print(slug)
            break
    return 0


if __name__ == "__main__":
    sys.exit(main())
