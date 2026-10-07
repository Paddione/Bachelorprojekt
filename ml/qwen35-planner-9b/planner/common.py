"""Shared helpers: paths, JSONL IO, chat-sample construction, text hashing."""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Datasets and checkpoints live outside the git worktree: the pre-commit gitleaks
# scan runs with --no-git over the whole tree and historic plans contain
# token-shaped strings. Only stats.json (next to this package) is tracked.
WORK = Path(os.environ.get("QWEN35_PLANNER_HOME", Path.home() / "ml-data" / "qwen35-planner-9b"))
DATA = WORK / "data"
OUT = WORK / "out"
STATS = ROOT / "stats.json"


def read_jsonl(path: Path) -> list[dict]:
    path = Path(path)
    if not path.is_file():
        return []
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return len(rows)


def append_jsonl(path: Path, row: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def text_hash(text: str) -> str:
    norm = re.sub(r"\s+", " ", text).strip().lower()
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()


def make_sample(prompt: str, answer: str, *, think: str | None, source: str,
                meta: dict, images: list[str] | None = None) -> dict:
    """One training row in the Qwen3.5 chat format.

    The assistant turn carries the think block inline, exactly as the chat
    template renders it: empty block for non-thinking, filled block otherwise.
    """
    if images:
        user_content = [{"type": "image", "image": img} for img in images]
        user_content.append({"type": "text", "text": prompt})
    else:
        user_content = prompt
    reasoning = "" if think is None else think.strip()
    block = "<think>\n\n</think>\n\n" if think is None else f"<think>\n{reasoning}\n</think>\n\n"
    return {
        "messages": [
            {"role": "user", "content": user_content},
            {"role": "assistant", "content": block + answer.strip()},
        ],
        "enable_thinking": think is not None,
        "meta": {**meta, "source": source},
    }
