#!/usr/bin/env python3
"""Regenerate tests/py/.spec-durations.json from a pytest JUnit XML report.

Usage:
    bash scripts/pytest-run.sh tests/py/spec --junitxml=/tmp/spec-junit.xml -q
    python3 scripts/spec-shard-weights.py /tmp/spec-junit.xml [--out tests/py/.spec-durations.json]

The output maps each collected spec module (nodeid prefix, e.g.
``spec/native_ported/spec/test_x.py``) to its total seconds (sum of its
testcase ``time`` attributes). ``per_test_s`` is the global mean and serves as
the fallback weight for modules missing from the file (see
``tests/py/conftest.py::_spec_module_weights``).

The file is a tuning aid, not a freshness artifact: staleness only degrades
shard balance, it never fails a gate. Regenerate after suite changes that move
more than ~10% of wall-clock time, or when the slowest shard exceeds the mean
by more than ~20%.
"""
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "tests" / "py" / ".spec-durations.json"


def build_weights(junit_path: Path) -> dict:
    tree = ET.parse(junit_path)
    modules: dict[str, float] = {}
    total_time = 0.0
    total_tests = 0
    for case in tree.getroot().iter("testcase"):
        classname = case.get("classname", "")
        # classname looks like "spec.native_ported.spec.test_x" -> module path
        mod = classname.replace(".", "/") + ".py"
        if not mod.startswith("spec/"):
            # Fall back to file attribute when present.
            mod = (case.get("file") or mod).replace("\\", "/")
            if "tests/py/" in mod:
                mod = mod.split("tests/py/", 1)[1]
        try:
            t = float(case.get("time", 0) or 0)
        except ValueError:
            t = 0.0
        modules[mod] = modules.get(mod, 0.0) + t
        total_time += t
        total_tests += 1
    per_test = (total_time / total_tests) if total_tests else 1.0
    return {
        "version": 1,
        "per_test_s": round(per_test, 4),
        "modules": {k: round(v, 3) for k, v in sorted(modules.items())},
    }


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    junit_path = Path(argv[0])
    out = Path(argv[2]) if len(argv) > 2 and argv[1] == "--out" else DEFAULT_OUT
    if not junit_path.is_file():
        print(f"FAIL: junit xml not found: {junit_path}", file=sys.stderr)
        return 1
    data = build_weights(junit_path)
    out.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(data['modules'])} modules, "
          f"per_test_s={data['per_test_s']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
