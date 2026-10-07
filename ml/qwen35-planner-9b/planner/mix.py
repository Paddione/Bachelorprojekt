"""U6: final training mix. Gold is the 50 % anchor; other sources are capped, never upsampled."""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from planner.common import DATA, STATS, read_jsonl, write_jsonl

SHARE = {"gold": 50, "rft": 20, "text": 18, "vision": 12}
SPECIAL = ("<|im_start|>", "<|im_end|>", "<|endoftext|>", "<|vision_start|>", "<|image_pad|>",
           "<think>", "</think>", "<tool_call>")


def is_clean(row: dict) -> bool:
    """No chat-control tokens in user text or in the assistant body after our think block."""
    user, assistant = row["messages"][0]["content"], row["messages"][-1]["content"]
    texts = [user] if isinstance(user, str) else [b.get("text", "") for b in user if b.get("type") == "text"]
    end = assistant.find("</think>")
    texts.append(assistant[end + len("</think>"):] if end != -1 else assistant)
    return not any(tok in t for t in texts for tok in SPECIAL)


class NotEnoughData(Exception):
    pass


def build(gold: list, rft: list, replay_text: list, replay_vision: list, *, seed: int = 7,
          val_frac: float = 0.03, min_gold: int = 1500, min_rft: int = 500) -> tuple[list, list]:
    if len(gold) < min_gold:
        raise NotEnoughData(f"gold {len(gold)} < {min_gold}")
    if len(rft) < min_rft:
        raise NotEnoughData(f"rft {len(rft)} < {min_rft}")
    rng = random.Random(seed)
    unit = len(gold) / SHARE["gold"]
    picked = list(gold)
    for name, part in (("rft", rft), ("text", replay_text), ("vision", replay_vision)):
        cap = int(round(unit * SHARE[name]))
        part = list(part)
        rng.shuffle(part)
        picked += part[:cap]
    rng.shuffle(picked)
    n_val = max(1, int(len(picked) * val_frac))
    return picked[n_val:], picked[:n_val]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", type=Path, default=DATA)
    ap.add_argument("--min-gold", type=int, default=1500)
    ap.add_argument("--min-rft", type=int, default=500)
    args = ap.parse_args(argv)
    replay = read_jsonl(args.data / "replay.jsonl")
    parts = {
        "gold": read_jsonl(args.data / "gold.jsonl"),
        "rft": read_jsonl(args.data / "rft.jsonl"),
        "text": [r for r in replay if r["meta"]["source"] == "replay-text"],
        "vision": [r for r in replay if r["meta"]["source"] == "replay-vision"],
    }
    dirty = {k: sum(not is_clean(r) for r in v) for k, v in parts.items()}
    parts = {k: [r for r in v if is_clean(r)] for k, v in parts.items()}
    counts = {k: len(v) for k, v in parts.items()}
    try:
        train, val = build(parts["gold"], parts["rft"], parts["text"], parts["vision"],
                           min_gold=args.min_gold, min_rft=args.min_rft)
    except NotEnoughData as e:
        print(json.dumps({"error": f"not enough data: {e}", "available": counts}))
        return 2
    write_jsonl(args.data / "train.jsonl", train)
    write_jsonl(args.data / "val.jsonl", val)
    used = {}
    for r in train + val:
        used[r["meta"]["source"]] = used.get(r["meta"]["source"], 0) + 1
    result = {"available": counts, "dropped_dirty": dirty, "used": used, "train": len(train), "val": len(val),
              "think_share": round(sum(r["enable_thinking"] for r in train) / len(train), 3)}
    stats = json.loads(STATS.read_text()) if STATS.is_file() else {}
    stats["mix"] = result
    STATS.write_text(json.dumps(stats, indent=2) + "\n")
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
