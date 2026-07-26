#!/usr/bin/env python3
"""[T002221] Print one tools: entry per line from an agent definition's frontmatter.

Prints nothing when the file has no frontmatter or no tools: key — "no tools key"
and "empty tools list" are deliberately distinguishable by the caller via the
presence of the key itself, which the caller greps for.

Supports both frontmatter spellings used in .claude/agents/:
    tools: [Bash, Read, Glob, Grep]        # inline flow sequence
    tools:                                  # block sequence
      - Bash
      - Read
"""
import sys
import pathlib

try:
    import yaml
except ImportError:  # pragma: no cover - yaml ships with the CI image
    print("PyYAML missing", file=sys.stderr)
    sys.exit(2)

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
if not text.startswith("---"):
    sys.exit(0)

# Frontmatter is everything up to the second '---' line.
parts = text.split("\n---", 1)
if len(parts) < 2:
    sys.exit(0)
front = parts[0].lstrip("-\n")

try:
    meta = yaml.safe_load(front) or {}
except yaml.YAMLError as exc:
    print(f"{path}: unparseable frontmatter: {exc}", file=sys.stderr)
    sys.exit(1)

tools = meta.get("tools")
if tools is None:
    sys.exit(0)
if isinstance(tools, str):
    tools = [t.strip() for t in tools.split(",")]
for entry in tools:
    entry = str(entry).strip()
    if entry:
        print(entry)
