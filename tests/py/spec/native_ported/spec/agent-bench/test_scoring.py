"""Native migration of tests/spec/agent-bench/scoring.bats."""
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

import pytest


@pytest.fixture
def fakes():
    """Track fake-openai servers started by a test and stop them on teardown."""
    procs = []
    yield procs
    for proc in procs:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=10)


def start_fake(repo_root, tmp_path, fakes, script="", logf=""):
    """Start fake-openai; return (proc, base URL) (start_fake in helpers.bash)."""
    fixtures = repo_root / "tests/spec/agent-bench/fixtures"
    portfile = tmp_path / f"fake-{len(fakes)}.port"
    env = {**os.environ, "FAKE_OPENAI_SCRIPT": script, "FAKE_OPENAI_LOG": logf}
    with open(portfile, "w") as fh:
        proc = subprocess.Popen(
            ["node", str(fixtures / "fake-openai.mjs")],
            stdout=fh,
            stderr=subprocess.STDOUT,
            env=env,
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
    return proc, f"http://127.0.0.1:{match.group(1)}"


def node_module(repo_root, snippet):
    """Run an ESM snippet with node -e (the bats run node --input-type=module -e)."""
    return subprocess.run(
        ["node", "--input-type=module", "-e", snippet],
        cwd=str(repo_root),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=300,
    )


def scoring_prelude(repo_root):
    lib = repo_root / "scripts/llm/agent-bench/lib"
    scoring_json = repo_root / "scripts/llm/agent-bench/scoring.json"
    return (
        f"import {{ scoreRun, loadScoringConfig }} from '{lib}/scoring.mjs';\n"
        f"const cfg = loadScoringConfig(new URL('file://{scoring_json}'));\n"
    )


def test_same_trace_yields_same_score(repo_root):
    snippet = scoring_prelude(repo_root) + (
        "const input = { role: 'code-worker', outcome: 1, events: [{ kind: 'out_of_scope_file' }], usage: { total_tokens: 1000 }, budget: { tokens: 2000 } };\n"
        "const a = scoreRun(input, cfg);\n"
        "const b = scoreRun(input, cfg);\n"
        "console.log(JSON.stringify(a) === JSON.stringify(b) ? 'IDENTICAL' : 'DIFFERENT');\n"
        "console.log('score=' + a.score);\n"
    )
    run = node_module(repo_root, snippet)
    assert run.returncode == 0, run.stdout
    assert "IDENTICAL" in run.stdout
    assert "score=" in run.stdout


def test_detour_lowers_the_score(repo_root):
    snippet = scoring_prelude(repo_root) + (
        "const base = { role: 'code-worker', outcome: 1, events: [], usage: { total_tokens: 1000 }, budget: { tokens: 2000 } };\n"
        "const clean = scoreRun(base, cfg);\n"
        "const dirty = scoreRun({ ...base, events: [{ kind: 'out_of_scope_file' }] }, cfg);\n"
        "console.log('clean=' + clean.score + ' detours=' + clean.detours);\n"
        "console.log('dirty=' + dirty.score + ' detours=' + dirty.detours);\n"
        "console.log(dirty.detours > clean.detours && dirty.score < clean.score ? 'DETOUR-LOWERS' : 'NO-EFFECT');\n"
    )
    run = node_module(repo_root, snippet)
    assert run.returncode == 0, run.stdout
    assert "DETOUR-LOWERS" in run.stdout


def test_ambiguous_variant_requires_a_clarification(repo_root, tmp_path, fakes):
    fixtures = repo_root / "tests/spec/agent-bench/fixtures"
    variant = tmp_path / "variant.json"
    variant.write_text(
        '{"dir": "/tmp", "briefPath": "/tmp/nonexistent-brief.md", '
        '"budget": {"tokens": 2000, "turns": 1}, "expected_decision": "clarify"}\n'
    )
    work = tmp_path / "work"
    inputs = tmp_path / "inputs.json"
    inputs.write_text(
        '{"case": {"source": "fixture"}, "sandbox": "/tmp", "plannerModel": "fake"}\n'
    )

    def drive(url):
        return subprocess.run(
            ["node", str(fixtures / "drive-role.mjs"), "planner", str(variant), str(inputs)],
            cwd=str(repo_root),
            env={**os.environ, "RECORDER_URL": url, "WORKDIR": str(work), "DRIVE_TIMEOUT_MS": "30000"},
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=300,
        )

    # Erster Lauf: Planner schreibt, statt zu fragen -> clarify_miss, outcome 0.
    proc, url = start_fake(
        repo_root, tmp_path, fakes,
        script='[{"tool_calls": [{"name": "write_plan", "arguments": {"tasks_md": "# x", "partials": []}}]}]',
    )
    run = drive(url)
    proc.kill()
    assert run.returncode == 0, run.stdout
    assert str(json.loads(run.stdout)["outcome"]) == "0"
    assert "clarify_miss" in run.stdout

    # Gegenprobe: wer fragt, bekommt outcome 1.
    proc2, url2 = start_fake(
        repo_root, tmp_path, fakes,
        script='[{"tool_calls": [{"name": "ask_clarification", "arguments": {"question": "A oder B?"}}]}]',
    )
    run2 = drive(url2)
    proc2.kill()
    assert run2.returncode == 0, run2.stdout
    assert str(json.loads(run2.stdout)["outcome"]) == "1"


def test_false_pass_weighs_more_than_false_fail(repo_root):
    snippet = scoring_prelude(repo_root) + (
        "const base = { role: 'reviewer', outcome: 1, usage: { total_tokens: 100 }, budget: { tokens: 2000 } };\n"
        "const pass = scoreRun({ ...base, events: [{ kind: 'false_pass' }] }, cfg);\n"
        "const fail = scoreRun({ ...base, events: [{ kind: 'false_fail' }] }, cfg);\n"
        "console.log('false_pass=' + pass.score + ' false_fail=' + fail.score);\n"
        "console.log(pass.score < fail.score ? 'PASS-WEIGHS-MORE' : 'EQUAL');\n"
    )
    run = node_module(repo_root, snippet)
    assert run.returncode == 0, run.stdout
    assert "PASS-WEIGHS-MORE" in run.stdout


def bench_env(repo_root, runs, cases, fake_url=None):
    """Standard-Bench-Env aus helpers.bash (bench_env)."""
    fixtures = repo_root / "tests/spec/agent-bench/fixtures"
    runs.mkdir(parents=True, exist_ok=True)
    env = {
        **os.environ,
        "AGENT_BENCH_RUNS": str(runs),
        "AGENT_BENCH_CASES": str(cases),
        "AGENT_BENCH_MODELS": str(fixtures / "pool.json"),
        "AGENT_BENCH_GPU_LOCK": str(fixtures / "fake-bin/gpu-lock.sh"),
        "AGENT_BENCH_OPENCODE": str(fixtures / "fake-opencode.sh"),
        "AGENT_BENCH_TEACHER_URL": fake_url or "http://127.0.0.1:1",
        "FAKE_BIN_LOG": str(runs / "bin.log"),
        "FAKE_OPENCODE_LOG": str(runs / "opencode.log"),
    }
    for name in ("bin.log", "opencode.log"):
        (runs / name).write_text("")
    return env


def test_case_without_source_event_is_rejected(repo_root, tmp_path):
    fixtures = repo_root / "tests/spec/agent-bench/fixtures"
    lib = repo_root / "scripts/llm/agent-bench/lib"
    # Ebene 1: der Loader nennt den Fall.
    snippet = (
        f"import {{ validateCases }} from '{lib}/cases.mjs';\n"
        f"const r = validateCases('{fixtures}/cases');\n"
        "console.log(r.ok ? 'VALID' : 'INVALID');\n"
        "for (const e of r.errors) console.log(e.caseId + ': ' + e.message);\n"
    )
    run = node_module(repo_root, snippet)
    assert run.returncode == 0, run.stdout
    assert "INVALID" in run.stdout
    assert "no-source" in run.stdout

    # Ebene 2: der Bench bricht mit Konfigurationsfehler ab und nennt den Fall.
    runs = tmp_path / "runs"
    cases = tmp_path / "cases"
    cases.mkdir(parents=True)
    shutil.copytree(fixtures / "cases/tiny-eval", cases / "tiny-eval")
    shutil.copytree(fixtures / "cases/no-source", cases / "no-source")
    env = bench_env(repo_root, runs, cases)
    run2 = subprocess.run(
        ["node", str(repo_root / "scripts/llm/agent-bench/bench.mjs"), "run",
         "--profile", "quick", "--roles", "code-worker", "--models", "qwen3-4b"],
        cwd=str(repo_root), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, timeout=300,
    )
    assert run2.returncode == 2, run2.stdout
    assert "no-source" in run2.stdout


def test_new_case_needs_no_code_change(repo_root, tmp_path, fakes):
    fixtures = repo_root / "tests/spec/agent-bench/fixtures"
    proc, url = start_fake(
        repo_root, tmp_path, fakes,
        script=r'[{"content": "{\"verdict\": \"pass\", \"reason\": \"sauber\", \"location\": \"app.sh:1\"}"}]',
    )
    runs = tmp_path / "runs"
    cases = tmp_path / "cases"
    cases.mkdir(parents=True)
    shutil.copytree(fixtures / "cases/tiny-eval", cases / "fresh-case")
    env = bench_env(repo_root, runs, cases, fake_url=url)
    run = subprocess.run(
        ["node", str(repo_root / "scripts/llm/agent-bench/bench.mjs"), "run",
         "--profile", "quick", "--roles", "reviewer", "--models", "qwen3-4b", "--cases", "fresh-case:v3"],
        cwd=str(repo_root), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, timeout=300,
    )
    proc.kill()
    assert re.search(r"^AGENT-BENCH: ", run.stdout, re.M), run.stdout
    found = [str(p) for p in Path(runs).rglob("result.json")][:5]
    assert found, "no result.json written"
    assert any("fresh-case" in f for f in found), found
