"""Native migration of tests/spec/agent-bench/report-corpus.bats."""

import base64
import json
import re
from pathlib import Path

import pytest

BENCH_REL = "scripts/llm/agent-bench/bench.mjs"
FIX_REL = "tests/spec/agent-bench/fixtures"
PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
SPLIT_EVAL = "eval"


@pytest.fixture
def env_ctx(repo_root, tmp_path):
    """Setup-Aequivalent: T, $T/runs, AGENT_BENCH_RUNS."""
    t = tmp_path
    runs = t / "runs"
    runs.mkdir()
    return {
        "repo": repo_root,
        "fix": repo_root / FIX_REL,
        "bench": repo_root / BENCH_REL,
        "T": t,
        "runs": runs,
        "env": {"AGENT_BENCH_RUNS": str(runs)},
    }


def _bench(run_cmd, c, *args):
    return run_cmd(["node", str(c["bench"]), *args], cwd=c["repo"], env=c["env"])


def _helper(run_cmd, c, name, *args):
    """Aufruf eines Fixture-Skripts; entspricht `set -e` im BATS-Setup."""
    res = run_cmd([str(c["fix"] / name), *[str(a) for a in args]], cwd=c["repo"])
    res.check(0)
    return res


def _mkmanifest(d: Path, run_id, version, cases_json):
    d.mkdir(parents=True, exist_ok=True)
    cases = json.loads(cases_json)
    manifest = {
        "run_id": run_id,
        "revision": "abc123",
        "scoring_version": version,
        "profile": "quick",
        "seed": 7,
        "sampled": False,
        "repetitions": 1,
        "command": "node scripts/llm/agent-bench/bench.mjs run --profile quick",
        "servers": [{"id": "m-a", "engine": "api", "command": "fake"}],
        "cases": cases,
    }
    (d / "manifest.json").write_text(json.dumps(manifest) + "\n")


def _case(cid, split, source_ref="T1", variants=("v1",)):
    return json.dumps([{"id": cid, "split": split, "source_ref": source_ref, "variants": list(variants)}])


def _marginal(output: str) -> str:
    """awk '/## Marginal/,/## Kompatibilitaet/' — inklusive Start- und Endzeile."""
    out, inside = [], False
    for line in output.splitlines():
        if not inside and re.search(r"## Marginal", line):
            inside = True
        if inside:
            out.append(line)
            if re.search(r"## Kompatibilitaet", line):
                break
    return "\n".join(out)


def test_infrastructure_error_is_not_blamed_on_the_model(run_cmd, env_ctx):
    c = env_ctx
    r = c["runs"] / "run-infra"
    _mkmanifest(r, "run-infra", 1, _case("f1", SPLIT_EVAL))
    _helper(run_cmd, c, "mkresult.sh", r / "runs/f1__v1__code-worker__m-a__0", "f1", "v1", "code-worker", "m-a", 0, "eval", 80)
    _helper(run_cmd, c, "mkresult.sh", r / "runs/f1__v1__code-worker__m-b__0", "f1", "v1", "code-worker", "m-b", 0, "eval", 0, 0, 0, 0, "server crashed during run")
    res = _bench(run_cmd, c, "report", "run-infra")
    assert res.returncode == 0
    # Positiv-Anker: der bewertete Lauf steht im Marginal, der Infra-Fehler separat.
    assert "server crashed during run" in res.output
    assert "| code-worker | m-a | 80.0 |" in res.output
    marginal = _marginal(res.output)
    assert "| code-worker | m-b |" not in marginal


def test_mixed_combination_is_highlighted(run_cmd, env_ctx):
    c = env_ctx
    r = c["runs"] / "run-mixed"
    _mkmanifest(r, "run-mixed", 1, _case("f1", SPLIT_EVAL))
    _helper(run_cmd, c, "mkresult.sh", r / "runs/f1__v1__planner__m-a__0", "f1", "v1", "planner", "m-a", 0, "eval", 80)
    _helper(run_cmd, c, "mkresult.sh", r / "runs/f1__v1__planner__m-b__0", "f1", "v1", "planner", "m-b", 0, "eval", 50)
    _helper(run_cmd, c, "mkresult.sh", r / "runs/f1__v1__code-worker__m-a__0", "f1", "v1", "code-worker", "m-a", 0, "eval", 50)
    _helper(run_cmd, c, "mkresult.sh", r / "runs/f1__v1__code-worker__m-b__0", "f1", "v1", "code-worker", "m-b", 0, "eval", 70)
    res = _bench(run_cmd, c, "report", "run-mixed")
    assert res.returncode == 0
    assert "m-a` + `m-b" in res.output


