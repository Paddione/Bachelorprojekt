"""Native migration of tests/spec/local-llm-proxy/gemma-kv-quant.bats."""

import json
import os
import subprocess

import pytest

KV_Q4_ALLOWED = {"gemma26-factory", "gemma4", "gemma26-throughput", "qwen38-220k"}

ARGV_JS = """
    import { readFileSync } from 'node:fs';
    const { buildServerArgv } = await import('file://REPO/scripts/llm-proxy/runner.mjs');
    const d = JSON.parse(readFileSync('LOADOUTS', 'utf8'));
    const defaults = { host: '127.0.0.1' };
    for (const l of d.loadouts) {
      if (l.exclusiveGroup !== 'chat-gpu') continue;
      const argv = buildServerArgv(l, '/models/x.gguf', defaults, {});
      const val = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : '-'; };
      console.log([l.slug, val('-ctk'), val('-ctv'), val('-fa')].join(' '));
    }
"""

LONG_NEEDLES = [
    ".agents/plans/fix-korczewski-zero-replicas-T002539/tasks.md",
    "kustomize build prod-fleet/korczewski --load-restrictor=LoadRestrictionsNone",
    "function buildServerArgv(loadout, modelPath, defaults, overrides)",
    "oci://ghcr.io/paddione/fleet-manifests:latest",
    "/usr/local/bin/kustomize",
    "--ctx-size 99328 --cache-type-k q4_0 -fa on",
]


def _argv_facts(run_cmd, repo_root):
    js = ARGV_JS.replace("REPO", str(repo_root)).replace("LOADOUTS", str(repo_root / "scripts/llm/loadouts.json"))
    res = run_cmd(["node", "--input-type=module", "-e", js], cwd=repo_root)
    return res


def _rows(res):
    return [l.split() for l in res.output.splitlines() if l.strip()]


def test_gemma_kv_quant_gpu_chat_loadouts_existieren_und_erzeugen_ueberhaupt_eine_kv_quantisierung(run_cmd, repo_root):
    res = _argv_facts(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    rows = _rows(res)
    assert rows, "keine GPU-Chat-Loadouts"
    n_total = len(rows)
    n_with_ctk = sum(1 for r in rows if len(r) > 1 and r[1] != "-")
    assert n_total >= 2
    assert n_with_ctk >= 1
    assert any(r[0] == "gemma26-factory" for r in rows)


def test_gemma_kv_quant_nur_ausdruecklich_ausgenommene_gpu_chat_loadouts_starten_mit_q4_0_kv(run_cmd, repo_root):
    res = _argv_facts(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    offenders = sorted({r[0] for r in _rows(res) if (len(r) > 2 and (r[1] == "q4_0" or r[2] == "q4_0"))} - KV_Q4_ALLOWED)
    assert not offenders, f"unerlaubte q4_0-Loadouts: {' '.join(offenders)}"


def test_gemma_kv_quant_die_q4_0_ausnahme_ist_wirksam_und_nicht_bloss_deklariert(run_cmd, repo_root):
    res = _argv_facts(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    assert any(len(r) > 2 and r[0] == "gemma26-factory" and r[1] == "q4_0" and r[2] == "q4_0" for r in _rows(res))


def test_gemma_kv_quant_quantisierter_kv_cache_zieht_flashattention_nach_sich(run_cmd, repo_root):
    res = _argv_facts(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    broken = [r[0] for r in _rows(res) if len(r) > 3 and r[1] in ("q8_0", "q4_0") and r[3] != "on"]
    assert not broken, f"quantisiert ohne -fa on: {' '.join(broken)}"


def test_gemma_kv_quant_t002535_langkontext_probe_q4_0_kv_gibt_exakte_zeichenketten_nach_39k_tokens_zurueck(run_cmd, repo_root, tmp_path):
    loadouts = json.loads((repo_root / "scripts/llm/loadouts.json").read_text(encoding="utf-8"))
    matches = [x for x in loadouts["loadouts"] if x.get("slug") == "gemma26-factory"]
    port = matches[0].get("port", "") if matches else ""
    if not port:
        pytest.fail("kein gemma26-factory-Loadout in loadouts.json")
    llm_url = os.environ.get("LLM_URL") or f"http://127.0.0.1:{port}/v1/chat/completions"

    health = run_cmd(
        ["bash", "-c", f'source "{repo_root}/tests/spec/local-llm-proxy/helpers/llm-endpoint.bash"; '
                       f'llm_endpoint_healthy "http://127.0.0.1:{port}/health"'],
        cwd=repo_root,
    )
    if health.returncode != 0:
        pytest.skip(f"gemma26-factory auf :{port} nicht verfuegbar (HTTP {health.stdout.strip() or '000'})")

    filler = "Der schnelle braune Fuchs springt über den faulen Hund. "
    full_filler = filler * 2800
    prompt = (
        "Merke dir die folgenden sechs exakten Zeichenketten wörtlich:\n"
        + "".join(f"{i}. {n}\n" for i, n in enumerate(LONG_NEEDLES, 1))
        + "\n" + full_filler + "\n\n"
        + "Gib jetzt die sechs Zeichenketten exakt so zurück wie oben, eine pro Zeile:\n1. "
    )
    prompt_file = tmp_path / "kv-probe-prompt.txt"
    prompt_file.write_text(prompt, encoding="utf-8")
    payload_file = tmp_path / "kv-probe-payload.json"
    payload_file.write_text(json.dumps({
        "model": "gemma26-factory",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 900,
        "chat_template_kwargs": {"enable_thinking": False},
    }, ensure_ascii=False), encoding="utf-8")

    passes = 0
    runs = 5
    for run in range(1, runs + 1):
        res = run_cmd(
            ["curl", "-s", "--max-time", "600", llm_url, "-H", "Content-Type: application/json",
             "-d", f"@{payload_file}"],
            cwd=repo_root, timeout=700,
        )
        raw = res.stdout
        try:
            body = json.loads(raw)
        except ValueError:
            body = {}
        ptok = 0
        if isinstance(body, dict):
            ptok = (body.get("usage") or {}).get("prompt_tokens") or 0
        if ptok < 20000:
            pytest.fail(
                f"UNGUELTIG: nur {ptok} Prompt-Tokens — Langkontext nicht erreicht.\n"
                "Die Probe misst dann nicht, was sie messen soll."
            )
        content = ""
        finish = "?"
        if isinstance(body, dict) and body.get("choices"):
            content = (body["choices"][0].get("message") or {}).get("content") or ""
            finish = body["choices"][0].get("finish_reason") or "?"
        if not content:
            print(f"Lauf {run}/{runs}: LEERE ANTWORT (finish_reason={finish})")
            continue
        ok = all(n in content for n in LONG_NEEDLES)
        if ok:
            passes += 1
        print(f"Lauf {run}/{runs} ({ptok} Tokens): {'BESTANDEN' if ok else 'FEHLER'}")

    assert passes >= 3, (
        f"FEHLER: gemma26-factory mit q4_0-KV versagt im Langkontext ({passes}/{runs})\n"
        "→ q8_0 zurücksetzen und Ausnahme in KV_Q4_ALLOWED entfernen."
    )
