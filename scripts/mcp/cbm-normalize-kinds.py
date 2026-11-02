#!/usr/bin/env python3
"""cbm-normalize-kinds.py — post-index Kind-Normalisierung (K1 repo-graph-label-cleanup).

Mappt Wildwuchs-Kinds auf die Kern-Taxonomie. Default: Dry-Run (JSON-Bericht,
keine Schreibzugriffe). Mit --apply: idempotente UPDATEs.
"""

import argparse
import json
import os
import sqlite3
import sys

WILD_TO_CORE = {
    "EnvVar": "Variable",
    "Diagram": "Section",
    "DiagramElement": "Section",
    "Process": "Function",
    "Branch": "File",
    "Type": "Class",
    "Decorator": "Function",
}


def parse_args(argv):
    p = argparse.ArgumentParser(description="Normalize wild CBM node labels.")
    p.add_argument("--db", required=True, help="Pfad zur SQLite-DB")
    p.add_argument("--project", default=None, help="Optionaler Projekt-Filter")
    p.add_argument("--apply", action="store_true", help="Schreiben statt Dry-Run")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if not os.path.exists(args.db):
        print(json.dumps({"error": "db not found: %s" % args.db}))
        return 2
    try:
        conn = sqlite3.connect(args.db)
    except sqlite3.Error as exc:
        print(json.dumps({"error": str(exc)}))
        return 2
    try:
        # Fehlende DB-Datei / fehlende Tabelle -> Exit 2
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'")]
        if not tables:
            print(json.dumps({"error": "table nodes missing in %s" % args.db}))
            return 2
        mapped = {}
        untouched = 0
        for wild, core in sorted(WILD_TO_CORE.items()):
            if args.project:
                q = "SELECT COUNT(*) FROM nodes WHERE label=? AND project=?"
                n = conn.execute(q, (wild, args.project)).fetchone()[0]
            else:
                q = "SELECT COUNT(*) FROM nodes WHERE label=?"
                n = conn.execute(q, (wild,)).fetchone()[0]
            mapped["%s->%s" % (wild, core)] = n
            if args.apply and n:
                if args.project:
                    conn.execute(
                        "UPDATE nodes SET label=? WHERE label=? AND project=?",
                        (core, wild, args.project))
                else:
                    conn.execute(
                        "UPDATE nodes SET label=? WHERE label=?", (core, wild))
        if args.apply:
            conn.commit()
        else:
            conn.rollback()
        total = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        wild_left = 0
        for wild in WILD_TO_CORE:
            if args.project:
                c = conn.execute(
                    "SELECT COUNT(*) FROM nodes WHERE label=? AND project=?",
                    (wild, args.project)).fetchone()[0]
            else:
                c = conn.execute(
                    "SELECT COUNT(*) FROM nodes WHERE label=?", (wild,)).fetchone()[0]
            wild_left += c
        untouched = total - wild_left if not args.apply else None
        # Im Apply-Modus: untouched = Zeilen, die nie wild waren
        if args.apply:
            untouched = total - sum(mapped.values())
        report = {"mapped": mapped, "untouched": untouched,
                  "apply": bool(args.apply)}
        if args.project:
            report["project"] = args.project
        print(json.dumps(report, sort_keys=True))
        return 0
    except sqlite3.Error as exc:
        print(json.dumps({"error": str(exc)}))
        return 2
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