def test_regression_fails_the_gate(run_cmd, env_ctx):
    c = env_ctx
    b = c["runs"] / "run-base"
    n = c["runs"] / "run-reg"
    _mkmanifest(b, "run-base", 1, _case("f1", SPLIT_EVAL))
    _mkmanifest(n, "run-reg", 1, _case("f1", SPLIT_EVAL))
    _helper(run_cmd, c, "mkresult.sh", b / "runs/f1__v1__orchestrator__m-a__0", "f1", "v1", "orchestrator", "m-a", 0, "eval", 80)
    _helper(run_cmd, c, "mkresult.sh", b / "runs/f1__v1__orchestrator__m-a__1", "f1", "v1", "orchestrator", "m-a", 1, "eval", 82)
    _helper(run_cmd, c, "mkresult.sh", b / "runs/f1__v1__code-worker__m-a__0", "f1", "v1", "code-worker", "m-a", 0, "eval", 70)
    _helper(run_cmd, c, "mkresult.sh", n / "runs/f1__v1__orchestrator__m-a__0", "f1", "v1", "orchestrator", "m-a", 0, "eval", 60)
    _helper(run_cmd, c, "mkresult.sh", n / "runs/f1__v1__code-worker__m-a__0", "f1", "v1", "code-worker", "m-a", 0, "eval", 70)
    res = _bench(run_cmd, c, "gate", "run-reg", "--baseline", "run-base")
    assert res.returncode == 1
    assert "orchestrator" in res.output
    # Gegenprobe: kein Einbruch, kein Alarm.
    res = _bench(run_cmd, c, "gate", "run-base", "--baseline", "run-base")
    assert res.returncode == 0


def test_mismatched_scoring_version_is_refused(run_cmd, env_ctx):
    c = env_ctx
    b = c["runs"] / "run-base"
    n = c["runs"] / "run-v2"
    _mkmanifest(b, "run-base", 1, _case("f1", SPLIT_EVAL))
    _mkmanifest(n, "run-v2", 2, _case("f1", SPLIT_EVAL))
    _helper(run_cmd, c, "mkresult.sh", b / "runs/f1__v1__orchestrator__m-a__0", "f1", "v1", "orchestrator", "m-a", 0, "eval", 80)
    _helper(run_cmd, c, "mkresult.sh", n / "runs/f1__v1__orchestrator__m-a__0", "f1", "v1", "orchestrator", "m-a", 0, "eval", 80)
    res = _bench(run_cmd, c, "gate", "run-v2", "--baseline", "run-base")
    assert res.returncode == 2
    assert "mismatch" in res.output


def test_eval_cases_never_reach_the_corpus(run_cmd, env_ctx):
    c = env_ctx
    r = c["runs"] / "run-corpus"
    _mkmanifest(r, "run-corpus", 1, json.dumps([
        {"id": "f-train", "split": "train", "source_ref": "T1", "variants": ["v1"]},
        {"id": "f-eval", "split": "eval", "source_ref": "T2", "variants": ["v1"]},
    ]))
    good = r / "runs/f-train__v1__code-worker__m-a__0"
    _helper(run_cmd, c, "mkresult.sh", good, "f-train", "v1", "code-worker", "m-a", 0, "train", 100, 1, 0, 0)
    _helper(run_cmd, c, "mktrace.sh", good, "code-worker", "tu es", "getan")
    good.mkdir(parents=True, exist_ok=True)
    (good / "abc.png").write_bytes(base64.b64decode(PNG_B64))
    _helper(run_cmd, c, "mktrace.sh", good, "code-worker", "und das Bild", "gesehen",
            '[{"sha256": "abc", "mime": "image/png", "file": "abc.png"}]')
    bad = r / "runs/f-train__v1__code-worker__m-a__1"
    _helper(run_cmd, c, "mkresult.sh", bad, "f-train", "v1", "code-worker", "m-a", 1, "train", 20, 0.2, 0, 0)
    _helper(run_cmd, c, "mktrace.sh", bad, "code-worker", "tu es", "versagt")
    evil = r / "runs/f-eval__v1__code-worker__m-a__0"
    _helper(run_cmd, c, "mkresult.sh", evil, "f-eval", "v1", "code-worker", "m-a", 0, "eval", 100, 1, 0, 0)
    _helper(run_cmd, c, "mktrace.sh", evil, "code-worker", "tu es", "getan-eval")
    corpus = c["T"] / "corpus"
    res = _bench(run_cmd, c, "export-corpus", "run-corpus", "--out", str(corpus))
    assert res.returncode == 0
    assert "sft=1" in res.output
    assert "preferences=1" in res.output
    # Positiv-Anker: die Train-Trajektorie ist drin, mit Bild im Korpus.
    assert "f-train" in (corpus / "sft.jsonl").read_text()
    assert (corpus / "images/abc.png").is_file()
    leaked = any(
        "f-eval" in (corpus / f).read_text()
        for f in ("sft.jsonl", "preferences.jsonl")
        if (corpus / f).exists()
    )
    assert not leaked


def test_trajectory_with_a_detour_is_not_exported_as_ideal(run_cmd, env_ctx):
    c = env_ctx
    r = c["runs"] / "run-gaps"
    _mkmanifest(r, "run-gaps", 1, _case("f-train", "train"))
    d = r / "runs/f-train__v1__reviewer__m-a__0"
    _helper(run_cmd, c, "mkresult.sh", d, "f-train", "v1", "reviewer", "m-a", 0, "train", 92, 1, 0, 1)
    _helper(run_cmd, c, "mktrace.sh", d, "reviewer", "pruefe", "ok")
    corpus2 = c["T"] / "corpus2"
    res = _bench(run_cmd, c, "export-corpus", "run-gaps", "--out", str(corpus2))
    assert res.returncode == 0
    # Positiv-Anker: die Luecke ist namentlich verzeichnet ...
    gaps = (corpus2 / "gaps.json").read_text()
    assert "reviewer" in gaps
    assert "f-train" in gaps
    # ... und die SFT-Datei bleibt leer.
    sft = corpus2 / "sft.jsonl"
    assert not sft.exists() or sft.stat().st_size == 0
