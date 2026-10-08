"""Native migration of tests/spec/agent-bench/matrix-cli.bats."""

import hashlib
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

import pytest

BENCH_REL = "scripts/llm/agent-bench/bench.mjs"
FIX_REL = "tests/spec/agent-bench/fixtures"
SNAP_SOLVE = r"printf '#!/usr/bin/env bash\necho fixed\n' > app.sh"
SNAP_SOLVE_TWO = (
    r"printf '#!/usr/bin/env bash\necho fixed\n' > app.sh; "
    r"printf '#!/usr/bin/env bash\necho moin\n' > greet.sh"
)
TASKS_MD = (
    "# Kettenplan\n\n## Partials\n\n"
    "| id | plan | role | target_files | depends_on |\n"
    "| px | px.md | impl | app.sh |"
)


class _Ctx:
    """Per-test state mirroring the BATS helpers (start_fake, stop_fake, T)."""

    def __init__(self, repo_root: Path, tmp_path: Path):
        self.repo = repo_root
        self.fix = repo_root / FIX_REL
        self.bench = repo_root / BENCH_REL
        self.T = tmp_path
        self.fake_proc = None
        self.fake_url = None
        self.runs = tmp_path / "runs"
        self.cases = tmp_path / "cases"
        self.runs.mkdir()
        self.cases.mkdir()
        # mkcases_ok: tiny-eval + tiny-train
        shutil.copytree(self.fix / "cases/tiny-eval", self.cases / "tiny-eval")
        shutil.copytree(self.fix / "cases/tiny-train", self.cases / "tiny-train")

    def start_fake(self, script: str = "", logf: str = ""):
        portfile = self.T / f"fake-{time.monotonic_ns()}.port"
        env = dict(os.environ, FAKE_OPENAI_SCRIPT=script, FAKE_OPENAI_LOG=logf)
        fh = open(portfile, "w")
        self.fake_proc = subprocess.Popen(
            ["node", str(self.fix / "fake-openai.mjs")],
            cwd=str(self.repo), env=env, stdout=fh, stderr=subprocess.STDOUT,
        )
        port = None
        for _ in range(100):
            text = portfile.read_text() if portfile.exists() else ""
            m = re.search(r"FAKE-OPENAI-PORT=(\d+)", text)
            if m:
                port = m.group(1)
                break
            time.sleep(0.05)
        if not port:
            raise RuntimeError(f"fake-openai startete nicht: {portfile.read_text()}")
        self.fake_url = f"http://127.0.0.1:{port}"

    def stop_fake(self):
        if self.fake_proc is not None:
            self.fake_proc.kill()
            self.fake_proc.wait()
        self.fake_proc = None
        self.fake_url = None

    def bench_env(self, runs, cases) -> dict:
        """Standard-Bench-Env fuer `run`: Fakes statt GPU/opencode."""
        runs = Path(runs)
        env = {
            "AGENT_BENCH_RUNS": str(runs),
            "AGENT_BENCH_CASES": str(cases),
            "AGENT_BENCH_MODELS": str(self.fix / "pool.json"),
            "AGENT_BENCH_GPU_LOCK": str(self.fix / "fake-bin/gpu-lock.sh"),
            "AGENT_BENCH_OPENCODE": str(self.fix / "fake-opencode.sh"),
            "AGENT_BENCH_TEACHER_URL": self.fake_url or "http://127.0.0.1:1",
            "FAKE_BIN_LOG": str(runs / "bin.log"),
            "FAKE_OPENCODE_LOG": str(runs / "opencode.log"),
        }
        (runs / "bin.log").write_text("")
        (runs / "opencode.log").write_text("")
        return env

    def run_bench(self, run_cmd, env, *args):
        return run_cmd(["node", str(self.bench), *args], cwd=self.repo, env=env)

    @staticmethod
    def walk_results(d: Path):
        for root, _dirs, files in os.walk(d):
            for name in sorted(files):
                if name == "result.json":
                    yield Path(root) / name


