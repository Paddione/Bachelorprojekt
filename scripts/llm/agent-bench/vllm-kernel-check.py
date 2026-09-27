#!/usr/bin/env python3
"""NVFP4-Kernel-Pruefung fuer den agent-bench-vLLM-Loadout.

Liest das Serverlog eines vLLM-Servers und lehnt den Loadout ab, wenn
anstelle eines echten FP4-Kernels der Marlin-Fallback gewaehlt wurde oder
gar keine FP4-Kernel-Zeile im Log steht. Zusaetzlich wird, sofern torch
importierbar ist, die Compute-Capability des per CUDA_VISIBLE_DEVICES
sichtbaren Geraets geprueft (erwartet 12.0 fuer Blackwell / RTX 5070 Ti).

Aufruf:
    vllm-kernel-check.py <serverlog> [--expect-capability 12.0] [--skip-capability]

Ausgabe (immer eine Zeile auf stdout):
    kernel=<name> cap=<major>.<minor>

Exit-Codes:
    0  FP4-Kernel bestaetigt
    1  Marlin-Fallback, keine FP4-Kernel-Zeile oder falsche Capability
    2  Aufruffehler (Log fehlt/unlesbar, Argumentfehler)
"""

from __future__ import annotations

import argparse
import re
import sys
from typing import Optional, Tuple

EXIT_OK = 0
EXIT_REFUSED = 1
EXIT_USAGE = 2

# Zeilen, die eine Kernel-Entscheidung fuer FP4/NVFP4 beinhalten.
FP4_KERNEL_LINE = re.compile(r"(?i)\b(?:nvfp4|fp4)\b")
# Bekannte Kernel-/Backend-Namen, die vLLM im Log nennt.
KERNEL_NAME = re.compile(
    r"(?i)\b(flashinfer|flash-infer|cutlass|marlin|machete|trtllm|"
    r"tensorrt|cuda|native|awq|ggml|triton)\b"
)
MARLIN = re.compile(r"(?i)\bmarlin\b")


def evaluate_log(text: str) -> Tuple[bool, str]:
    """Return (accepted, reason). Faellt Marlin oder fehlt die FP4-Zeile, wird abgelehnt."""
    for raw in text.splitlines():
        if not FP4_KERNEL_LINE.search(raw):
            continue
        name = KERNEL_NAME.search(raw)
        if MARLIN.search(raw) or (name and name.group(1).lower() == "marlin"):
            return False, "marlin"
        if not name:
            continue
        return True, name.group(1).lower()
    return False, "no-fp4-kernel-line"


def device_capability() -> Optional[str]:
    """Compute-Capability des sichtbaren Geraets, oder None wenn torch fehlt."""
    try:
        import torch  # type: ignore
    except Exception:
        return None
    try:
        if not torch.cuda.is_available():
            return None
        major, minor = torch.cuda.get_device_capability(0)
        return f"{major}.{minor}"
    except Exception:
        return None


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", help="Pfad zum vLLM-Serverlog")
    parser.add_argument(
        "--expect-capability",
        default="12.0",
        help="erwartete Compute-Capability (Default: 12.0)",
    )
    parser.add_argument(
        "--skip-capability",
        action="store_true",
        help="Capability-Pruefung ueberspringen (kein CUDA/torch noetig)",
    )
    args = parser.parse_args(argv)

    try:
        with open(args.log, "r", encoding="utf-8", errors="replace") as handle:
            text = handle.read()
    except OSError as exc:
        print(f"kernel=unknown cap=unknown reason=log-unreadable:{exc.strerror}")
        return EXIT_USAGE

    accepted, reason = evaluate_log(text)
    if not accepted:
        print(f"kernel={reason} cap=unknown reason={reason}")
        return EXIT_REFUSED

    cap = "unknown"
    if not args.skip_capability:
        cap = device_capability() or "unknown"
        if cap != "unknown" and cap != args.expect_capability:
            print(f"kernel={reason} cap={cap} reason=capability-mismatch")
            return EXIT_REFUSED

    print(f"kernel={reason} cap={cap}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
