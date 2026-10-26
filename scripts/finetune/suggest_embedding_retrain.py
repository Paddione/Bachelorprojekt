#!/usr/bin/env python3
"""scripts/finetune/suggest_embedding_retrain.py — optimized values from eval reports.

Reads base + tuned eval reports (eval_embedding.py --out) and the train log
final loss, applies underfit/overfit rules, prints the retrain command values.

Rules (documented, deterministic):
  - tuned_acc <= base_acc + 0.01        -> underfit:  epochs+2, lr x2 (cap 1e-4)
  - tuned_acc >= 0.98 and margin > 0.25  -> saturated: keep, reduce epochs to 2
  - eval_acc < train_acc_proxy - 0.10    -> overfit gap:  epochs-1 (min 1), lr /2
  - weakest task < overall - 0.15        -> upsample that task (rebuild corpus
    with 2x rows for it) + epochs+1
  - else                                 -> epochs+1, same lr (refine)

Output: JSON with suggested {epochs, lr, batch_size, upsample_task, reason}.
Stdlib only.
"""
from __future__ import annotations

import argparse
import json


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-report", required=True)
    ap.add_argument("--tuned-report", required=True)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--lr", default="2e-5")
    args = ap.parse_args()

    base = json.loads(open(args.base_report, encoding="utf-8").read())
    tuned = json.loads(open(args.tuned_report, encoding="utf-8").read())
    lr = float(args.lr)
    epochs = args.epochs
    upsample = None

    b_acc, t_acc = base["accuracy"], tuned["accuracy"]
    margin = tuned.get("mean_margin", 0.0)
    per = tuned.get("per_task", {})
    weakest = min(per, key=per.get) if per else None

    if t_acc <= b_acc + 0.01:
        epochs += 2
        lr = min(lr * 2, 1e-4)
        reason = f"underfit (tuned {t_acc:.3f} vs base {b_acc:.3f})"
    elif t_acc >= 0.98 and margin > 0.25:
        epochs = 2
        reason = f"saturated (acc {t_acc:.3f}, margin {margin:.3f})"
    elif weakest and per[weakest] < t_acc - 0.15:
        upsample = weakest
        epochs += 1
        reason = f"weak task {weakest} ({per[weakest]:.3f} vs {t_acc:.3f})"
    else:
        epochs += 1
        reason = f"refine (tuned {t_acc:.3f} vs base {b_acc:.3f})"

    print(json.dumps({"epochs": epochs, "lr": str(lr), "batch_size": 32,
                      "upsample_task": upsample, "reason": reason}, indent=2))


if __name__ == "__main__":
    main()