@pytest.fixture
def ctx(repo_root, tmp_path):
    c = _Ctx(repo_root, tmp_path)
    yield c
    c.stop_fake()
    shutil.rmtree(tmp_path, ignore_errors=True)


def _walk_roles(runs: Path):
    return [json.loads(p.read_text())["role"] for p in _Ctx.walk_results(runs)]


def _tasks_script():
    """Ein write_plan-Tool-Call mit dem Standard-Kettenplan."""
    return {"tool_calls": [{"name": "write_plan", "arguments": {
        "tasks_md": TASKS_MD,
        "partials": [{"id": "px", "text": "tun"}],
    }}]}


def test_only_selected_roles_are_measured(run_cmd, ctx):
    env = ctx.bench_env(ctx.runs, ctx.cases)
    env.update({"FAKE_OPENCODE_SOLVE": "1", "FAKE_OPENCODE_SNAP": SNAP_SOLVE})
    res = ctx.run_bench(run_cmd, env, "run", "--profile", "quick", "--roles", "code-worker",
                        "--models", "qwen3-4b", "--cases", "tiny-eval")
    assert re.search(r"^AGENT-BENCH: ", res.output, re.M)
    roles = sorted(_walk_roles(ctx.runs))
    assert ",".join(roles) == "code-worker"


def test_unknown_role_is_refused(run_cmd, ctx):
    env = ctx.bench_env(ctx.runs, ctx.cases)
    res = ctx.run_bench(run_cmd, env, "run", "--profile", "quick", "--roles", "planer",
                        "--models", "qwen3-4b")
    assert res.returncode == 2
    # Positiv-Anker: die Fehlermeldung nennt den falschen Namen und die Auswahl.
    assert "planer" in res.output
    assert "planner" in res.output
    # ... und zwar bevor irgendetwas geladen wurde: kein gpu-lock-Aufruf.
    bin_log = ctx.runs / "bin.log"
    assert not bin_log.exists() or bin_log.stat().st_size == 0


def test_worker_is_measured_on_the_reference_partial(run_cmd, ctx):
    env = ctx.bench_env(ctx.runs, ctx.cases)
    env.update({"FAKE_OPENCODE_SOLVE": "1", "FAKE_OPENCODE_SNAP": SNAP_SOLVE})
    res = ctx.run_bench(run_cmd, env, "run", "--profile", "quick", "--roles", "code-worker",
                        "--models", "qwen3-4b", "--cases", "tiny-eval:v1", "--mode", "isolated")
    assert re.search(r"^AGENT-BENCH: ", res.output, re.M)
    opencode_log = Path(env["FAKE_OPENCODE_LOG"])
    assert opencode_log.stat().st_size > 0
    assert "REFERENZ-PARTIAL-MARKER-V1" in opencode_log.read_text()


def test_chained_mode_passes_the_real_plan(run_cmd, ctx):
    ctx.start_fake(json.dumps([{"tool_calls": [{"name": "write_plan", "arguments": {
        "tasks_md": TASKS_MD,
        "partials": [{"id": "px", "text": "KETTEN-PLAN-MARKER wirklich tun"}],
    }}]}]))
    env = ctx.bench_env(ctx.runs, ctx.cases)
    env.update({"FAKE_OPENCODE_SOLVE": "1", "FAKE_OPENCODE_SNAP": SNAP_SOLVE})
    res = ctx.run_bench(run_cmd, env, "run", "--profile", "quick", "--roles", "planner,code-worker",
                        "--models", "qwen3-4b", "--cases", "tiny-eval:v1", "--mode", "chained")
    assert re.search(r"^AGENT-BENCH: ", res.output, re.M)
    text = Path(env["FAKE_OPENCODE_LOG"]).read_text()
    assert "KETTEN-PLAN-MARKER" in text
    assert text.count("REFERENZ-PARTIAL-MARKER-V1") == 0
    # In der Kette ist der Planner-Outcome das Execute-Mittel (hier 1).
    plan_outcome = None
    for p in _Ctx.walk_results(ctx.runs):
        j = json.loads(p.read_text())
        if j.get("role") == "planner":
            plan_outcome = j["score"]["outcome"]
            break
    assert str(plan_outcome) == "1"


