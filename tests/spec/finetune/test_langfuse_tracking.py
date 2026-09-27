"""Contract tests for private Unsloth run provenance and Langfuse emission."""
from __future__ import annotations

import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

FINETUNE = Path(__file__).resolve().parents[3] / "scripts" / "finetune"
sys.path.insert(0, str(FINETUNE))
from langfuse_tracking import TrainingRun, image_fingerprint, publish_evaluation  # noqa: E402


class FakeSpan:
    def __init__(self, client):
        self.client = client

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.client.closed += 1

    def update(self, **kwargs):
        self.client.updates.append(kwargs)


class FakeClient:
    def __init__(self):
        self.inputs = []
        self.updates = []
        self.scores = []
        self.closed = 0
        self.flushed = 0

    def auth_check(self):
        return True

    def start_as_current_observation(self, **kwargs):
        self.inputs.append(kwargs)
        return FakeSpan(self)

    def get_current_trace_id(self):
        return "trace-123"

    def score_current_trace(self, **kwargs):
        self.scores.append(kwargs)

    def flush(self):
        self.flushed += 1


class TrackingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.corpus = self.root / "private.jsonl"
        self.corpus.write_text('{"messages":[{"role":"user","content":"PRIVATE PROMPT"}]}\n', encoding="utf-8")

    def test_manifest_survives_failed_run_without_langfuse(self):
        with patch.dict("os.environ", {"LANGFUSE_PUBLIC_KEY": "", "LANGFUSE_SECRET_KEY": ""}):
            with self.assertRaisesRegex(ValueError, "training failed"):
                with TrainingRun(kind="text-training", config={"model": "unsloth/Qwen3-4B", "max_steps": 60},
                                 output_dir=self.root / "out", corpus=self.corpus) as run:
                    run.log_metrics(1, {"loss": 1.2, "non_numeric": "PRIVATE PROMPT"})
                    raise ValueError("training failed")
        manifest = json.loads(next((self.root / "out").glob("run-manifest-*.json")).read_text())
        self.assertEqual(manifest["status"], "failed")
        self.assertEqual(manifest["error_type"], "ValueError")
        self.assertEqual(manifest["train_corpus"]["rows"], 1)
        self.assertNotIn("PRIVATE PROMPT", json.dumps(manifest))
        self.assertEqual(manifest["final_metrics"]["loss"], 1.2)

    def test_langfuse_receives_fingerprints_and_scores_only(self):
        client = FakeClient()
        fake_module = types.SimpleNamespace(get_client=lambda: client)
        env = {"LANGFUSE_PUBLIC_KEY": "pk-test", "LANGFUSE_SECRET_KEY": "sk-test"}
        with patch.dict("os.environ", env), patch.dict(sys.modules, {"langfuse": fake_module}):
            with TrainingRun(kind="text-training", config={"model": "unsloth/Qwen3-4B", "max_steps": 60},
                             output_dir=self.root / "out", corpus=self.corpus) as run:
                run.log_metrics(1, {"loss": 1.2})
            report = {"regressions": [],
                      "base_aggregate": {"overall": 0.5, "by_partition": {"action": 0.4}},
                      "tuned_aggregate": {"overall": 0.8, "by_partition": {"action": 0.7}}}
            publish_evaluation(report=report, testset=self.corpus, model="unsloth/Qwen3-4B", adapter="/tmp/a")
        transmitted = json.dumps({"inputs": client.inputs, "updates": client.updates})
        self.assertNotIn("PRIVATE PROMPT", transmitted)
        self.assertEqual(client.flushed, 2)
        self.assertEqual(client.closed, 2)
        self.assertIn("finetune_loss", [score["name"] for score in client.scores])
        self.assertIn("tuned_overall", [score["name"] for score in client.scores])

    def test_image_fingerprint_changes_with_image_bytes(self):
        image = self.root / "image.png"
        image.write_bytes(b"first")
        rows = [{"messages": [{"role": "user", "content": [{"type": "image", "image": str(image)}]}]}]
        first = image_fingerprint(rows)
        image.write_bytes(b"second")
        self.assertNotEqual(first["sha256"], image_fingerprint(rows)["sha256"])

    def test_trainer_callback_records_step_and_runs_do_not_overwrite(self):
        fake_transformers = types.SimpleNamespace(TrainerCallback=object)
        with patch.dict(sys.modules, {"transformers": fake_transformers}), \
                patch.dict("os.environ", {"LANGFUSE_PUBLIC_KEY": "", "LANGFUSE_SECRET_KEY": ""}):
            first = TrainingRun(kind="vision-training", config={"model": "unsloth/Qwen3-VL-4B"},
                                output_dir=self.root / "out", corpus=self.corpus)
            second = TrainingRun(kind="vision-training", config={"model": "unsloth/Qwen3-VL-4B"},
                                 output_dir=self.root / "out", corpus=self.corpus)
            with first:
                first.trainer_callback().on_log(None, types.SimpleNamespace(global_step=7), None,
                                                logs={"eval_loss": 0.8})
            with second:
                second.log_metrics(1, {"loss": 0.7})
        self.assertNotEqual(first.manifest_path, second.manifest_path)
        self.assertEqual(len(list((self.root / "out").glob("run-manifest-*.json"))), 2)
        row = json.loads(first.metrics_path.read_text().splitlines()[0])
        self.assertEqual((row["step"], row["metrics"]["eval_loss"]), (7, 0.8))


if __name__ == "__main__":
    unittest.main()
