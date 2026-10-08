"""Native migration of tests/spec/unsloth-training-env/measure-corpus.bats."""

import json
import os

import pytest

CORPUS = (
    '{"messages": [{"role": "user", "content": "Wie deploye ich die Website?"}, {"role": "assistant", "content": "Nutze task workspace:deploy ENV=mentolder."}]}\n'
    '{"messages": [{"role": "user", "content": "Was ist ein SealedSecret?"}, {"role": "assistant", "content": "Ein verschluesseltes Kubernetes-Secret, das im Repo committet werden darf."}]}\n'
    '{"messages": [{"role": "user", "content": "Erklaere Flux."}, {"role": "assistant", "content": "Flux reconciled das Cluster pull-based gegen ein OCI-Artefakt aus main."}]}\n'
)

TEMPLATE = (
    "{%- for message in messages -%}\n"
    "<start_of_turn>{{ message['role'] }}\n"
    "{{ message['content'] }}<end_of_turn>\n"
    "{% endfor -%}\n"
    "{%- if add_generation_prompt -%}\n"
    "<start_of_turn>model\n"
    "{%- endif -%}\n"
)


@pytest.fixture
def mc(repo_root, tmp_path):
    """BATS setup(): mini corpus, template and output paths in tmp_path."""
    corpus = tmp_path / "mini_corpus.jsonl"
    corpus.write_text(CORPUS)
    template = tmp_path / "template.jinja"
    template.write_text(TEMPLATE)
    return {"script": str(repo_root / "scripts" / "finetune" / "measure_corpus.py"),
            "corpus": str(corpus), "template": str(template), "out": str(tmp_path / "report.json")}


def test_measure_corpus_messlauf_gegen_mini_korpus_liefert_json_mit_allen_perzentilen(run_cmd, mc):
    r = run_cmd(["python3", mc["script"], "--corpus", mc["corpus"], "--model", "demo-model",
                 "--template-file", mc["template"], "--out", mc["out"]])
    assert r.returncode == 0
    assert os.path.isfile(mc["out"])
    with open(mc["out"]) as fh:
        d = json.load(fh)
    for k in ("median", "p90", "p95", "p99", "max"):
        assert k in d["lengths"], k
    assert isinstance(d["candidates"], list) and len(d["candidates"]) > 0
    assert "feasibility" in d


def test_measure_corpus_trainingsstart_ohne_messbericht_bricht_mit_exit_ungleich_null_ab(run_cmd, mc):
    r = run_cmd(["python3", mc["script"], "--corpus", mc["corpus"], "--model", "demo-model",
                 "--template-file", mc["template"], "--out", mc["out"]])
    assert r.returncode == 0
    r = run_cmd(["python3", mc["script"], "--check-report", mc["out"]])
    assert r.returncode == 0

    missing = mc["out"] + ".does-not-exist.json"
    r = run_cmd(["python3", mc["script"], "--check-report", missing])
    assert r.returncode != 0
