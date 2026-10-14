#!/usr/bin/env python3
"""Mess-Sonden für einzelne Health-Ziele (T016657), ausgelagert aus health-goals-check.sh.

Jedes Subkommando gibt GENAU EINEN Wert aus: eine Ganzzahl oder "-" (nicht messbar).
"-" heißt: Messgrundlage fehlt oder Format unbrauchbar — nie eine erfundene 0.

  agentic10 [--agents DIR] [--skills DIR]
      G-AGENTIC10: Agentendefinitionen (DIR/*.md) ohne dispatchende Skill,
      d. h. ohne SKILL.md mit Frontmatter "agent: <name>".
  if02 [FILE ...]
      G-IF02: catch-Blöcke ohne Log und ohne throw (stille Degradation).
      Rethrow ist ein sichtbarer Fehler. Blöcke werden per Klammerzählung
      (Strings, Template-Literale, Kommentare beachtet) vollständig gelesen.
  k3proj
      G-K3PROJ: liest `codebase-memory-mcp cli index_status` von stdin — rohes
      JSON oder MCP-Envelope {"content":[{"type":"text","text":"<json>"}]}.
      1 = ready mit nodes/edges > 0, 0 = anderer Zustand, "-" = Format kaputt.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

IF02_FILES = ("components/website/src/lib/embeddings.ts",
              "components/website/src/lib/rerank.ts",
              "components/website/src/lib/bge-router.ts")
_CATCH = re.compile(r"(?<![.\w$])catch\s*(?:\([^)]*\))?\s*\{")
_LOGGED = re.compile(r"\blogger\.\w+\s*\(|\bconsole\.(?:error|warn)\s*\(")
_THROWS = re.compile(r"\bthrow\b")
_AGENT_LINE = re.compile(r"^agent:\s*([\w.-]+)\s*$", re.MULTILINE)


def _skip_string(src: str, i: int) -> int:
    quote = src[i]
    i += 1
    while i < len(src) and src[i] != quote:
        i += 2 if src[i] == "\\" else 1
    return i + 1


def _block_end(src: str, start: int) -> int:
    """Index hinter der schließenden Klammer des bei src[start] == '{' beginnenden Blocks."""
    stack = ["{"]  # "{" = Code-Block, "`" = Template-Literal
    i = start + 1
    while i < len(src) and stack:
        ch, top = src[i], stack[-1]
        if top == "`":
            if ch == "\\":
                i += 2
                continue
            if ch == "`":
                stack.pop()
            elif src.startswith("${", i):
                stack.append("{")
                i += 1
            i += 1
            continue
        if src.startswith("//", i):
            nl = src.find("\n", i)
            i = len(src) if nl < 0 else nl
        elif src.startswith("/*", i):
            end = src.find("*/", i + 2)
            i = len(src) if end < 0 else end + 2
        elif ch in "'\"":
            i = _skip_string(src, i)
        elif ch == "`":
            stack.append("`")
            i += 1
        else:
            if ch == "{":
                stack.append("{")
            elif ch == "}":
                stack.pop()
            i += 1
    return i


def silent_catches(src: str) -> int:
    count = 0
    for match in _CATCH.finditer(src):
        body = src[match.end():_block_end(src, match.end() - 1) - 1]
        if not _LOGGED.search(body) and not _THROWS.search(body):
            count += 1
    return count


def cmd_if02(files: list[str]) -> str:
    paths = [Path(f) for f in (files or IF02_FILES)]
    if not all(p.is_file() for p in paths):  # Positiv-Anker: Basis muss existieren
        return "-"
    return str(sum(silent_catches(p.read_text(encoding="utf-8")) for p in paths))


def cmd_agentic10(agents_dir: str, skills_dir: str) -> str:
    agents = sorted(p.stem for p in Path(agents_dir).glob("*.md"))
    if not agents:
        return "-"
    dispatched: set[str] = set()
    # .claude/skills/<name> sind Symlinks → os.walk mit followlinks statt rglob.
    skills = [Path(d) / "SKILL.md" for d, _, files in os.walk(skills_dir, followlinks=True)
              if "SKILL.md" in files]
    for skill in skills:
        text = skill.read_text(encoding="utf-8", errors="replace")
        if text.startswith("---"):
            front = text.split("---", 2)[1] if text.count("---") >= 2 else ""
            dispatched.update(_AGENT_LINE.findall(front))
    return str(sum(1 for a in agents if a not in dispatched))


def _index_payload(raw: str):
    data = json.loads(raw)
    if isinstance(data, dict) and isinstance(data.get("content"), list):
        if data.get("isError"):
            return None
        texts = [c.get("text", "") for c in data["content"]
                 if isinstance(c, dict) and c.get("type") == "text"]
        data = json.loads("\n".join(texts)) if texts else None
    return data if isinstance(data, dict) else None


def cmd_k3proj(raw: str) -> str:
    try:
        data = _index_payload(raw)
    except (ValueError, TypeError):
        return "-"
    if data is None or "status" not in data:
        return "-"
    nodes, edges = data.get("nodes"), data.get("edges")
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (nodes, edges)):
        return "-"
    return "1" if data["status"] == "ready" and nodes > 0 and edges > 0 else "0"


def _opt(args: list[str], name: str, default: str) -> str:
    return args[args.index(name) + 1] if name in args else default


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__, file=sys.stderr)
        return 2
    cmd, args = argv[0], argv[1:]
    if cmd == "agentic10":
        print(cmd_agentic10(_opt(args, "--agents", ".claude/agents"),
                            _opt(args, "--skills", ".claude/skills")))
    elif cmd == "if02":
        print(cmd_if02(args))
    elif cmd == "k3proj":
        print(cmd_k3proj(sys.stdin.read()))
    else:
        print(f"unbekanntes Subkommando: {cmd}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
