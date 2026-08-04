#!/usr/bin/env python3
"""scripts/finetune/train.py — einziges parametrisiertes Trainingsskript (T002587).

Loest die drei duplizierten Fassungen aus dem Vorversuch (unsloth_training_setup/train.py,
train_gemma.py, train_qwen.py) ab. Konfiguration ueber CLI-Flags und optional eine
Konfigdatei (--config, JSON), nicht ueber kopierte Skriptvarianten.

Verbindliche Eigenschaften (siehe openspec/changes/unsloth-training-env/tasks.md, Task 2a):

  - Vorbedingungen: bricht ab, wenn der Messbericht aus measure_corpus.py fehlt oder der
    Template-Guard aus template_guard.py nicht bestanden wird.
  - Assistant-only Loss ueber vorab tokenisierte Daten (input_ids + assistant_masks). TRLs
    Collator honoriert `assistant_masks` selbststaendig. Der Weg ueber eine `tools`-Spalte ist
    NICHT gangbar: TRL nimmt Tools nur als globales Argument entgegen, nicht je Zeile — daher
    wird hier im Skript selbst vortokenisiert statt eine Spalte zu setzen.
  - Zeilen ohne Lernsignal (assistant_masks komplett 0) werden nach der Kuerzung verworfen und
    gezaehlt.
  - Der Anteil des Lernsignals wird vor dem ersten Trainingsschritt ausgegeben.
  - Das Hub-Template wird vor dem Speichern zurueckgeschrieben, damit der Adapter nicht das
    Trainings-Template ausliefert.
  - LoRA-Vorgaben nach Unsloth-Primaerdokumentation: Rang 16 oder 32, lora_alpha gleich Rang
    oder doppelter Rang, die sieben Standardmodule, lora_dropout 0, rsLoRA aus.

Schwere Abhaengigkeiten (unsloth, trl, torch, transformers) werden erst beim tatsaechlichen
Trainingsstart importiert — `--dry-run` validiert Vorbedingungen und die aufgeloeste
Konfiguration ohne sie und laeuft daher auch in Umgebungen ohne GPU-Stack (z.B. diesem
Repo-Worktree/CI).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

STANDARD_LORA_MODULES = [
    "q_proj", "k_proj", "v_proj", "o_proj",
    "gate_proj", "up_proj", "down_proj",
]

SCRIPT_DIR = Path(__file__).resolve().parent


def _load_config(path: str | None) -> dict:
    if not path:
        return {}
    p = Path(path)
    if not p.is_file():
        raise SystemExit(f"FEHLER: --config nicht gefunden: {path}")
    return json.loads(p.read_text(encoding="utf-8"))


def _merged_args(args: argparse.Namespace, config: dict) -> dict:
    """CLI-Flags gewinnen ueber die Konfigdatei; die Konfigdatei liefert nur Defaults."""
    merged = dict(config)
    for key, value in vars(args).items():
        if value is not None:
            merged[key] = value
    return merged


def check_measure_report(report_path: str) -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "measure_corpus.py"), "--check-report", report_path],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr or result.stdout)
        raise SystemExit("FEHLER: Vorbedingung 'Messbericht' nicht erfuellt — erst scripts/finetune/measure_corpus.py ausfuehren.")


def check_template_guard(hub_template: str, patched_template: str, corpus: str) -> None:
    result = subprocess.run(
        [
            sys.executable, str(SCRIPT_DIR / "template_guard.py"),
            "--hub-template", hub_template,
            "--patched-template", patched_template,
            "--corpus", corpus,
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr or result.stdout)
        raise SystemExit("FEHLER: Vorbedingung 'Template-Guard' nicht erfuellt.")


def validate_lora_config(r: int, alpha: int, dropout: float, use_rslora: bool) -> None:
    if r not in (16, 32):
        raise SystemExit(f"FEHLER: --lora-r muss 16 oder 32 sein, war {r}.")
    if alpha not in (r, 2 * r):
        raise SystemExit(f"FEHLER: --lora-alpha muss {r} oder {2 * r} sein (Rang oder doppelter Rang), war {alpha}.")
    if dropout != 0:
        raise SystemExit(f"FEHLER: --lora-dropout muss 0 sein (Unsloth-Vorgabe), war {dropout}.")
    if use_rslora:
        raise SystemExit("FEHLER: rsLoRA muss aus sein (Unsloth-Vorgabe).")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--corpus", help="JSONL-Korpus ({'messages': [...]})")
    parser.add_argument("--model", help="Basismodell (HF-ID, z.B. unsloth/gemma-2-9b-bnb-4bit)")
    parser.add_argument("--measure-report", help="Pfad zum Messbericht aus measure_corpus.py")
    parser.add_argument("--hub-template", help="Lokale Datei mit dem HUB-Chat-Template")
    parser.add_argument("--patched-template", help="Lokale Datei mit dem tatsaechlich zu verwendenden Template")
    parser.add_argument("--max-seq-length", type=int, help="Aus dem Messbericht gewaehlte Sequenzlaenge")
    parser.add_argument("--output-dir", default="outputs/train", help="Zielverzeichnis fuer Checkpoints und Adapter")
    parser.add_argument("--lora-r", type=int, default=16, help="LoRA-Rang: 16 oder 32")
    parser.add_argument("--lora-alpha", type=int, help="Default: gleich --lora-r")
    parser.add_argument("--lora-dropout", type=float, default=0.0)
    parser.add_argument("--use-rslora", action="store_true", help="MUSS aus bleiben (Default False) — Flag existiert nur fuer die Validierung, nicht zum Aktivieren")
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--max-steps", type=int, default=60)
    parser.add_argument("--config", help="Optionale JSON-Konfigdatei; CLI-Flags ueberschreiben sie")
    parser.add_argument("--dry-run", action="store_true", help="Nur Vorbedingungen + Konfiguration pruefen, kein Import von unsloth/trl/torch")
    return parser


def resolve_config(argv=None) -> dict:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    config = _load_config(args.config)
    merged = _merged_args(args, config)

    for required in ("corpus", "model", "measure_report"):
        if not merged.get(required):
            raise SystemExit(f"FEHLER: --{required.replace('_', '-')} ist erforderlich (CLI oder --config).")

    merged.setdefault("lora_alpha", merged["lora_r"])
    return merged


def tokenize_row_with_assistant_mask(tokenizer, messages: list[dict], max_seq_length: int) -> dict | None:
    """Vortokenisiert eine Zeile mit input_ids + assistant_masks statt einer 'tools'-Spalte.

    TRL nimmt `tools` nur als globales SFTConfig-Argument entgegen, nicht je Zeile — der
    einzige gangbare Weg fuer assistant-only Loss ist, hier selbst zu tokenisieren und
    `assistant_masks` mitzuliefern; TRLs Collator honoriert das Feld selbststaendig.
    Gibt None zurueck, wenn die Zeile nach Kuerzung kein Lernsignal (assistant-Token) mehr hat.
    """
    encoded = tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=False,
        return_dict=True,
        return_assistant_tokens_mask=True,
        max_length=max_seq_length,
        truncation=True,
    )
    input_ids = encoded["input_ids"]
    assistant_masks = encoded.get("assistant_masks")
    if assistant_masks is None or sum(assistant_masks) == 0:
        return None
    return {"input_ids": input_ids, "assistant_masks": assistant_masks}


def run_training(config: dict) -> int:
    # Schwere Abhaengigkeiten erst hier importieren (siehe Modul-Docstring).
    import torch
    from unsloth import FastLanguageModel
    from trl import SFTConfig, SFTTrainer

    check_measure_report(config["measure_report"])
    if config.get("hub_template") and config.get("patched_template"):
        check_template_guard(config["hub_template"], config["patched_template"], config["corpus"])

    validate_lora_config(config["lora_r"], config["lora_alpha"], config["lora_dropout"], config.get("use_rslora", False))

    max_seq_length = config.get("max_seq_length") or 2048

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=config["model"],
        max_seq_length=max_seq_length,
        dtype=None,
        load_in_4bit=True,
    )

    if config.get("hub_template"):
        tokenizer.chat_template = Path(config["hub_template"]).read_text(encoding="utf-8")
    if config.get("patched_template"):
        train_template = Path(config["patched_template"]).read_text(encoding="utf-8")
    else:
        train_template = tokenizer.chat_template
    tokenizer.chat_template = train_template

    model = FastLanguageModel.get_peft_model(
        model,
        r=config["lora_r"],
        target_modules=STANDARD_LORA_MODULES,
        lora_alpha=config["lora_alpha"],
        lora_dropout=config["lora_dropout"],
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=3407,
        use_rslora=False,
        loftq_config=None,
    )

    rows = []
    with open(config["corpus"], "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    tokenized = []
    dropped = 0
    for row in rows:
        item = tokenize_row_with_assistant_mask(tokenizer, row["messages"], max_seq_length)
        if item is None:
            dropped += 1
        else:
            tokenized.append(item)

    if not tokenized:
        raise SystemExit("FEHLER: kein Korpuszeile mit Lernsignal nach Kuerzung uebrig.")

    total_tokens = sum(len(t["input_ids"]) for t in tokenized)
    signal_tokens = sum(sum(t["assistant_masks"]) for t in tokenized)
    signal_fraction = signal_tokens / total_tokens if total_tokens else 0.0
    print(f"Zeilen ohne Lernsignal verworfen: {dropped}/{len(rows)}")
    print(f"Anteil des Lernsignals (assistant-Tokens / Gesamt-Tokens): {signal_fraction:.4f}")

    from datasets import Dataset
    dataset = Dataset.from_list(tokenized)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        max_seq_length=max_seq_length,
        args=SFTConfig(
            per_device_train_batch_size=1,
            gradient_accumulation_steps=8,
            warmup_steps=5,
            max_steps=config["max_steps"],
            learning_rate=config["learning_rate"],
            fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(),
            logging_steps=1,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="linear",
            seed=3407,
            output_dir=config["output_dir"],
            report_to="none",
        ),
    )

    print("Starte Training...")
    stats = trainer.train()
    print(f"Training abgeschlossen: {stats}")

    # Hub-Template vor dem Speichern zurueckschreiben, damit der Adapter nicht das
    # Trainings-Template ausliefert.
    if config.get("hub_template"):
        tokenizer.chat_template = Path(config["hub_template"]).read_text(encoding="utf-8")

    out_dir = Path(config["output_dir"]) / "adapter"
    model.save_pretrained(str(out_dir))
    tokenizer.save_pretrained(str(out_dir))
    print(f"Adapter gespeichert: {out_dir}")
    return 0


def main(argv=None) -> int:
    config = resolve_config(argv)

    check_measure_report(config["measure_report"])
    if config.get("hub_template") and config.get("patched_template"):
        check_template_guard(config["hub_template"], config["patched_template"], config["corpus"])
    validate_lora_config(config["lora_r"], config["lora_alpha"], config["lora_dropout"], config.get("use_rslora", False))

    if config.get("dry_run"):
        print("OK (dry-run): Vorbedingungen erfuellt, Konfiguration gueltig.")
        print(json.dumps(config, indent=2, default=str))
        return 0

    return run_training(config)


if __name__ == "__main__":
    sys.exit(main())
