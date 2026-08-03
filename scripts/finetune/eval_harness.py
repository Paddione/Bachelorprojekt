#!/usr/bin/env python3
"""Base-vs-Tuned regression gate for Unsloth finetunes (T002606).

Loads the base model and the adapter sequentially — never together, VRAM on
the target hardware does not fit both — generates greedy completions for
every testset case with an identical prompt path, and scores completions via
`eval_scoring.score_case`. Aggregates per partition (action/no_action/clarify)
and per language; exits non-zero if the tuned model's aggregate is below the
base model's anywhere.

Real runs (GPU, model weights) omit --fixture-base/--fixture-tuned and pass
--adapter, a local PEFT adapter directory. Its adapter_config.json must carry
base_model_name_or_path — comparing against a guessed base model is refused.

CI/tests never load a model: pass --fixture-base/--fixture-tuned, JSON files
mapping case id -> raw model text, standing in for a real generation pass.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eval_scoring import score_case, validate_testset, load_testset  # noqa: E402

PARTITIONS = ("action", "no_action", "clarify")
LANGUAGES = ("en", "de")
MALFORMED_ACTION_NAME = "__malformed__"


def parse_action_output(raw_text: str) -> list:
    """Parses raw model text into a list of action dicts.

    Convention: empty/whitespace-only text means "no action". Non-empty text
    must be a JSON list of `{"name": str, "params": dict}` objects. Anything
    that fails to parse is reported back as a single malformed action so the
    scoring rules' well-formedness check fails it explicitly instead of the
    parser silently dropping it.
    """
    text = raw_text.strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return [{"name": MALFORMED_ACTION_NAME, "params": {}}]
    if not isinstance(parsed, list):
        return [{"name": MALFORMED_ACTION_NAME, "params": {}}]
    return parsed


def build_prompt(case: dict) -> str:
    """Identical prompt path for base and tuned: schemas + the request."""
    schemas = json.dumps(case.get("action_schemas", {}), sort_keys=True)
    return (
        f"Available actions: {schemas}\n"
        f"Request: {case['request']}\n"
        "Respond with a JSON list of actions, or nothing if no action applies."
    )


def read_base_model_id(adapter_path: str) -> str:
    config_path = Path(adapter_path) / "adapter_config.json"
    if not config_path.is_file():
        raise ValueError(f"adapter config not found: {config_path}")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    base_model_id = config.get("base_model_name_or_path")
    if not base_model_id:
        raise ValueError(
            f"{config_path}: no base_model_name_or_path — refusing to compare "
            "against a guessed base model"
        )
    return base_model_id


class FixtureBackend:
    """Test/CI backend: returns pre-recorded raw text instead of running a model."""

    def __init__(self, fixture_path: str):
        self._outputs = json.loads(Path(fixture_path).read_text(encoding="utf-8"))

    def generate(self, case: dict) -> str:
        case_id = case["id"]
        if case_id not in self._outputs:
            raise ValueError(
                f"fixture {case_id!r} missing from {len(self._outputs)} recorded outputs"
            )
        return self._outputs[case_id]

    def unload(self) -> None:
        pass


class ModelBackend:
    """Real backend: loads a HF/PEFT model and greedy-generates. GPU required.

    Imports transformers/torch/peft lazily so importing this module (e.g.
    from tests, which only ever use FixtureBackend) never requires them to be
    installed.
    """

    def __init__(self, model_id: str, adapter_path: str | None = None):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self._tokenizer = AutoTokenizer.from_pretrained(model_id)
        model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype="auto")
        if adapter_path:
            from peft import PeftModel

            model = PeftModel.from_pretrained(model, adapter_path)
        self._model = model
        self._torch = torch

    def generate(self, case: dict) -> str:
        prompt = build_prompt(case)
        inputs = self._tokenizer(prompt, return_tensors="pt")
        with self._torch.no_grad():
            output_ids = self._model.generate(**inputs, do_sample=False, max_new_tokens=512)
        return self._tokenizer.decode(
            output_ids[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True
        )

    def unload(self) -> None:
        del self._model
        if self._torch.cuda.is_available():
            self._torch.cuda.empty_cache()


def run_backend(backend, cases: list) -> dict:
    return {case["id"]: parse_action_output(backend.generate(case)) for case in cases}


def score_all(cases: list, actual_by_id: dict) -> list:
    scored = []
    for case in cases:
        result = score_case(case, actual_by_id[case["id"]])
        scored.append({
            "id": case["id"],
            "class": case["class"],
            "language": case["language"],
            "score": result["score"],
            "reasons": result["reasons"],
        })
    return scored


def _mean(values: list) -> float:
    return sum(values) / len(values) if values else 0.0


def aggregate(scored: list) -> dict:
    by_partition = {
        p: _mean([s["score"] for s in scored if s["class"] == p])
        for p in PARTITIONS
        if any(s["class"] == p for s in scored)
    }
    by_language = {
        lang: _mean([s["score"] for s in scored if s["language"] == lang])
        for lang in LANGUAGES
        if any(s["language"] == lang for s in scored)
    }
    return {
        "overall": _mean([s["score"] for s in scored]),
        "by_partition": by_partition,
        "by_language": by_language,
    }


def compare_gate(base_agg: dict, tuned_agg: dict) -> list:
    """Returns the sorted list of regressed keys ('overall' and/or partitions)."""
    regressions = []
    if tuned_agg["overall"] < base_agg["overall"]:
        regressions.append("overall")
    for partition, base_score in base_agg["by_partition"].items():
        tuned_score = tuned_agg["by_partition"].get(partition)
        if tuned_score is not None and tuned_score < base_score:
            regressions.append(partition)
    return regressions


def _build_report(cases: list, base_scored: list, tuned_scored: list) -> dict:
    base_agg = aggregate(base_scored)
    tuned_agg = aggregate(tuned_scored)
    regressions = compare_gate(base_agg, tuned_agg)
    by_id = {c["id"]: c for c in cases}
    return {
        "cases": [
            {
                "id": b["id"],
                "class": by_id[b["id"]]["class"],
                "language": by_id[b["id"]]["language"],
                "base_score": b["score"],
                "tuned_score": t["score"],
            }
            for b, t in zip(base_scored, tuned_scored)
        ],
        "base_aggregate": base_agg,
        "tuned_aggregate": tuned_agg,
        "regressions": regressions,
    }


def run(args: argparse.Namespace) -> int:
    cases = load_testset(args.testset)
    problems = validate_testset(cases)
    if problems:
        for problem in problems:
            print(f"ERROR: {problem}", file=sys.stderr)
        return 1

    using_fixtures = bool(args.fixture_base and args.fixture_tuned)
    if using_fixtures:
        base_backend = FixtureBackend(args.fixture_base)
        tuned_backend = FixtureBackend(args.fixture_tuned)
    else:
        if not args.adapter:
            print("ERROR: --adapter is required for a real (non-fixture) run", file=sys.stderr)
            return 1
        try:
            base_model_id = read_base_model_id(args.adapter)
        except ValueError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
        base_backend = ModelBackend(base_model_id)
        tuned_backend = None  # constructed after base_backend is unloaded

    base_results = run_backend(base_backend, cases)
    base_backend.unload()

    if not using_fixtures:
        tuned_backend = ModelBackend(base_model_id, adapter_path=args.adapter)
    tuned_results = run_backend(tuned_backend, cases)
    tuned_backend.unload()

    base_scored = score_all(cases, base_results)
    tuned_scored = score_all(cases, tuned_results)
    report = _build_report(cases, base_scored, tuned_scored)

    output_json = json.dumps(report, indent=2)
    if args.output:
        Path(args.output).write_text(output_json, encoding="utf-8")
    if not args.quiet:
        print(output_json)

    regressions = report["regressions"]
    if regressions:
        print(f"REGRESSION GATE FAILED: {', '.join(regressions)}", file=sys.stderr)
        return 1
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--testset", required=True)
    parser.add_argument("--adapter", help="path to a PEFT adapter dir (real run)")
    parser.add_argument("--fixture-base", help="JSON file: case id -> raw base model text")
    parser.add_argument("--fixture-tuned", help="JSON file: case id -> raw tuned model text")
    parser.add_argument("--output", help="write the JSON report here")
    parser.add_argument("--quiet", action="store_true", help="suppress the JSON report on stdout")
    args = parser.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
