#!/usr/bin/env python3
"""Pure scoring rules for the Unsloth eval harness (T002606).

No model access, no GPU — importable and callable from CI. Consumes already
parsed action lists (see eval_harness.py for how raw model text becomes
`actual_actions`) and testset case dicts, and returns a 0/1 score per case
plus the reasons a case failed.

Case classes:
  - action: a specific set of actions is correct. Scored on syntactic
    well-formedness, name match against the expected set, required-param
    completeness, and absence of unknown params.
  - no_action: full score only if no action was emitted at all. An emitted
    action is the failure case this class exists to catch.
  - clarify: full score only if no action was emitted (a clarifying
    question is expected instead). An action with invented params scores 0.

CLI:
    eval_scoring.py score < payload.json
        payload: {"case": {...}, "actual_actions": [...]}
        prints {"score": 0.0|1.0, "reasons": [...]}, exit 0.

    eval_scoring.py validate-testset <path.jsonl>
        Validates shape (>=40 cases, all three partitions populated, every
        case has an en/de counterpart via pair_id). Exit 0 if valid, exit 1
        with the shortfall named on stderr otherwise.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from typing import Any

CASE_CLASSES = ("action", "no_action", "clarify")
LANGUAGES = ("en", "de")
MIN_TESTSET_SIZE = 40


def _is_well_formed_action(action: Any) -> bool:
    return (
        isinstance(action, dict)
        and isinstance(action.get("name"), str)
        and action.get("name") != ""
        and isinstance(action.get("params", {}), dict)
    )


def _params_match_schema(action: dict, schema: dict) -> bool:
    """True if action's params satisfy schema's required/optional contract."""
    required = set(schema.get("required", []))
    optional = set(schema.get("optional", []))
    known = required | optional
    params = set(action.get("params", {}).keys())
    if not required.issubset(params):
        return False
    if not params.issubset(known):
        return False
    return True


def score_action_case(case: dict, actual_actions: list) -> dict:
    if not all(_is_well_formed_action(a) for a in actual_actions):
        return {"score": 0.0, "reasons": ["malformed action output"]}

    expected = case.get("expected_actions", [])
    expected_names = {a["name"] for a in expected}
    actual_names = {a["name"] for a in actual_actions}

    if actual_names != expected_names:
        return {
            "score": 0.0,
            "reasons": [
                f"action name mismatch: expected {sorted(expected_names)}, "
                f"got {sorted(actual_names)}"
            ],
        }

    schemas = case.get("action_schemas", {})
    reasons = []
    for action in actual_actions:
        schema = schemas.get(action["name"], {})
        if not _params_match_schema(action, schema):
            reasons.append(f"{action['name']}: missing required or unknown params")

    if reasons:
        return {"score": 0.0, "reasons": reasons}
    return {"score": 1.0, "reasons": []}


def score_no_action_case(case: dict, actual_actions: list) -> dict:
    if actual_actions:
        return {"score": 0.0, "reasons": ["action emitted where none was expected"]}
    return {"score": 1.0, "reasons": []}


def score_clarify_case(case: dict, actual_actions: list) -> dict:
    if actual_actions:
        return {
            "score": 0.0,
            "reasons": ["action emitted instead of a clarifying question"],
        }
    return {"score": 1.0, "reasons": []}


_SCORERS = {
    "action": score_action_case,
    "no_action": score_no_action_case,
    "clarify": score_clarify_case,
}


def score_case(case: dict, actual_actions: list) -> dict:
    case_class = case.get("class")
    scorer = _SCORERS.get(case_class)
    if scorer is None:
        raise ValueError(f"unknown case class: {case_class!r}")
    return scorer(case, actual_actions)


def load_testset(path: str) -> list:
    cases = []
    with open(path, encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                cases.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no}: invalid JSON: {exc}") from exc
    return cases


def validate_testset(cases: list) -> list:
    """Returns a list of validation problems; empty list means valid."""
    problems = []

    if len(cases) < MIN_TESTSET_SIZE:
        problems.append(
            f"testset has {len(cases)} cases, needs at least {MIN_TESTSET_SIZE} "
            f"(short by {MIN_TESTSET_SIZE - len(cases)})"
        )

    class_counts = Counter(c.get("class") for c in cases)
    for cls in CASE_CLASSES:
        if class_counts.get(cls, 0) == 0:
            problems.append(f"partition {cls!r} has no cases")

    pairs = defaultdict(set)
    for c in cases:
        pair_id = c.get("pair_id")
        lang = c.get("language")
        if pair_id is None or lang not in LANGUAGES:
            problems.append(f"case {c.get('id')!r} missing pair_id or valid language")
            continue
        pairs[pair_id].add(lang)

    for pair_id, langs in pairs.items():
        missing = set(LANGUAGES) - langs
        if missing:
            problems.append(f"pair {pair_id!r} missing language(s): {sorted(missing)}")

    return problems


def _cmd_score(_args: argparse.Namespace) -> int:
    payload = json.load(sys.stdin)
    result = score_case(payload["case"], payload.get("actual_actions", []))
    print(json.dumps(result))
    return 0


def _cmd_validate_testset(args: argparse.Namespace) -> int:
    try:
        cases = load_testset(args.path)
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    problems = validate_testset(cases)
    if problems:
        for problem in problems:
            print(f"ERROR: {problem}", file=sys.stderr)
        return 1
    print(f"OK: {len(cases)} cases, all partitions populated, all pairs complete")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("score").set_defaults(func=_cmd_score)

    p_validate = sub.add_parser("validate-testset")
    p_validate.add_argument("path")
    p_validate.set_defaults(func=_cmd_validate_testset)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
