#!/usr/bin/env python3
"""scripts/finetune/export_gguf.py — GGUF-Export mit Template-Korrektur (T002587).

Merged den LoRA-Adapter, schreibt das HUB-Chat-Template zurueck und exportiert nach GGUF.
Prueft vorher den freien Systemspeicher gegen den fp16-Bedarf des Modells und bricht mit
klarer Meldung ab, statt in den Swap zu laufen — auf der Zielmaschine ist der WSL-Speicher
gedeckelt und deutlich knapper als der Host-Speicher.

Der erzeugte GGUF-Pfad ist so benannt, dass `llm-proxy` ihn als benannten Slot aufnehmen
kann: `<output-dir>/<slot-name>.gguf`. Die Slot-Registrierung selbst bleibt manuell (siehe
scripts/finetune/README.md) — der automatische Austausch eines laufenden Factory-Slots
gehoert nicht in einen Trainingslauf.

Schwere Abhaengigkeiten (unsloth, torch) werden erst beim tatsaechlichen Export importiert,
damit `--dry-run` (nur Speichercheck + Pfadaufloesung) auch ohne GPU-Stack laeuft.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

# grobe Modell-zu-Groessen-Zuordnung (Milliarden Parameter) fuer den fp16-Speichercheck.
# Bewusst vereinfacht wie in measure_corpus.MODEL_PROFILES — Zweck ist eine Vorabwarnung.
PARAMS_BILLION_BY_LABEL = {
    "gemma-2-9b": 9.0,
    "gemma-2-27b": 27.0,
    "qwen2.5-7b": 7.0,
    "qwen2.5-14b": 14.0,
}
DEFAULT_PARAMS_BILLION = 9.0
BYTES_PER_PARAM_FP16 = 2
SAFETY_FACTOR = 1.3  # Puffer fuer Merge-Zwischenzustand + GGUF-Konvertierung


def _free_ram_gb() -> float:
    try:
        import psutil  # type: ignore
        return psutil.virtual_memory().available / 1e9
    except ImportError:
        # Fallback ueber /proc/meminfo (Linux/WSL — die dokumentierte Zielplattform).
        meminfo = Path("/proc/meminfo")
        if not meminfo.is_file():
            raise SystemExit("FEHLER: weder psutil noch /proc/meminfo verfuegbar — Speichercheck nicht moeglich.")
        available_kb = None
        for line in meminfo.read_text(encoding="utf-8").splitlines():
            if line.startswith("MemAvailable:"):
                available_kb = int(line.split()[1])
                break
        if available_kb is None:
            raise SystemExit("FEHLER: MemAvailable nicht in /proc/meminfo gefunden.")
        return available_kb / 1e6


def check_memory(model_label: str, params_billion: float | None) -> float:
    params_b = params_billion or PARAMS_BILLION_BY_LABEL.get(model_label, DEFAULT_PARAMS_BILLION)
    required_gb = params_b * 1e9 * BYTES_PER_PARAM_FP16 / 1e9 * SAFETY_FACTOR
    free_gb = _free_ram_gb()
    if free_gb < required_gb:
        raise SystemExit(
            f"FEHLER: freier Speicher ({free_gb:.1f} GB) reicht nicht fuer den fp16-Merge "
            f"({required_gb:.1f} GB benoetigt, Modell ~{params_b}B Parameter, "
            f"Sicherheitsfaktor {SAFETY_FACTOR}). Abbruch statt Swap-Anlauf."
        )
    print(f"OK: freier Speicher {free_gb:.1f} GB >= benoetigt {required_gb:.1f} GB.")
    return free_gb


def resolve_output_path(output_dir: str, slot_name: str) -> Path:
    return Path(output_dir) / f"{slot_name}.gguf"


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--adapter-dir", help="Verzeichnis mit dem gespeicherten LoRA-Adapter (aus train.py)")
    parser.add_argument("--hub-template", help="Lokale Datei mit dem HUB-Chat-Template, wird vor dem Export zurueckgeschrieben")
    parser.add_argument("--model-label", default="gemma-2-9b", help="Label fuer die Speicherschaetzung (siehe PARAMS_BILLION_BY_LABEL)")
    parser.add_argument("--params-billion", type=float, help="Explizite Parametergroesse in Milliarden statt --model-label")
    parser.add_argument("--output-dir", default="outputs/export", help="Zielverzeichnis fuer die GGUF-Datei")
    parser.add_argument("--slot-name", required=True, help="Slot-Name, unter dem llm-proxy die Datei aufnehmen soll")
    parser.add_argument("--quantization", default="q4_k_m", help="GGUF-Quantisierungsmethode (Default q4_k_m)")
    parser.add_argument("--dry-run", action="store_true", help="Nur Speichercheck + Pfadaufloesung, kein Import von unsloth/torch")
    return parser


def run_export(args: argparse.Namespace) -> int:
    from unsloth import FastLanguageModel

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.adapter_dir,
        max_seq_length=8192,
        dtype=None,
        load_in_4bit=True,
    )

    if args.hub_template:
        tokenizer.chat_template = Path(args.hub_template).read_text(encoding="utf-8")

    out_path = resolve_output_path(args.output_dir, args.slot_name)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Merge + GGUF-Export ({args.quantization}) nach {out_path} ...")
    model.save_pretrained_gguf(
        str(out_path.parent),
        tokenizer,
        quantization_method=args.quantization,
    )

    # Unsloth benennt die Ausgabedatei nach dem Basismodell — auf den erwarteten Slot-Namen
    # umbenennen, damit llm-proxy sie eindeutig findet.
    candidates = sorted(out_path.parent.glob("*.gguf"))
    if candidates and not out_path.exists():
        shutil.move(str(candidates[-1]), str(out_path))

    print(f"GGUF-Export abgeschlossen: {out_path}")
    print("Slot-Registrierung ist manuell — siehe scripts/finetune/README.md.")
    return 0


def main(argv=None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    check_memory(args.model_label, args.params_billion)
    out_path = resolve_output_path(args.output_dir, args.slot_name)

    if args.dry_run:
        print(f"OK (dry-run): Zielpfad {out_path}")
        return 0

    if not args.adapter_dir:
        raise SystemExit("FEHLER: --adapter-dir ist fuer einen echten Export erforderlich.")

    return run_export(args)


if __name__ == "__main__":
    sys.exit(main())
