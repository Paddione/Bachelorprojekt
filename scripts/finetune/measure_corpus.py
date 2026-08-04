#!/usr/bin/env python3
"""scripts/finetune/measure_corpus.py — Token-Laengenverteilung + VRAM-Machbarkeitsmatrix.

Vorbedingung fuer scripts/finetune/train.py (T002587): ohne einen Messbericht unter
`outputs/measure/<korpus>__<modell>.json` verweigert das Trainingsskript den Start. Ein
geratenes `max_seq_length` kuerzte im Vorversuch 45% der Korpuszeilen am Ende — genau dort,
wo bei behavioralem Training das Lernziel steht.

Ablauf:
  1. Jede Korpuszeile (JSONL, `{"messages": [...]}`, TRL-Chat-Format) durch das Chat-Template
     des Modells rendern.
  2. Rendertext tokenisieren und die Laenge messen.
  3. Perzentile (median/p90/p95/p99/max) ausgeben, plus je Kandidatenlaenge Anzahl/Anteil
     der Zeilen, die gekuerzt wuerden.
  4. Eine Machbarkeitsmatrix je Kandidatenmodell aus Gewichtsbedarf (4-bit), Aktivierungen
     bei der jeweiligen Sequenzlaenge und Optimizer-States, gestellt gegen das verfuegbare
     VRAM (per --vram-gb, Default 16 — die Zielmaschine aus dem Vorversuch).

Tokenisierung — bewusste Abweichung von der GPU-Zielumgebung:
  Bevorzugt wird `transformers.AutoTokenizer` (--tokenizer oder --model als HF-ID/Pfad). Ist
  `transformers` nicht installiert (Standardfall in diesem Repo-Worktree/CI, das keine
  ML-Abhaengigkeiten vorhaelt), faellt das Skript auf eine heuristische Schaetzung
  (~4 Zeichen/Token, siehe `_HeuristicTokenizer`) zurueck und meldet das laut auf stderr.
  Das haelt den Vertrag (JSON-Form, Vorbedingungs-Gate) auch ohne GPU-Stack testbar; die
  exakte Tokenzahl fuer einen echten Trainingslauf entsteht erst auf dem GPU-Host mit
  installiertem `transformers`.

Chat-Template — bewusst kein Netzwerkzugriff hier:
  `--template-file <jinja-datei>` rendert ueber eine lokale Jinja2-Vorlage (immer verfuegbar,
  keine schwere Abhaengigkeit). Ohne `--template-file` und mit installiertem `transformers`
  wird `tokenizer.chat_template` verwendet. Fehlen beide, bricht das Skript ab.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

try:
    import jinja2
except ImportError:  # pragma: no cover - jinja2 ist Standard-Repo-Dependency
    jinja2 = None

try:
    from transformers import AutoTokenizer  # type: ignore
    _HAVE_TRANSFORMERS = True
except ImportError:
    AutoTokenizer = None  # type: ignore
    _HAVE_TRANSFORMERS = False

DEFAULT_CANDIDATES = [768, 1024, 1536, 2048, 3072, 3584, 4096, 6144, 8192]

# Grobe Modell-Kennzahlen fuer die Machbarkeitsmatrix. Bewusst vereinfacht (dokumentierter
# Schaetzwert, kein exaktes VRAM-Profiling) — Zweck ist eine Vorabwarnung, nicht ein Beweis.
MODEL_PROFILES = {
    "gemma-2-9b": {"params_b": 9.0, "hidden": 3584, "layers": 42},
    "gemma-2-27b": {"params_b": 27.0, "hidden": 4608, "layers": 46},
    "qwen2.5-7b": {"params_b": 7.0, "hidden": 3584, "layers": 28},
    "qwen2.5-14b": {"params_b": 14.0, "hidden": 5120, "layers": 48},
}
DEFAULT_PROFILE = {"params_b": 9.0, "hidden": 3584, "layers": 42}


class _HeuristicTokenizer:
    """Fallback ohne `transformers`: ~4 Zeichen pro Token (grobe Naeherung fuer westliche
    Sprachen mit BPE-Tokenizern). Nur fuer Vertragstests gedacht, nicht fuer echte
    Trainingsentscheidungen."""

    def encode(self, text: str) -> list:
        return list(range(max(1, len(text) // 4)))


def _load_corpus(path: Path) -> list[dict]:
    rows = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _render_with_template_file(rows: list[dict], template_file: Path) -> list[str]:
    if jinja2 is None:
        raise RuntimeError("jinja2 ist nicht installiert — kann --template-file nicht rendern.")
    env = jinja2.Environment(trim_blocks=True, lstrip_blocks=False)
    template = env.from_string(template_file.read_text(encoding="utf-8"))
    return [
        template.render(messages=row["messages"], add_generation_prompt=False)
        for row in rows
    ]


def _render_with_tokenizer(rows: list[dict], tokenizer) -> list[str]:
    return [
        tokenizer.apply_chat_template(row["messages"], tokenize=False, add_generation_prompt=False)
        for row in rows
    ]


def _get_tokenizer(args):
    if _HAVE_TRANSFORMERS and (args.tokenizer or args.model):
        return AutoTokenizer.from_pretrained(args.tokenizer or args.model), True
    print(
        "WARNUNG: transformers nicht installiert oder kein --tokenizer/--model angegeben — "
        "verwende heuristische Laengenschaetzung (~4 Zeichen/Token).",
        file=sys.stderr,
    )
    return _HeuristicTokenizer(), False


def _feasibility_matrix(candidates: list[int], vram_gb: float) -> dict:
    matrix = {}
    for name, profile in MODEL_PROFILES.items():
        params_b = profile["params_b"]
        hidden = profile["hidden"]
        layers = profile["layers"]
        # 4-bit Gewichte: params * 0.5 Byte/Parameter.
        weight_gb = params_b * 1e9 * 0.5 / 1e9
        per_seq = {}
        for seq_len in candidates:
            # Aktivierungen: grobe Schaetzung ueber Hidden-Size * Layers * Seq-Len * 2 Byte
            # (bf16) * Sicherheitsfaktor 4 fuer Zwischenaktivierungen/Gradienten-Checkpointing.
            activations_gb = (hidden * layers * seq_len * 2 * 4) / 1e9
            # Optimizer-States: LoRA-Adapter sind klein ggue. dem Basismodell — Pauschale.
            optimizer_gb = 0.5
            total_gb = weight_gb + activations_gb + optimizer_gb
            per_seq[str(seq_len)] = {
                "estimated_vram_gb": round(total_gb, 2),
                "fits": total_gb <= vram_gb,
            }
        matrix[name] = {"weight_gb_4bit": round(weight_gb, 2), "by_seq_len": per_seq}
    return matrix


def cmd_check_report(report_path: str) -> int:
    p = Path(report_path)
    if not p.is_file():
        print(f"FEHLER: Messbericht fehlt: {report_path}", file=sys.stderr)
        return 1
    try:
        json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"FEHLER: Messbericht ist kein gueltiges JSON: {exc}", file=sys.stderr)
        return 1
    print(f"OK: Messbericht vorhanden: {report_path}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--corpus", help="Pfad zur JSONL-Korpusdatei ({'messages': [...]})")
    parser.add_argument("--model", help="Modell-Kennung (HF-ID oder Label, geht in den Dateinamen ein)")
    parser.add_argument("--tokenizer", help="Optional: abweichende Tokenizer-Quelle")
    parser.add_argument("--template-file", help="Lokale Jinja2-Chat-Template-Datei (kein Netzwerk noetig)")
    parser.add_argument("--out", help="Zielpfad des JSON-Berichts (Default: outputs/measure/<korpus>__<modell>.json)")
    parser.add_argument("--vram-gb", type=float, default=16.0, help="Verfuegbares VRAM in GB (Default 16)")
    parser.add_argument(
        "--candidates",
        default=",".join(str(c) for c in DEFAULT_CANDIDATES),
        help="Kommagetrennte Kandidatenlaengen",
    )
    parser.add_argument("--check-report", help="Nur pruefen, ob unter diesem Pfad ein Messbericht existiert (Vorbedingungs-Gate)")
    args = parser.parse_args(argv)

    if args.check_report:
        return cmd_check_report(args.check_report)

    if not args.corpus or not args.model:
        parser.error("--corpus und --model sind erforderlich (ausser bei --check-report).")

    corpus_path = Path(args.corpus)
    if not corpus_path.is_file():
        print(f"FEHLER: Korpus nicht gefunden: {args.corpus}", file=sys.stderr)
        return 1

    rows = _load_corpus(corpus_path)
    if not rows:
        print("FEHLER: Korpus ist leer.", file=sys.stderr)
        return 1

    if args.template_file:
        texts = _render_with_template_file(rows, Path(args.template_file))
        tokenizer, used_real = _get_tokenizer(args) if (args.tokenizer or (_HAVE_TRANSFORMERS and args.model)) else (_HeuristicTokenizer(), False)
    else:
        tokenizer, used_real = _get_tokenizer(args)
        if not used_real:
            print("FEHLER: ohne --template-file wird ein echter Tokenizer (transformers) benoetigt.", file=sys.stderr)
            return 1
        texts = _render_with_tokenizer(rows, tokenizer)

    lengths = [len(tokenizer.encode(t)) for t in texts]
    candidates = sorted(int(c) for c in args.candidates.split(","))

    truncation = {}
    for cand in candidates:
        truncated = sum(1 for l in lengths if l > cand)
        truncation[str(cand)] = {
            "truncated_count": truncated,
            "truncated_fraction": round(truncated / len(lengths), 4),
        }

    report = {
        "corpus": args.corpus,
        "model": args.model,
        "row_count": len(rows),
        "tokenizer_source": "transformers" if used_real else "heuristic-4-chars-per-token",
        "lengths": {
            "median": statistics.median(lengths),
            "p90": _percentile(lengths, 0.90),
            "p95": _percentile(lengths, 0.95),
            "p99": _percentile(lengths, 0.99),
            "max": max(lengths),
        },
        "candidates": [
            {"seq_len": cand, **truncation[str(cand)]} for cand in candidates
        ],
        "feasibility": _feasibility_matrix(candidates, args.vram_gb),
    }

    out_path = Path(args.out) if args.out else Path(
        f"outputs/measure/{corpus_path.stem}__{args.model}.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Messbericht geschrieben: {out_path}")
    return 0


def _percentile(values: list[int], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * q
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return float(s[f])
    d0 = s[f] * (c - k)
    d1 = s[c] * (k - f)
    return round(d0 + d1, 2)


if __name__ == "__main__":
    sys.exit(main())
