"""MTP-Akzeptanz-Gate: Decode-Durchsatz messen (Akzeptanz-Proxy).

Post-Training-Regel: Der feingetunte GGUF muss auf dem Rollen-Promptset mit
IDENTISCHEN Serve-Flags mindestens den Decode-Durchsatz des Basismodells
erreichen. Sinkt er, ist die MTP-Akzeptanz weg (LoRA-Verschiebung gegen den
eingefrorenen MTP-Head) — Gegenmassnahmen siehe README.

Usage:
  python mtp_bench.py --gguf <pfad.gguf> [--bin llama-server] [--label base]
                      [--ngl 999] [--extra-args "--spec-type draft-mtp ..."]
  python mtp_bench.py --compare base.json tuned.json
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import subprocess
import time
import urllib.request
from pathlib import Path

DEFAULT_PROMPTS = [
    "Pruefe den Cluster-Status und gib das Ergebnis als JSON zurueck.",
    "Oeffne die Datei src/config.py und ergaenze den fehlenden Import.",
    "Berechne aus dem Ticket T900930 die naechsten drei Plan-Schritte.",
    "Dispatche den Task health mit den Parametern ENV=mentolder.",
    "Korrigiere den Bash-Fehler in deploy.sh und beschreibe die Aenderung.",
    "Fasse die Worker-Ergebnisse zusammen und markiere abgeschlossene Schritte.",
    "Erstelle einen Plan fuer die Migration mit Verifikationsschritten.",
    "Antworte nur mit dem Exit-Code des letzten Befehls.",
]


def wait_health(port: int, timeout_s: int = 180) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as r:
                if json.loads(r.read()).get("status") == "ok":
                    return
        except Exception:  # noqa: BLE001
            time.sleep(2)
    raise TimeoutError("llama-server health timeout")


def measure(port: int, prompts: list[str], max_tokens: int) -> tuple[list[float], list[dict]]:
    rates: list[float] = []
    rows: list[dict] = []
    for p in prompts:
        body = json.dumps(
            {"messages": [{"role": "user", "content": p}], "max_tokens": max_tokens,
             "temperature": 0}
        ).encode()
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/v1/chat/completions", data=body,
            headers={"Content-Type": "application/json"})
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=600) as r:
            out = json.loads(r.read())
        dt = time.time() - t0
        timings = out.get("timings") or {}
        rate = timings.get("predicted_per_second")
        if rate is None:  # Fallback: Tokens / gemessene Zeit
            rate = (out.get("usage", {}).get("completion_tokens") or 0) / dt
        rates.append(float(rate))
        rows.append({"prompt": p[:60], "tok_s": round(float(rate), 1)})
    return rates, rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gguf", type=Path)
    ap.add_argument("--bin", default=str(Path.home() / "opt/llama-current/bin/llama-server"))
    ap.add_argument("--label", default="run")
    ap.add_argument("--port", type=int, default=19222)
    ap.add_argument("--ngl", default=None, help="z.B. 999 (GPU) oder 0 (CPU-Smoke)")
    ap.add_argument("--extra-args", default="", help="z.B. '--spec-type draft-mtp --spec-draft-n-max 4'")
    ap.add_argument("--max-tokens", type=int, default=96)
    ap.add_argument("--prompts-file", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--compare", nargs=2, metavar=("BASE", "TUNED"))
    args = ap.parse_args()

    if args.compare:
        b = json.loads(Path(args.compare[0]).read_text())
        t = json.loads(Path(args.compare[1]).read_text())
        delta = (t["tok_s_median"] / b["tok_s_median"] - 1) * 100
        verdict = "OK" if delta >= -5 else "MTP-AKZEPTANZ-GATE FEHLSCHLAG"
        print(f"{b['label']}: {b['tok_s_median']} tok/s | {t['label']}: {t['tok_s_median']} tok/s "
              f"| Delta {delta:+.1f}% -> {verdict}")
        return 0 if delta >= -5 else 1

    prompts = (args.prompts_file.read_text().splitlines() if args.prompts_file
               else DEFAULT_PROMPTS)
    extra = args.extra_args.split() if args.extra_args else []
    ngl = ["-ngl", args.ngl] if args.ngl is not None else []

    log_path = Path(f"/tmp/mtp-bench-{args.port}.log")
    proc = subprocess.Popen(
        [args.bin, "-m", str(args.gguf), "--host", "127.0.0.1",
         "--port", str(args.port), *ngl, *extra],
        stdout=open(log_path, "w"), stderr=subprocess.STDOUT)
    try:
        wait_health(args.port)
        rates, rows = measure(args.port, prompts, args.max_tokens)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()

    log = log_path.read_text(errors="replace")
    accepts = re.findall(r"accept\w*[^0-9]{0,6}([0-9.]+)", log, re.I)
    log_path.unlink(missing_ok=True)

    report = {
        "label": args.label, "gguf": str(args.gguf),
        "tok_s_median": round(statistics.median(rates), 1) if rates else None,
        "tok_s_mean": round(statistics.mean(rates), 1) if rates else None,
        "n_requests": len(rates), "per_prompt": rows,
        "acceptance_from_log": accepts[-3:] if accepts else None,
    }
    out = args.out or Path(f"/tmp/mtp-bench-{args.label}.json")
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps({k: report[k] for k in ("label", "tok_s_median", "n_requests",
                                             "acceptance_from_log")}, ensure_ascii=False))
    print(f"report: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
