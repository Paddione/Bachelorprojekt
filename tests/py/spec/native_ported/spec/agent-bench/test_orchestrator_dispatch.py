"""Native migration of tests/spec/agent-bench/orchestrator-dispatch.bats."""
import json
import os
import re
import shutil
import stat
import subprocess
import time
from pathlib import Path

import pytest

OPENCODE_STUB = r'''#!/usr/bin/env bash
# Dispatch-Stub: schreibt TODO→DONE in den Record-Dateien des Prompts.
set -u
prompt="${*: -1}"
agent=""; prev=""
for a in "$@"; do [ "$prev" = "--agent" ] && agent="$a"; prev="$a"; done
partial="$(grep -oE 'Partial-ID: [A-Za-z0-9_-]+' <<<"$prompt" | head -1 | cut -d' ' -f2 || true)"
[ -n "${FAKE_OPENCODE_LOG:-}" ] && echo "$agent ${partial:-unknown}" >> "$FAKE_OPENCODE_LOG" || true
if [ -n "${FAULT_ONCE_STATE:-}" ] && [ ! -f "$FAULT_ONCE_STATE" ]; then
  : > "$FAULT_ONCE_STATE"
  echo "working (faulty first attempt)"
  echo "PLAN-RUNNER-RESULT: failure injected fault for ${partial:-unknown}"
  exit 0
fi
# Selbstausfuehrung schreibt nichts (Checks bleiben rot → Outcome 0).
case "$agent" in
  *self*) echo "working on ${partial:-unknown} (self, no files)"; echo "PLAN-RUNNER-RESULT: success self ${partial:-unknown}"; exit 0 ;;
esac
files="$(grep -oE 'FILES:[^|]*' <<<"$prompt" | head -1 | cut -d: -f2- || true)"
old_ifs="$IFS"; IFS=','
# shellcheck disable=SC2162
for f in $files; do
  f="$(echo "$f" | sed 's/^ *//;s/ *$//')"
  [ -z "$f" ] && continue
  [ "$f" = "-" ] && continue
  if [ "$f" = "SUMMARY.md" ]; then
    printf 'a: DONE a\nb: DONE b\nsynthesis complete\n' > "$f" || true
  elif [ -f "$f" ]; then
    sed -i 's/^TODO /DONE /' "$f" || true
  fi
done
IFS="$old_ifs"
echo "working on ${partial:-unknown}"
echo "PLAN-RUNNER-RESULT: success fake ${partial:-unknown}"
'''

RETRY_TASKS = """# Dispatch-Retry (Test-Fixpunkt)

## Partials

| id | plan | role | target_files | depends_on |
|----|------|--------------|------------|
| p1 | p1.md | impl | notes/a.txt | |
| p2 | p2.md | impl | notes/b.txt | |
"""

SELF_TASKS = """# Dispatch-Self (Test-Fixpunkt)

## Partials

| id | plan | role | target_files | depends_on |
|----|------|--------------|------------|
| p1 | p1.md | impl | notes/a.txt | |
| p2 | p2.md | impl | notes/b.txt | |
"""

CHECKS_RUN = """#!/usr/bin/env bash
set -u
fail=0
grep -q '^DONE a$' notes/a.txt 2>/dev/null || fail=1
grep -q '^DONE b$' notes/b.txt 2>/dev/null || fail=1
if grep -rq '^TODO' notes/ 2>/dev/null; then fail=1; fi
exit $fail
"""


@pytest.fixture
def fakes():
    """Track fake-openai servers started by a test and stop them on teardown."""
    procs = []
    yield procs
    for proc in procs:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=10)


