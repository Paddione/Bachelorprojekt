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

# T002634: war 512. Gemma 4 antwortet unter --jinja als Reasoning-Modell, und
# der Denkteil geht aus DEMSELBEN Budget wie die Antwort. Gemessen am
# 2026-08-04 gegen gemma4-base: bei 512 lief mindestens ein Fall des
# 44-Faelle-Testsets in finish_reason=length mit leerem content — was still als
# "keine Aktion" in die Wertung gegangen waere und damit fuer eine action-Zeile
# 0.0, fuer eine no_action-Zeile faelschlich 1.0 ergeben haette. Bei 2048 trat
# der Abbruch nicht mehr auf. Der Wert MUSS auf beiden Vergleichsseiten gleich
# sein; gen_fixtures.py spiegelt ihn ueber --max-tokens.
MAX_NEW_TOKENS = 2048


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
    """Identical prompt path for base and tuned: schemas + the request.

    The output contract is stated EXPLICITLY (T002634). It used to say only
    "Respond with a JSON list of actions", while `_is_well_formed_action`
    requires each element to be `{"name": str, "params": dict}` — an unspoken
    coupling between two functions 50 lines apart. Measured against
    gemma-4-12b-it on 2026-08-04, every single `action` case scored 0.0 with
    `__malformed__`: the model picked the right action but wrapped it as
    ```json fenced `{"action": ..., "parameters": ...}`. That measures
    schema-guessing, not decision quality — and because BOTH sides guess wrong
    identically, the regression gate still passes. A gate that cannot fail is
    worse than no gate.

    Naming the schema is the fix, not loosening the parser: the scoring rules
    are the contract this harness exists to enforce, so the prompt has to state
    that contract rather than the parser tolerating deviations from it.
    """
    schemas = json.dumps(case.get("action_schemas", {}), sort_keys=True)
    return (
        f"Available actions: {schemas}\n"
        f"Request: {case['request']}\n"
        'Respond with a JSON list of actions in exactly this form: '
        '[{"name": "<action name>", "params": {"<param>": "<value>"}}]. '
        "Use the key \"name\" for the action and \"params\" for its arguments. "
        "Output raw JSON only — no markdown code fences, no explanation. "
        "If no action applies, output nothing at all."
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
            output_ids = self._model.generate(
                **inputs, do_sample=False, max_new_tokens=MAX_NEW_TOKENS
            )
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
