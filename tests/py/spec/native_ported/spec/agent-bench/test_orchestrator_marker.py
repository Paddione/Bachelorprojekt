"""Native migration of tests/spec/agent-bench/orchestrator-marker.bats."""
import json
import os
import re
import shutil
import stat
import subprocess
import time

import pytest

OPENCODE_STUB = r'''#!/usr/bin/env bash
set -u
prompt="${*: -1}"
partial="$(grep -oE 'Partial-ID: [A-Za-z0-9_-]+' <<<"$prompt" | head -1 | cut -d' ' -f2 || true)"
files="$(grep -oE 'FILES:[^|]*' <<<"$prompt" | head -1 | cut -d: -f2- || true)"
old_ifs="$IFS"; IFS=','
for f in $files; do
  f="$(echo "$f" | sed 's/^ *//;s/ *$//')"
  [ -z "$f" ] && continue
  [ "$f" = "-" ] && continue
  [ -f "$f" ] && sed -i 's/^TODO /DONE /' "$f" || true
done
IFS="$old_ifs"
echo "working on ${partial:-unknown}"
echo "PLAN-RUNNER-RESULT: success fake ${partial:-unknown}"
'''

SCRIPT = (
    '[{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p1", "prompt": "go"}}]}, '
    '{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p2", "prompt": "go"}}]}, '
    '{"tool_calls": [{"name": "wait_event", "arguments": {}}]}, '
    '{"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p1", "status": "done"}}]}, '
    '{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p3", "prompt": "go"}}]}, '
    '{"tool_calls": [{"name": "wait_event", "arguments": {}}]}, '
    '{"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p2", "status": "done"}}]}, '
    '{"tool_calls": [{"name": "wait_event", "arguments": {}}]}, '
    '{"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p3", "status": "done"}}]}, '
    '{"tool_calls": [{"name": "finish", "arguments": {"summary": "all dispatched"}}]}]'
)


@pytest.fixture
def fakes():
    """Track fake-openai servers started by a test and stop them on teardown."""
    procs = []
    yield procs
    for proc in procs:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=10)


def test_sauberer_dispatch_traegt_kein_protocol_error(repo_root, tmp_path, fakes):
    fixtures = repo_root / "tests/spec/agent-bench/fixtures"
    variant_dir = repo_root / "scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean"
    base = tmp_path / "base"
    plan = tmp_path / "plan"
    checks = tmp_path / "checks"
    work = tmp_path / "work"
    bin_dir = tmp_path / "bin"
    for d in (base / "notes", plan, checks, work, bin_dir):
        d.mkdir(parents=True, exist_ok=True)
    (base / "notes" / "a.txt").write_text("TODO a\n")
    (base / "notes" / "b.txt").write_text("TODO b\n")
    shutil.copy(variant_dir / "checks/run.sh", checks / "run.sh")
    (checks / "run.sh").chmod(0o755)
    for name in ("tasks.md", "p1.md", "p2.md", "p3.md"):
        shutil.copy(variant_dir / "reference" / name, plan / name)
    stub = bin_dir / "opencode.sh"
    stub.write_text(OPENCODE_STUB)
    stub.chmod(stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)

    # start_fake SCRIPT
    portfile = tmp_path / "fake.port"
    with open(portfile, "w") as fh:
        proc = subprocess.Popen(
            ["node", str(fixtures / "fake-openai.mjs")],
            stdout=fh, stderr=subprocess.STDOUT,
            env={**os.environ, "FAKE_OPENAI_SCRIPT": SCRIPT, "FAKE_OPENAI_LOG": ""},
            cwd=str(repo_root),
        )
    fakes.append(proc)
    match = None
    for _ in range(100):
        text = portfile.read_text() if portfile.exists() else ""
        match = re.search(r"FAKE-OPENAI-PORT=(\d+)", text)
        if match:
            break
        time.sleep(0.05)
    assert match, f"fake-openai startete nicht: {text}"
    url = f"http://127.0.0.1:{match.group(1)}"

    variant = tmp_path / "variant.json"
    variant.write_text(json.dumps({"checksDir": str(checks), "budget": {"tokens": 8000, "turns": 15}}) + "\n")
    inputs = tmp_path / "inputs.json"
    inputs.write_text(json.dumps({
        "case": {"id": "marker-clean", "base": str(base)},
        "planDir": str(plan), "slots4b": 2, "opencodeBin": str(stub),
    }) + "\n")

    run = subprocess.run(
        ["node", str(fixtures / "drive-role.mjs"), "orchestrator", str(variant), str(inputs)],
        cwd=str(repo_root),
        env={**os.environ, "RECORDER_URL": url, "WORKDIR": str(work), "DRIVE_TIMEOUT_MS": "120000"},
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300,
    )
    assert run.returncode == 0, run.stdout
    kinds = [e["kind"] for e in (json.loads(run.stdout).get("events") or [])]
    assert "protocol_error" not in kinds, f"unexpected protocol_error: {json.dumps(kinds)}"