class Orch:
    """Test-Zustand der setup()-Funktion: T, Fake-Server, Eingaben."""

    def __init__(self, repo_root, tmp_path, fakes):
        self.repo = repo_root
        self.fixtures = repo_root / "tests/spec/agent-bench/fixtures"
        self.variant_dir = repo_root / "scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean"
        self.fakes = fakes
        self.T = tmp_path
        self.base = self.T / "base"
        self.plan = self.T / "plan"
        self.checks = self.T / "checks"
        self.work = self.T / "work"
        self.bin = self.T / "bin"
        for d in (self.base / "notes", self.plan, self.checks, self.work, self.bin):
            d.mkdir(parents=True, exist_ok=True)
        for name in ("a", "b", "c"):
            (self.base / "notes" / f"{name}.txt").write_text(f"TODO {name}\n")
        shutil.copy(self.variant_dir / "checks/run.sh", self.checks / "run.sh")
        (self.checks / "run.sh").chmod(0o755)
        for name in ("tasks.md", "p1.md", "p2.md", "p3.md"):
            shutil.copy(self.variant_dir / "reference" / name, self.plan / name)
        stub = self.bin / "opencode.sh"
        stub.write_text(OPENCODE_STUB)
        stub.chmod(stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
        self.opencode_log = self.T / "opencode.log"
        self.opencode_log.write_text("")
        self.variant = self.T / "variant.json"
        self.inputs = self.T / "inputs.json"
        self.url = None

    def begin(self, script, inputs_json):
        """begin_orch: Fake-Server starten, variant.json und inputs.json schreiben."""
        self.url = self.start_fake(script)
        self.variant.write_text(
            json.dumps({"checksDir": str(self.checks), "budget": {"tokens": 8000, "turns": 15}}) + "\n"
        )
        self.inputs.write_text(inputs_json)

    def start_fake(self, script):
        portfile = self.T / f"fake-{len(self.fakes)}.port"
        env = {**os.environ, "FAKE_OPENAI_SCRIPT": script, "FAKE_OPENAI_LOG": ""}
        with open(portfile, "w") as fh:
            proc = subprocess.Popen(
                ["node", str(self.fixtures / "fake-openai.mjs")],
                stdout=fh, stderr=subprocess.STDOUT, env=env, cwd=str(self.repo),
            )
        self.fakes.append(proc)
        match = None
        for _ in range(100):
            text = portfile.read_text() if portfile.exists() else ""
            match = re.search(r"FAKE-OPENAI-PORT=(\d+)", text)
            if match:
                break
            time.sleep(0.05)
        assert match, f"fake-openai startete nicht: {text}"
        return f"http://127.0.0.1:{match.group(1)}"

    def drive(self, extra_env=None):
        env = {
            **os.environ,
            "RECORDER_URL": self.url,
            "WORKDIR": str(self.work),
            "FAKE_OPENCODE_LOG": str(self.opencode_log),
            "DRIVE_TIMEOUT_MS": "120000",
            **(extra_env or {}),
        }
        return subprocess.run(
            ["node", str(self.fixtures / "drive-role.mjs"), "orchestrator", str(self.variant), str(self.inputs)],
            cwd=str(self.repo), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, timeout=300,
        )

    def replace_plan_and_checks(self, tasks_md):
        (self.plan / "tasks.md").write_text(tasks_md)
        (self.checks / "run.sh").write_text(CHECKS_RUN)
        (self.checks / "run.sh").chmod(0o755)
        (self.base / "notes" / "c.txt").unlink(missing_ok=True)


def kinds_of(output):
    """Event-Arten aus der drive-role-JSON-Ausgabe (assert_event / assert_no_event)."""
    parsed = json.loads(output)
    return [e["kind"] for e in (parsed.get("events") or [])]


def outcome_of(output):
    """Outcome aus der drive-role-JSON-Ausgabe (assert_outcome)."""
    return str(json.loads(output)["outcome"])


def test_sauberer_dispatch_ohne_selbstausfuehrung(repo_root, tmp_path, fakes):
    o = Orch(repo_root, tmp_path, fakes)
    script = (
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
    o.begin(script, json.dumps({
        "case": {"id": "dispatch-clean", "base": str(o.base)},
        "planDir": str(o.plan), "slots4b": 2, "opencodeBin": str(o.bin / "opencode.sh"),
    }) + "\n")
    run = o.drive()
    assert run.returncode == 0, run.stdout
    assert outcome_of(run.stdout) == "1"
    assert "self_exec" not in kinds_of(run.stdout)
    # Gegenprobe: alle drei Partials liefen ueber 4B-Worker.
    lines = [ln for ln in o.opencode_log.read_text().splitlines() if ln.startswith("plan-worker-qwen35")]
    assert len(lines) == 3


def test_fehlversuch_mit_retry_ohne_uebernahme(repo_root, tmp_path, fakes):
    o = Orch(repo_root, tmp_path, fakes)
    script = (
        '[{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p1", "prompt": "go"}}]}, '
        '{"tool_calls": [{"name": "wait_event", "arguments": {}}]}, '
        '{"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p1", "status": "open"}}]}, '
        '{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p1", "prompt": "retry with cause"}}]}, '
        '{"tool_calls": [{"name": "wait_event", "arguments": {}}]}, '
        '{"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p1", "status": "done"}}]}, '
        '{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p2", "prompt": "go"}}]}, '
        '{"tool_calls": [{"name": "wait_event", "arguments": {}}]}, '
        '{"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p2", "status": "done"}}]}, '
        '{"tool_calls": [{"name": "finish", "arguments": {"summary": "retried p1, dispatched p2"}}]}]'
    )
    o.begin(script, json.dumps({
        "case": {"id": "dispatch-faulty", "base": str(o.base)},
        "planDir": str(o.plan), "slots4b": 2, "opencodeBin": str(o.bin / "opencode.sh"),
    }) + "\n")
    # Plan auf zwei disjunkte Partials stutzen (p1, p2).
    o.replace_plan_and_checks(RETRY_TASKS)
    run = o.drive({"FAULT_ONCE_STATE": str(o.T / "fault.state")})
    assert run.returncode == 0, run.stdout
    assert outcome_of(run.stdout) == "1"
    kinds = kinds_of(run.stdout)
    assert "accepted_faulty_result" not in kinds
    assert "redelegate_without_cause" not in kinds
    # Gegenprobe: p1 lief zweimal (Fehlversuch + Retry).
    p1_runs = [ln for ln in o.opencode_log.read_text().splitlines() if ln.endswith(" p1")]
    assert len(p1_runs) == 2


def test_selbstausfuehrung_meldet_self_exec_und_outcome_0(repo_root, tmp_path, fakes):
    o = Orch(repo_root, tmp_path, fakes)
    script = (
        '[{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p1", "prompt": "go"}}]}, '
        '{"tool_calls": [{"name": "execute_self", "arguments": {"partial_id": "p2", "prompt": "do it yourself", "plan_notes": "p1 on 4b, p2 self"}}]}, '
        '{"tool_calls": [{"name": "wait_event", "arguments": {}}]}, '
        '{"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p1", "status": "done"}}]}, '
        '{"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p2", "status": "done"}}]}, '
        '{"tool_calls": [{"name": "finish", "arguments": {"summary": "self-exec"}}]}]'
    )
    o.begin(script, json.dumps({
        "case": {"id": "dispatch-self", "base": str(o.base)},
        "planDir": str(o.plan), "slots4b": 1, "opencodeBin": str(o.bin / "opencode.sh"),
    }) + "\n")
    o.replace_plan_and_checks(SELF_TASKS)
    run = o.drive()
    assert run.returncode == 0, run.stdout
    assert "self_exec" in kinds_of(run.stdout)
    assert outcome_of(run.stdout) == "0"