def test_plans_are_reused_across_executors(run_cmd, ctx):
    w = _tasks_script()
    ctx.start_fake(json.dumps([w, {"content": "fertig"}, w, {"content": "fertig"}]))
    env = ctx.bench_env(ctx.runs, ctx.cases)
    env.update({"FAKE_OPENCODE_SOLVE": "1", "FAKE_OPENCODE_SNAP": SNAP_SOLVE})
    res = ctx.run_bench(run_cmd, env, "run", "--profile", "quick", "--roles", "planner,code-worker",
                        "--models", "qwen3-4b,qwen38-27b", "--cases", "tiny-eval:v1", "--mode", "chained")
    assert re.search(r"^AGENT-BENCH: ", res.output, re.M)
    roles = _walk_roles(ctx.runs)
    counts = f"{roles.count('planner')}/{roles.count('code-worker')}"
    # 2 Planer schreiben je 1 Plan; 2 Plaene x 2 Worker-Paare = 4 Laeufe.
    assert counts == "2/4"


def test_vision_role_skips_models_without_vision(run_cmd, ctx):
    ctx.start_fake(json.dumps([{"content": json.dumps({"fields": {"boxes": "3"}})}]))
    env = ctx.bench_env(ctx.runs, ctx.cases)
    res = ctx.run_bench(run_cmd, env, "run", "--profile", "quick", "--roles", "vision-worker",
                        "--models", "qwen38-27b,qwen3-4b,gemma4-12b-nvfp4", "--cases", "tiny-eval:v4")
    assert re.search(r"^AGENT-BENCH: ", res.output, re.M)
    models = sorted(json.loads(p.read_text())["model"] for p in _Ctx.walk_results(ctx.runs))
    assert ",".join(models) == "gemma4-12b-nvfp4"


def test_resume_skips_completed_stages(run_cmd, ctx):
    ctx.start_fake(json.dumps([_tasks_script()]))
    env = ctx.bench_env(ctx.runs, ctx.cases)
    env.update({"FAKE_OPENCODE_SOLVE": "1", "FAKE_OPENCODE_SNAP": SNAP_SOLVE})
    res = ctx.run_bench(run_cmd, env, "run", "--profile", "quick", "--roles", "planner,code-worker",
                        "--models", "qwen3-4b", "--cases", "tiny-eval:v1", "--mode", "chained")
    assert re.search(r"^AGENT-BENCH: ", res.output, re.M)
    m = re.search(r"run=(\S*)", res.output)
    assert m and m.group(1)
    run_id = m.group(1)
    run_dir = ctx.runs / run_id

    def _find(role):
        for p in _Ctx.walk_results(run_dir):
            if re.search(r'"role": *"%s"' % role, p.read_text()):
                return p
        return None

    plan_json = _find("planner")
    assert plan_json is not None
    before = hashlib.sha256(plan_json.read_bytes()).hexdigest()
    exec_json = _find("code-worker")
    assert exec_json is not None
    exec_json.unlink()
    res = ctx.run_bench(run_cmd, env, "resume", run_id)
    assert re.search(r"^AGENT-BENCH: ", res.output, re.M)
    assert exec_json.is_file()
    after = hashlib.sha256(plan_json.read_bytes()).hexdigest()
    assert before == after


def test_split_filter_selects_train_cases(run_cmd, ctx):
    env = ctx.bench_env(ctx.runs, ctx.cases)
    env.update({"FAKE_OPENCODE_SOLVE": "1", "FAKE_OPENCODE_SNAP": SNAP_SOLVE_TWO})
    res = ctx.run_bench(run_cmd, env, "run", "--profile", "quick", "--roles", "code-worker",
                        "--models", "qwen3-4b", "--split", "train")
    assert re.search(r"^AGENT-BENCH: ", res.output, re.M)
    cases = set()
    for p in _Ctx.walk_results(ctx.runs):
        cases.add(json.loads(p.read_text())["case"])
    assert ",".join(sorted(cases)) == "tiny-train"
