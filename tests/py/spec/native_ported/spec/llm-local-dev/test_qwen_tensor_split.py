"""Native migration of tests/spec/llm-local-dev/qwen-tensor-split.bats."""

import json
import re

import pytest


def script_default_ts(repo_root):
    text = (repo_root / "scripts" / "llm" / "start-qwen-server.ps1").read_text(encoding="utf-8").replace("\r", "")
    for line in text.splitlines():
        m = re.match(r'^[ \t]*\[string\]\$TensorSplit = "([^"]*)"', line)
        if m:
            return m.group(1)
    return ""


def test_start_qwen_server_ps1_defaults_tensorsplit_to_85_15_t900172(repo_root):
    assert script_default_ts(repo_root) == "85,15"


def test_loadout_qwen38_220k_passes_the_same_ts_as_the_start_script_t900172(repo_root):
    loadouts = json.loads((repo_root / "scripts" / "llm" / "loadouts.json").read_text(encoding="utf-8"))
    match = [l for l in loadouts["loadouts"] if l.get("slug") == "qwen38-220k"]
    assert match, "loadout qwen38-220k not found"
    args = match[0].get("extraArgs") or []
    assert "-ts" in args, "missing"
    value = args[args.index("-ts") + 1]
    assert value
    assert value == script_default_ts(repo_root)
