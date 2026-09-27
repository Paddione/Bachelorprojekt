"""Private-by-default provenance for Unsloth training and evaluation runs.

Local manifests are always written. Langfuse receives only fingerprints, scalar
metrics and model/artifact identifiers when its credentials are configured.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fingerprint(path: str | Path) -> dict:
    """Identify a file without copying its potentially private contents."""
    source = Path(path)
    digest = hashlib.sha256()
    with source.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"name": source.name, "sha256": digest.hexdigest(), "bytes": source.stat().st_size}


def corpus_fingerprint(path: str | Path) -> dict:
    result = fingerprint(path)
    with Path(path).open("rb") as handle:
        result["rows"] = sum(bool(line.strip()) for line in handle)
    return result


def image_fingerprint(rows: list[dict]) -> dict:
    """Fingerprint image bytes, including changes not reflected in JSONL paths."""
    paths = []
    for row in rows:
        for message in row["messages"]:
            for block in message.get("content", []) if isinstance(message.get("content"), list) else []:
                if isinstance(block, dict) and block.get("type") == "image":
                    paths.append(Path(block["image"]))
    digest = hashlib.sha256()
    for path in paths:
        digest.update(bytes.fromhex(fingerprint(path)["sha256"]))
    return {"count": len(paths), "sha256": digest.hexdigest()}


def _model_id(model: str) -> str:
    path = Path(model)
    if path.is_dir():
        # Hugging Face cache snapshots include a stable repo name and revision.
        if path.parent.name == "snapshots" and path.parent.parent.name.startswith("models--"):
            return path.parent.parent.name.removeprefix("models--").replace("--", "/") + "@" + path.name
        return path.name
    return model


def _versions() -> dict:
    result = {"python": sys.version.split()[0]}
    for package in ("unsloth", "trl", "transformers", "torch", "peft", "bitsandbytes", "langfuse"):
        try:
            result[package] = metadata.version(package)
        except metadata.PackageNotFoundError:
            pass
    return result


def _git_commit() -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], capture_output=True, text=True,
        cwd=Path(__file__).resolve().parents[2], check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def _client():
    public = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret = os.getenv("LANGFUSE_SECRET_KEY")
    if not public and not secret:
        return None
    if not public or not secret:
        raise RuntimeError("set both LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY")
    try:
        from langfuse import get_client
    except ImportError as exc:
        raise RuntimeError("Langfuse credentials are set; install langfuse>=4 before training") from exc
    client = get_client()
    if not client.auth_check():
        raise RuntimeError("Langfuse authentication failed")
    return client


def _safe_config(config: dict) -> dict:
    allowed = (
        "precision", "gpu_mode", "max_seq_length", "max_steps", "learning_rate",
        "lora_r", "lora_alpha", "lora_dropout", "use_rslora",
        "freeze_vision_layers", "min_free_vram_gb", "hub_model_id", "report_to",
    )
    return {key: config[key] for key in allowed if key in config}


class TrainingRun:
    def __init__(self, *, kind: str, config: dict, output_dir: str | Path,
                 corpus: str | Path, eval_corpus: str | Path | None = None,
                 measure_report: str | Path | None = None,
                 image_rows: list[dict] | None = None,
                 eval_image_rows: list[dict] | None = None):
        self.output_dir = Path(output_dir)
        run_id = str(uuid.uuid4())
        self.manifest_path = self.output_dir / f"run-manifest-{run_id}.json"
        self.metrics_path = self.output_dir / f"trainer-metrics-{run_id}.jsonl"
        self.manifest = {
            "run_id": run_id, "kind": kind, "status": "running",
            "started_at": _now(), "model": _model_id(str(config["model"])),
            "config": _safe_config(config), "git_commit": _git_commit(),
            "versions": _versions(), "train_corpus": corpus_fingerprint(corpus),
        }
        if eval_corpus:
            self.manifest["eval_corpus"] = corpus_fingerprint(eval_corpus)
        if measure_report:
            self.manifest["measure_report"] = fingerprint(measure_report)
            report = json.loads(Path(measure_report).read_text(encoding="utf-8"))
            self.manifest["measure_summary"] = {
                key: report[key] for key in ("row_count", "tokenizer_source", "lengths")
                if key in report
            }
        if image_rows is not None:
            self.manifest["images"] = image_fingerprint(image_rows)
        if eval_image_rows is not None:
            self.manifest["eval_images"] = image_fingerprint(eval_image_rows)
        self._client = None
        self._context = None
        self._span = None
        self._last_metrics = {}

    def _write(self) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        temporary = self.manifest_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(self.manifest, indent=2, sort_keys=True), encoding="utf-8")
        temporary.replace(self.manifest_path)

    def __enter__(self):
        self._write()
        self._client = _client()  # Check credentials before an expensive GPU run.
        if self._client:
            self._context = self._client.start_as_current_observation(
                as_type="span", name="unsloth-" + self.manifest["kind"],
                input={k: v for k, v in self.manifest.items() if k != "status"},
                metadata={"run_id": self.manifest["run_id"], "kind": self.manifest["kind"],
                          "model": self.manifest["model"],
                          "train_sha256": self.manifest["train_corpus"]["sha256"]},
            )
            self._span = self._context.__enter__()
            self.manifest["langfuse_trace_id"] = self._client.get_current_trace_id()
            self._write()
        return self

    def record_gpu(self, torch) -> None:
        self.manifest["gpus"] = [
            {"name": torch.cuda.get_device_name(i),
             "total_gib": round(torch.cuda.get_device_properties(i).total_memory / 2**30, 2),
             "free_gib_at_start": round(torch.cuda.mem_get_info(i)[0] / 2**30, 2)}
            for i in range(torch.cuda.device_count())
        ]
        for i in range(torch.cuda.device_count()):
            torch.cuda.reset_peak_memory_stats(i)
        self._write()

    def record_gpu_peak(self, torch) -> None:
        for i, gpu in enumerate(self.manifest.get("gpus", [])):
            gpu["peak_allocated_gib"] = round(torch.cuda.max_memory_allocated(i) / 2**30, 2)
            gpu["peak_reserved_gib"] = round(torch.cuda.max_memory_reserved(i) / 2**30, 2)
        self._write()

    def record_signal(self, *, rows: int, kept: int,
                      assistant_fraction: float | None = None) -> None:
        self.manifest["training_signal"] = {
            "rows": rows, "kept": kept,
        }
        if assistant_fraction is not None:
            self.manifest["training_signal"]["assistant_fraction"] = assistant_fraction
        self._write()

    def log_metrics(self, step: int, logs: dict) -> None:
        scalars = {key: float(value) for key, value in logs.items()
                   if isinstance(value, (int, float)) and math.isfinite(float(value))}
        if not scalars:
            return
        entry = {"step": step, "at": _now(), "metrics": scalars}
        with self.metrics_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry) + "\n")
        self._last_metrics.update(scalars)

    def trainer_callback(self):
        from transformers import TrainerCallback
        run = self

        class MetricsCallback(TrainerCallback):
            def on_log(self, args, state, control, logs=None, **kwargs):
                if logs:
                    run.log_metrics(state.global_step, logs)

        return MetricsCallback()

    def record_artifact(self, path: str | Path, hub_id: str | None = None) -> None:
        directory = Path(path)
        self.manifest["adapter"] = {
            "path": str(directory),
            "files": [fingerprint(p) for p in sorted(directory.iterdir()) if p.is_file()],
        }
        if hub_id:
            self.manifest["adapter"]["hub_id"] = hub_id
        self._write()

    def __exit__(self, error_type, error, traceback):
        self.manifest["status"] = "failed" if error_type else "completed"
        self.manifest["finished_at"] = _now()
        if error_type:
            self.manifest["error_type"] = error_type.__name__
        self.manifest["final_metrics"] = self._last_metrics
        self._write()
        if self._client:
            try:
                self._span.update(output={
                    "run_id": self.manifest["run_id"],
                    "status": self.manifest["status"],
                    "training_signal": self.manifest.get("training_signal"),
                    "adapter": {"hub_id": self.manifest.get("adapter", {}).get("hub_id"),
                                "files": self.manifest.get("adapter", {}).get("files", [])},
                    "final_metrics": self._last_metrics,
                    "gpus": self.manifest.get("gpus"),
                }, level="ERROR" if error_type else "DEFAULT")
                for name, value in self._last_metrics.items():
                    if name in ("loss", "eval_loss", "train_loss", "train_runtime"):
                        self._client.score_current_trace(name="finetune_" + name, value=value)
            except Exception as exc:
                print(f"WARNING: Langfuse update failed; local manifest retained: {type(exc).__name__}", file=sys.stderr)
            finally:
                try:
                    self._context.__exit__(error_type, error, traceback)
                    self._client.flush()
                except Exception as exc:
                    print(f"WARNING: Langfuse flush failed; local manifest retained: {type(exc).__name__}",
                          file=sys.stderr)
        hub_id = self.manifest["config"].get("hub_model_id")
        if hub_id:
            self._upload_hub_provenance(hub_id)
        return False

    def _upload_hub_provenance(self, hub_id: str) -> None:
        """Keep provenance when HF Jobs deletes its ephemeral /tmp filesystem."""
        try:
            from huggingface_hub import HfApi
            public_manifest = dict(self.manifest)
            if "adapter" in public_manifest:
                public_manifest["adapter"] = {key: value for key, value in public_manifest["adapter"].items()
                                              if key != "path"}
            public_path = self.output_dir / f"hub-manifest-{self.manifest['run_id']}.json"
            public_path.write_text(json.dumps(public_manifest, indent=2, sort_keys=True), encoding="utf-8")
            api = HfApi()
            prefix = f"training-runs/{self.manifest['run_id']}"
            api.upload_file(path_or_fileobj=str(public_path), path_in_repo=f"{prefix}/manifest.json",
                            repo_id=hub_id, repo_type="model")
            if self.metrics_path.is_file():
                api.upload_file(path_or_fileobj=str(self.metrics_path), path_in_repo=f"{prefix}/metrics.jsonl",
                                repo_id=hub_id, repo_type="model")
        except Exception as exc:
            print(f"WARNING: Hub provenance upload failed; local manifest retained: {type(exc).__name__}",
                  file=sys.stderr)


def publish_evaluation(*, report: dict, testset: str | Path, model: str | None,
                       adapter: str | None, fixture: bool = False) -> None:
    """Publish aggregate scores only. Raw cases, prompts and generations stay local."""
    client = _client()
    if client is None:
        return
    testset_id = corpus_fingerprint(testset)
    model_id = _model_id(model) if model else None
    with client.start_as_current_observation(
        as_type="span", name="unsloth-evaluation",
        input={"testset": testset_id, "model": model_id,
               "adapter": Path(adapter).name if adapter else None, "fixture": fixture},
        metadata={"model": model_id, "testset_sha256": testset_id["sha256"]},
    ) as span:
        span.update(output={"regressions": report["regressions"],
                            "base_aggregate": report["base_aggregate"],
                            "tuned_aggregate": report["tuned_aggregate"]})
        for side in ("base", "tuned"):
            aggregate = report[side + "_aggregate"]
            client.score_current_trace(name=side + "_overall", value=aggregate["overall"])
            for partition, value in aggregate["by_partition"].items():
                client.score_current_trace(name=side + "_" + partition, value=value)
            for language, value in aggregate.get("by_language", {}).items():
                client.score_current_trace(name=side + "_language_" + language, value=value)
        client.score_current_trace(name="regression_gate_pass", value=0.0 if report["regressions"] else 1.0)
    client.flush()
