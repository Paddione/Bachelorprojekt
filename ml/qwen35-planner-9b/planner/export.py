"""U8: merge the adapter, graft MTP head + vision tower back from the original, build GGUFs.

transformers drops `mtp.*` on load (modeling_qwen3_5.py `_keys_to_ignore_on_load_unexpected`),
so a merged checkpoint has no MTP head. The vision tower is frozen during training; any tensor
the merge did not write is copied unchanged from the original checkpoint.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from safetensors import safe_open

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from planner.common import OUT  # noqa: E402

PREFIXES = ("mtp.", "model.visual.")
GRAFT_FILE = "model-graft.safetensors"
LLAMA = Path.home() / "opt/llama.cpp-e85e15c"


class GraftError(Exception):
    pass


def _index(d: Path) -> dict:
    return json.loads((d / "model.safetensors.index.json").read_text())


def _shape(d: Path, file: str, name: str) -> list[int]:
    with safe_open(str(d / file), framework="numpy") as f:
        return list(f.get_slice(name).get_shape())


def _load(d: Path, file: str, name: str):
    try:
        import torch  # noqa: F401  real checkpoints are bf16, numpy cannot hold them
        fw = "pt"
    except ImportError:
        fw = "numpy"
    with safe_open(str(d / file), framework=fw) as f:
        return f.get_tensor(name), fw


def graft(merged_dir: Path, original_dir: Path, prefixes: tuple[str, ...] = PREFIXES) -> int:
    merged_dir, original_dir = Path(merged_dir), Path(original_dir)
    m_idx, o_idx = _index(merged_dir), _index(original_dir)
    m_map, o_map = m_idx["weight_map"], o_idx["weight_map"]
    missing = {}
    for prefix in prefixes:
        names = [n for n in o_map if n.startswith(prefix)]
        if not names:
            raise GraftError(f"original has no tensors with prefix {prefix}")
        for n in names:
            if n in m_map:
                a, b = _shape(merged_dir, m_map[n], n), _shape(original_dir, o_map[n], n)
                if a != b:
                    raise GraftError(f"shape mismatch for {n}: merged {a} vs original {b}")
            else:
                missing[n] = o_map[n]
    if missing:
        tensors, fw = {}, "numpy"
        for n, file in missing.items():
            tensors[n], fw = _load(original_dir, file, n)
        out = merged_dir / GRAFT_FILE
        if fw == "pt":
            from safetensors.torch import save_file
        else:
            from safetensors.numpy import save_file
        existing = {}
        if out.is_file():
            with safe_open(str(out), framework=fw) as f:
                existing = {k: f.get_tensor(k) for k in f.keys()}
        save_file({**existing, **tensors}, str(out))
        for n in missing:
            m_map[n] = GRAFT_FILE
        (merged_dir / "model.safetensors.index.json").write_text(json.dumps(m_idx, indent=2))
    o_cfg = json.loads((original_dir / "config.json").read_text())
    m_cfg_path = merged_dir / "config.json"
    m_cfg = json.loads(m_cfg_path.read_text())
    layers = o_cfg.get("text_config", {}).get("mtp_num_hidden_layers")
    if layers:
        m_cfg.setdefault("text_config", {})["mtp_num_hidden_layers"] = layers
        m_cfg_path.write_text(json.dumps(m_cfg, indent=2))
    return len(missing)


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def to_gguf(hf_dir: Path, out_dir: Path, name: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    py = sys.executable
    conv = str(LLAMA / "convert_hf_to_gguf.py")
    bf16 = out_dir / f"{name}-BF16.gguf"
    run([py, conv, str(hf_dir), "--outtype", "bf16", "--outfile", str(bf16)])
    run([py, conv, str(hf_dir), "--mmproj", "--outtype", "bf16", "--outfile", str(out_dir / f"mmproj-{name}-BF16.gguf")])
    quant = LLAMA / "build/bin/llama-quantize"
    for q in ("Q4_K_M", "Q8_0"):
        run([str(quant), str(bf16), str(out_dir / f"{name}-{q}.gguf"), q])


def merge(adapter: Path, out_dir: Path) -> None:
    from unsloth import FastVisionModel
    model, processor = FastVisionModel.from_pretrained(str(adapter), load_in_4bit=False)
    model.save_pretrained_merged(str(out_dir), processor, save_method="merged_16bit")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--original", type=Path, required=True, help="HF snapshot dir of the base model")
    ap.add_argument("--adapter", type=Path, help="LoRA dir; omit to export the untouched base")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--name", default="Qwen3.5-9B-planner")
    ap.add_argument("--skip-gguf", action="store_true")
    args = ap.parse_args(argv)
    if args.adapter:
        merged = args.out / "merged"
        merge(args.adapter, merged)
        print(json.dumps({"grafted": graft(merged, args.original)}))
        src = merged
    else:
        src = args.original
    if not args.skip_gguf:
        to_gguf(src, args.out / ("gguf" if args.adapter else "base-gguf"), args.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
