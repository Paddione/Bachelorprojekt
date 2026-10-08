#!/usr/bin/env python3
"""scripts/finetune/train.py — einziges parametrisiertes Trainingsskript (T002587).

Loest die drei duplizierten Fassungen aus dem Vorversuch (unsloth_training_setup/train.py,
train_gemma.py, train_qwen.py) ab. Konfiguration ueber CLI-Flags und optional eine
Konfigdatei (--config, JSON), nicht ueber kopierte Skriptvarianten.


  - Vorbedingungen: bricht ab, wenn der Messbericht aus measure_corpus.py fehlt oder der
    Template-Guard aus template_guard.py nicht bestanden wird.
  - Assistant-only Loss ueber vorab tokenisierte Daten (input_ids + attention_mask + labels
    mit -100 ausserhalb der Assistant-Spanne). Der Weg ueber eine `tools`-Spalte ist
    NICHT gangbar: TRL nimmt Tools nur als globales Argument entgegen, nicht je Zeile — daher
    wird hier im Skript selbst vortokenisiert statt eine Spalte zu setzen.
  - Zeilen ohne Lernsignal (kein Assistant-Token) werden nach der Kuerzung verworfen und
    gezaehlt.
  - Der Anteil des Lernsignals wird vor dem ersten Trainingsschritt ausgegeben.
  - Das Hub-Template wird vor dem Speichern zurueckgeschrieben, damit der Adapter nicht das
    Trainings-Template ausliefert.
  - Qwen3.5 uses 16-bit LoRA by default; other supported models use 4-bit QLoRA.
    Model splitting across GPUs is opt-in and does not combine physical VRAM.

Schwere Abhaengigkeiten (unsloth, trl, torch, transformers) werden erst beim tatsaechlichen
Trainingsstart importiert — `--dry-run` validiert Vorbedingungen und die aufgeloeste
Konfiguration ohne sie und laeuft daher auch in Umgebungen ohne GPU-Stack (z.B. diesem
Repo-Worktree/CI).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from langfuse_tracking import TrainingRun

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


def check_training_inputs(config: dict) -> None:
    check_measure_report(config["measure_report"])
    report = json.loads(Path(config["measure_report"]).read_text(encoding="utf-8"))
    if report.get("tokenizer_source") != "transformers":
        raise SystemExit("FEHLER: Trainingslauf braucht einen Messbericht mit echtem Modell-Tokenizer; Heuristik ist nur fuer Vorpruefung.")
    if not config.get("max_seq_length"):
        raise SystemExit("FEHLER: --max-seq-length aus dem Messbericht explizit waehlen; kein geratenes 2048-Default.")
    if not Path(config["corpus"]).is_file():
        raise SystemExit(f"FEHLER: Korpus fehlt: {config['corpus']}")
    if config.get("patched_template") and not config.get("hub_template"):
        raise SystemExit("FEHLER: --patched-template braucht --hub-template fuer den Template-Guard.")
    if config.get("hub_template") and config.get("patched_template"):
        check_template_guard(config["hub_template"], config["patched_template"], config["corpus"])


def validate_lora_config(r: int, alpha: int, dropout: float) -> None:
    if r <= 0 or alpha <= 0:
        raise SystemExit("FEHLER: LoRA-Rang und Alpha muessen positiv sein.")
    if not 0 <= dropout < 1:
        raise SystemExit("FEHLER: --lora-dropout muss im Bereich [0, 1) liegen.")


def resolve_training_mode(config: dict) -> dict:
    """Resolve model-specific precision before loading heavyweight GPU libraries."""
    model = config["model"].lower()
    model_path = Path(config["model"])
    if model_path.is_dir() and (model_path / "config.json").is_file():
        model_config = json.loads((model_path / "config.json").read_text(encoding="utf-8"))
        if model_config.get("model_type") == "qwen3_vl":
            raise SystemExit("FEHLER: Qwen3-VL braucht train_vision.py mit Bild-Daten und UnslothVisionDataCollator.")
    if "qwen3-vl" in model or "qwen3_vl" in model:
        raise SystemExit("FEHLER: Qwen3-VL braucht train_vision.py mit Bild-Daten und UnslothVisionDataCollator.")
    qwen35 = "qwen3.5" in model or "qwen3_5" in model
    bnb = "bnb-4bit" in model or "bnb_4bit" in model
    precision = config.get("precision") or "auto"
    if precision == "auto":
        precision = "16bit" if qwen35 else "4bit"
    if qwen35 and precision == "4bit" and not config.get("allow_qwen35_4bit"):
        raise SystemExit("FEHLER: Qwen3.5 QLoRA wird von Unsloth nicht empfohlen; 16bit-LoRA waehlen oder --allow-qwen35-4bit bewusst setzen.")
    if bnb and precision == "16bit":
        raise SystemExit("FEHLER: ein bnb-4bit-Repo ist kein 16bit-Basismodell; unquantisierte HF-ID waehlen.")
    if config.get("gpu_mode") == "balanced" and os.environ.get("WORLD_SIZE", "1") != "1":
        raise SystemExit("FEHLER: balanced Model-Splitting nicht mit DDP/torchrun kombinieren.")
    return {"precision": precision, "qwen35": qwen35, "gpu_mode": config.get("gpu_mode") or "single"}


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--corpus", help="JSONL-Korpus ({'messages': [...]})")
    parser.add_argument("--model", help="Basismodell (HF-ID, z.B. unsloth/gemma-2-9b-bnb-4bit)")
    parser.add_argument("--precision", choices=("auto", "4bit", "16bit"), help="auto: Qwen3.5=16bit, sonst 4bit")
    parser.add_argument("--allow-qwen35-4bit", action="store_true", default=None, help="Qwen3.5 QLoRA trotz Upstream-Warnung erlauben")
    parser.add_argument("--gpu-mode", choices=("single", "balanced"), help="balanced: Modell ueber mehrere GPUs verteilen (experimentell)")
    parser.add_argument("--measure-report", help="Pfad zum Messbericht aus measure_corpus.py")
    parser.add_argument("--hub-template", help="Lokale Datei mit dem HUB-Chat-Template")
    parser.add_argument("--patched-template", help="Lokale Datei mit dem tatsaechlich zu verwendenden Template")
    parser.add_argument("--max-seq-length", type=int, help="Aus dem Messbericht gewaehlte Sequenzlaenge")
    parser.add_argument("--eval-corpus", help="Separater JSONL-Korpus fuer Validierungsverlust")
    parser.add_argument("--hub-model-id", help="Adapter nach HF Hub pushen (bei ephemeral Jobs erforderlich)")
    parser.add_argument("--report-to", choices=("none", "trackio"), help="Trainer-Monitoring")
    parser.add_argument("--output-dir", help="Zielverzeichnis fuer Checkpoints und Adapter")
    parser.add_argument("--lora-r", type=int, help="LoRA-Rang (Default 16)")
    parser.add_argument("--lora-alpha", type=int, help="Default: gleich --lora-r")
    parser.add_argument("--lora-dropout", type=float)
    parser.add_argument("--use-rslora", action="store_true", default=None, help="rank-stabilized LoRA (nur mit geeignetem Rang verwenden)")
    parser.add_argument("--learning-rate", type=float)
    parser.add_argument("--max-steps", type=int)
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

    merged.setdefault("lora_r", 16)
    merged.setdefault("lora_alpha", merged["lora_r"])
    merged.setdefault("lora_dropout", 0.0)
    merged.setdefault("learning_rate", 2e-4)
    merged.setdefault("max_steps", 60)
    merged.setdefault("output_dir", str(SCRIPT_DIR / "outputs" / "train"))
    merged.update(resolve_training_mode(merged))
    if merged.get("max_seq_length") is not None and merged["max_seq_length"] <= 0:
        raise SystemExit("FEHLER: --max-seq-length muss positiv sein.")
    return merged


def tokenize_row_with_assistant_mask(tokenizer, messages: list[dict], max_seq_length: int) -> dict | None:
    """Vortokenisiert eine Zeile mit input_ids + attention_mask + labels (assistant-only).

    TRL nimmt `tools` nur als globales SFTConfig-Argument entgegen, nicht je Zeile — der
    einzige gangbare Weg fuer assistant-only Loss ist, hier selbst zu tokenisieren und
    labels (-100 ausserhalb der Assistant-Spanne) zu materialisieren; TRLs Collator padden
    Gibt None zurueck, wenn die Zeile nach Kuerzung kein Lernsignal (assistant-Token) mehr hat.
    """
    # Notebook-Paritaet: transformers>=5.2 erwartet Block-Content
    # ([{"type": "text", ...}]) — String-Content normalisieren, sonst bricht
    # der multimodale Processor-Pfad mit `string indices must be integers` ab.
    norm = [
        m if isinstance(m.get("content"), list)
        else {**m, "content": [{"type": "text", "text": m.get("content") or ""}]}
        for m in messages
    ]
    encoded = tokenizer.apply_chat_template(
        norm,
        tokenize=True,
        add_generation_prompt=False,
        return_dict=True,
        return_assistant_tokens_mask=True,
        max_length=max_seq_length,
        truncation=True,
    )
    input_ids = encoded["input_ids"]
    # Unsloth's tokenizer liefert gebatchte Ausgabe ([[ids]]) — Single-Batch
    # rekursiv unpacken (einzelne Sequenz kann keine Liste als Element haben).
    while len(input_ids) == 1 and isinstance(input_ids[0], list):
        input_ids = input_ids[0]
    assistant_masks = encoded.get("assistant_masks")
    if assistant_masks is None:
        return None
    # Gebatchte Masken ([[m ...]]) ebenfalls unpacken, wenn die innere Liste
    # die volle Sequenz abdeckt; sonst als Segmentliste vollstaendig flachklopfen
    # (beliebig tief verschachtelt).
    if (
        len(assistant_masks) == 1
        and isinstance(assistant_masks[0], list)
        and len(assistant_masks[0]) == len(input_ids)
    ):
        assistant_masks = assistant_masks[0]
    # Unsloth/transformers-v5 may return nested masks per assistant segment
    # (e.g. reasoning spans) — flatten one level before summing.
    def _flat(xs):
        for x in xs:
            if isinstance(x, list):
                yield from _flat(x)
            else:
                yield x

    flat = list(_flat(assistant_masks))
    # Laengen-Mismatch oder Rest-Verschachtelung (z.B. zip-Trucierung) wuerde
    # still falsche Labels erzeugen — solche Zeilen zaehlen als ohne Lernsignal.
    if (
        len(flat) != len(input_ids)
        or any(isinstance(x, list) for x in input_ids)
        or sum(flat) == 0
    ):
        return None
    labels = [tok if m else -100 for tok, m in zip(input_ids, flat)]
    return {"input_ids": input_ids, "attention_mask": [1] * len(input_ids), "labels": labels}


def run_training(config: dict, tracking: TrainingRun) -> int:
    # Schwere Abhaengigkeiten erst hier importieren (siehe Modul-Docstring).
    import torch
    from unsloth import FastLanguageModel
    from trl import SFTConfig, SFTTrainer

    validate_lora_config(config["lora_r"], config["lora_alpha"], config["lora_dropout"])

    max_seq_length = config["max_seq_length"]
    if not torch.cuda.is_available():
        raise SystemExit("FEHLER: keine CUDA-GPU sichtbar. CUDA_VISIBLE_DEVICES und PyTorch pruefen.")
    if config["gpu_mode"] == "balanced" and torch.cuda.device_count() < 2:
        raise SystemExit("FEHLER: balanced braucht mindestens zwei sichtbare CUDA-GPUs.")
    tracking.record_gpu(torch)
    for index in range(torch.cuda.device_count()):
        props = torch.cuda.get_device_properties(index)
        print(f"CUDA {index}: {props.name}, {props.total_memory / 2**30:.1f} GiB")

    load_kwargs = {"load_in_4bit": config["precision"] == "4bit"}
    if config["precision"] == "16bit":
        load_kwargs["load_in_16bit"] = True
    if config["gpu_mode"] == "balanced":
        load_kwargs["device_map"] = "balanced"

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=config["model"],
        max_seq_length=max_seq_length,
        dtype=None,
        **load_kwargs,
    )
    # Qwen3.5 kommt als VL-Processor (ohne .pad): Text-only-SFT nutzt den inneren
    # Tokenizer — sonst schaltet Unsloth auf _is_vlm und ersetzt unseren
    # TRL-Collator durch transformers' LM-Collator (labels futsch, Eval-Crash).
    # Dieselbe Bedingung wie in UnslothSFTTrainer (pad-Abfrage).
    if not hasattr(tokenizer, "pad") and hasattr(tokenizer, "tokenizer"):
        tokenizer = tokenizer.tokenizer

    if config.get("hub_template"):
        tokenizer.chat_template = Path(config["hub_template"]).read_text(encoding="utf-8")
    if config.get("patched_template"):
        train_template = Path(config["patched_template"]).read_text(encoding="utf-8")
    else:
        train_template = tokenizer.chat_template
    if not train_template or not re.search(r"{%[-\s]*generation\b", train_template):
        raise SystemExit("FEHLER: Chat-Template ohne {% generation %}-Marker kann keine Assistant-Maske liefern. --patched-template bereitstellen und Template-Guard ausfuehren.")
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
        use_rslora=config.get("use_rslora", False),
        loftq_config=None,
    )
    # Notebook-Paritaet (Qwen3.5-SFT/GRPO): explizit in den Trainingsmodus
    # schalten — ohne for_training bleiben Inferenz-Pfade aktiv.
    FastLanguageModel.for_training(model)

    # Unsloth-Warnung "does not accept `num_items_in_batch`": stammt aus dem
    # Eval-Pfad (prediction_step uebergibt nie einen Zaehler; Eval akkumuliert
    # nicht). Der Trainings-Pfad ist korrekt: Unsloths Qwen3.5-Forward
    # (unsloth_compiled_module_qwen3_5) faden den Zaehler in fused CE ein —
    # verifiziert 2026-10-08. Exakt diese eine Meldung filtern, sonst nichts.
    # Filter sitzt auf dem emittierenden Logger — Root-Filter greifen bei
    # propagierten Records nicht.
    import logging as _logging


    class _DropStaleNumItemsWarning(_logging.Filter):
        def filter(self, record):
            return "does not accept `num_items_in_batch`" not in record.getMessage()

    _logging.getLogger("unsloth_zoo.log").addFilter(_DropStaleNumItemsWarning())

    rows = []
    with open(config["corpus"], "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    tokenized, dropped = tokenize_corpus(tokenizer, rows, max_seq_length)

    if not tokenized:
        raise SystemExit("FEHLER: kein Korpuszeile mit Lernsignal nach Kuerzung uebrig.")

    total_tokens = sum(len(t["input_ids"]) for t in tokenized)
    signal_tokens = sum(sum(1 for lab in t["labels"] if lab != -100) for t in tokenized)
    signal_fraction = signal_tokens / total_tokens if total_tokens else 0.0
    print(f"Zeilen ohne Lernsignal verworfen: {dropped}/{len(rows)}")
    print(f"Anteil des Lernsignals (assistant-Tokens / Gesamt-Tokens): {signal_fraction:.4f}")
    tracking.record_signal(rows=len(rows), kept=len(tokenized), assistant_fraction=signal_fraction)

    from datasets import Dataset
    dataset = Dataset.from_list(tokenized)
    eval_dataset = None
    if config.get("eval_corpus"):
        with open(config["eval_corpus"], "r", encoding="utf-8") as fh:
            eval_rows = [json.loads(line) for line in fh if line.strip()]
        eval_tokenized, eval_dropped = tokenize_corpus(tokenizer, eval_rows, max_seq_length)
        if not eval_tokenized:
            raise SystemExit("FEHLER: Validierungskorpus hat nach Kuerzung kein Assistant-Lernsignal.")
        print(f"Validierungszeilen ohne Lernsignal: {eval_dropped}/{len(eval_rows)}")
        eval_dataset = Dataset.from_list(eval_tokenized)

    from trl.trainer.sft_trainer import DataCollatorForLanguageModeling

    # Expliziter TRL-Collator (statt impliziter Wahl): Unsloth laedt Qwen3.5 als
    # VL-Processor (_is_vlm=True), wodurch der Trainer sonst transformers'
    # DataCollatorForLanguageModeling waehlt — der labels aus input_ids neu
    # erzeugt (Maske futsch) und im Eval-Loop an ragged labels zerbricht.
    # TRLs Collator padden unsere labels mit -100 und fasst sie nicht an.
    pad_id = getattr(tokenizer, "pad_token_id", None) or tokenizer.eos_token_id
    data_collator = DataCollatorForLanguageModeling(
        pad_token_id=pad_id, completion_only_loss=False,
    )

    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset,
        eval_dataset=eval_dataset,
        data_collator=data_collator,
        args=SFTConfig(
            max_length=max_seq_length,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=8,
            warmup_steps=5,
            max_steps=config["max_steps"],
            learning_rate=config["learning_rate"],
            fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(),
            logging_steps=1,
            eval_strategy="steps" if eval_dataset is not None else "no",
            eval_steps=10 if eval_dataset is not None else None,
            optim="adamw_8bit",
            weight_decay=0.001,
            lr_scheduler_type="linear",
            seed=3407,
            output_dir=config["output_dir"],
            report_to=config.get("report_to") or "none",
            push_to_hub=bool(config.get("hub_model_id")),
            hub_model_id=config.get("hub_model_id"),
            # Notebook-Paritaet (Unsloth Qwen3.5-SFT): diese drei sind Pflicht,
            # sonst bereitet TRL das Dataset selbst auf und ignoriert
            # vor-tokenisierte input_ids + attention_mask + labels.
            remove_unused_columns=False,
            dataset_text_field="",
            dataset_kwargs={"skip_prepare_dataset": True},
        ),
    )
    trainer.add_callback(tracking.trainer_callback())

    print("Starte Training...")
    stats = trainer.train()
    tracking.log_metrics(trainer.state.global_step, stats.metrics)
    tracking.record_gpu_peak(torch)
    print(f"Training abgeschlossen: {stats}")

    # Hub-Template vor dem Speichern zurueckschreiben, damit der Adapter nicht das
    # Trainings-Template ausliefert.
    if config.get("hub_template"):
        tokenizer.chat_template = Path(config["hub_template"]).read_text(encoding="utf-8")

    out_dir = Path(config["output_dir"]) / "adapter"
    model.save_pretrained(str(out_dir))
    tokenizer.save_pretrained(str(out_dir))
    print(f"Adapter gespeichert: {out_dir}")
    tracking.record_artifact(out_dir)
    if config.get("hub_model_id"):
        model.push_to_hub(config["hub_model_id"])
        tokenizer.push_to_hub(config["hub_model_id"])
        print(f"Adapter im Hub gespeichert: {config['hub_model_id']}")
    tracking.record_artifact(out_dir, config.get("hub_model_id"))
    return 0


def tokenize_corpus(tokenizer, rows: list[dict], max_seq_length: int) -> tuple[list[dict], int]:
    tokenized = []
    dropped = 0
    for row in rows:
        item = tokenize_row_with_assistant_mask(tokenizer, row["messages"], max_seq_length)
        if item is None:
            dropped += 1
        else:
            tokenized.append(item)
    return tokenized, dropped


def main(argv=None) -> int:
    config = resolve_config(argv)
    check_training_inputs(config)
    validate_lora_config(config["lora_r"], config["lora_alpha"], config["lora_dropout"])

    if config.get("dry_run"):
        print("OK (dry-run): Vorbedingungen erfuellt, Konfiguration gueltig.")
        print(json.dumps(config, indent=2, default=str))
        return 0

    with TrainingRun(
        kind="text-training", config=config, output_dir=config["output_dir"],
        corpus=config["corpus"], eval_corpus=config.get("eval_corpus"),
        measure_report=config["measure_report"],
    ) as tracking:
        return run_training(config, tracking)


if __name__ == "__main__":
    sys.exit(main())
