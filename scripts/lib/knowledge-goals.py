#!/usr/bin/env python3
"""G-KNOW01..06: Wissensablage-Ziele (T900995).

Regel: Wissen lebt nur als Registry-Eintrag (docs/agent-guide/registry/*.yaml),
als Kommentar/Guard am Code oder als ADR, das nach dem Anlegen nicht mehr
inhaltlich geaendert wird. Prosa-Doku, die einen Ist-Zustand beschreibt,
veraltet still (k3-code-graph.md nannte 97.506 Knoten, gemessen 52.591).

Subcommands (je eine Ganzzahl auf stdout):
  docs-only        Registry-Eintraege mit `enforced_by: docs-only`       (G-KNOW01)
  dangling         `enforced_by:`/`where:`-Werte ohne existierenden Pfad  (G-KNOW03)
  docs-md          getrackte Markdown-Dateien unter docs/ ausser docs/adr/ (G-KNOW02/04)
  agent-ctx-bytes  Bytes aller getrackten AGENTS.md/CLAUDE.md             (G-KNOW05)
  adr-edits        Commits, die ein ADR nach dem Anlegen inhaltlich aendern;
                   Status- und Superseded-Zeilen zaehlen nicht           (G-KNOW06)

Nur Standardbibliothek: die Registry-Felder werden zeilenweise gelesen, weil
PyYAML im CI nicht garantiert ist. Registry-Pfad per HG_KNOW_REGISTRY
ueberschreibbar (fuer Tests).
"""

import os
import re
import subprocess
import sys
from pathlib import Path

# Sentinel fuer "nicht messbar, aber nicht gruen" — wie mcp-endpoint-probe.py.
STRUCTURE_BROKEN = 99999

FIELD_RE = re.compile(r"^\s*(?:-\s+)?(enforced_by|where):\s*(.+?)\s*$")
ADR_META_RE = re.compile(r"^[-+]\s*(?:>\s*)?(?:\*\*Status|Superseded)")


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True,
                          check=True).stdout


def registry_fields(registry):
    for f in sorted(registry.glob("*.yaml")):
        for line in f.read_text(encoding="utf-8").splitlines():
            m = FIELD_RE.match(line)
            if m:
                yield m.group(1), m.group(2).strip("'\"")


def resolves(value):
    # Erlaubt `pfad`, `pfad:zeile` und `pfad::symbol`; mehrere Ziele per Komma.
    targets = [v.strip() for v in value.split(",") if v.strip()]
    return bool(targets) and all(
        Path(re.split(r"::|:(?=\d+$)", t)[0]).exists() for t in targets)


def docs_only(registry):
    return sum(1 for k, v in registry_fields(registry)
               if k == "enforced_by" and v == "docs-only")


def dangling(registry):
    return sum(1 for k, v in registry_fields(registry)
               if v != "docs-only" and not resolves(v))


def docs_md():
    files = git("ls-files", "--", "docs/*.md").splitlines()
    return sum(1 for f in files if not f.startswith("docs/adr/"))


def agent_ctx_bytes():
    files = git("ls-files", "--", "AGENTS.md", "CLAUDE.md",
                "*/AGENTS.md", "*/CLAUDE.md").splitlines()
    return sum(Path(f).stat().st_size for f in files
               if Path(f).is_file() and not Path(f).is_symlink())


def adr_edits():
    total = 0
    for f in git("ls-files", "--", "docs/adr/ADR-*.md").splitlines():
        # Aelteste Revision (das Anlegen) faellt weg, nur spaetere zaehlen.
        for sha in git("log", "--format=%H", "--", f).splitlines()[:-1]:
            diff = git("show", "--format=", "-U0", sha, "--", f).splitlines()
            if any(re.match(r"^[-+](?![-+])", l) and not ADR_META_RE.match(l)
                   for l in diff):
                total += 1
    return total


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    registry = Path(os.environ.get("HG_KNOW_REGISTRY",
                                   "docs/agent-guide/registry"))
    try:
        if cmd in ("docs-only", "dangling"):
            if not any(registry.glob("*.yaml")):
                print(f"knowledge-goals: keine Registry unter {registry}",
                      file=sys.stderr)
                print(STRUCTURE_BROKEN)
                return 0
            print(docs_only(registry) if cmd == "docs-only"
                  else dangling(registry))
        elif cmd == "docs-md":
            print(docs_md())
        elif cmd == "agent-ctx-bytes":
            print(agent_ctx_bytes())
        elif cmd == "adr-edits":
            print(adr_edits())
        else:
            print(__doc__, file=sys.stderr)
            return 2
    except (OSError, subprocess.CalledProcessError) as ex:
        print(f"knowledge-goals: {ex}", file=sys.stderr)
        print(STRUCTURE_BROKEN)
    return 0


if __name__ == "__main__":
    sys.exit(main())
