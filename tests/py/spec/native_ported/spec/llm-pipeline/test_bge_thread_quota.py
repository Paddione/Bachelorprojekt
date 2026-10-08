"""Native migration of tests/spec/llm-pipeline/bge-thread-quota.bats."""

import os
import subprocess

import pytest


def _proc(args):
    """Prozessaufruf mit stdin=/dev/null; stderr wird wie im BATS-Original verworfen (2>/dev/null)."""
    return subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=300)


@pytest.fixture(scope="module")
def rendered(repo_root, tmp_path_factory):
    """setup_file: kubectl kustomize k3d/ > RENDERED (Fehler -> leere Datei)."""
    repo = repo_root
    out = tmp_path_factory.mktemp("bge-thread") / "k3d-rendered.yaml"
    r = _proc(["kubectl", "kustomize", str(repo / "k3d")])
    out.write_text(r.stdout if r.returncode == 0 else "", encoding="utf-8")
    return out


def _llama_args(rendered, name):
    r = _proc([
        "yq", "eval-all",
        f'select(.kind == "Deployment" and .metadata.name == "{name}") '
        '| .spec.template.spec.containers[] | select(.name == "llama-cpp") | .args[]',
        str(rendered),
    ])
    return r.stdout.splitlines()


def _llama_cpu_limit(rendered, name):
    r = _proc([
        "yq", "eval-all",
        f'select(.kind == "Deployment" and .metadata.name == "{name}") '
        '| .spec.template.spec.containers[] | select(.name == "llama-cpp") | .resources.limits.cpu',
        str(rendered),
    ])
    return r.stdout.strip()


def _cpu_to_cores(raw):
    """'2000m' -> 2 ; '2' -> 2 ; '1500m' -> 1 (abgerundet, mindestens 1)."""
    try:
        if raw.endswith("m"):
            cores = int(raw[:-1]) // 1000
        else:
            cores = int(raw.split(".", 1)[0])
    except ValueError:
        cores = 1
    return cores if cores >= 1 else 1


def _thread_flag(args):
    """printf '%s\\n' args | grep -A1 '^-t$' | tail -n1"""
    out = []
    last = -2
    for i, a in enumerate(args):
        if a == "-t":
            if last >= 0 and i > last + 1:
                out.append("--")
            out.append(a)
            if i + 1 < len(args):
                out.append(args[i + 1])
            last = min(i + 1, len(args) - 1)
    return out[-1] if out else ""


def _check_deployment(rendered, name, marker_flag):
    args = _llama_args(rendered, name)
    # Positiv-Anker [T002356-M1]: Kandidatenliste nicht leer, Marker-Flag vorhanden.
    assert args, f"keine args fuer {name}"
    assert marker_flag in args
    limit = _llama_cpu_limit(rendered, name)
    assert limit not in ("", "null")
    cores = _cpu_to_cores(limit)
    assert "-t" in args
    threads = _thread_flag(args)
    assert threads != ""
    assert int(threads) >= 1
    assert int(threads) <= cores


def test_bge_embed_t_ist_gesetzt_und_ueberschreitet_die_cpu_quota_nicht(rendered):
    _check_deployment(rendered, "bge-embed", "--embeddings")


def test_bge_rerank_t_ist_gesetzt_und_ueberschreitet_die_cpu_quota_nicht(rendered):
    _check_deployment(rendered, "bge-rerank", "--reranking")


def test_bge_thread_quota_der_laufende_bge_embed_pod_traegt_t_in_seinen_args(repo_root):
    ctx = os.environ.get("BGE_CTX", "fleet")
    ns = os.environ.get("BGE_NS", "workspace")
    probe = _proc(["kubectl", "--context", ctx, "get", "deploy", "bge-embed", "-n", ns, "-o", "name"])
    if probe.returncode != 0:
        pytest.skip("kein fleet-Cluster erreichbar (offline/CI)")
    r = _proc([
        "kubectl", "--context", ctx, "get", "deploy", "bge-embed", "-n", ns,
        "-o", 'jsonpath={.spec.template.spec.containers[?(@.name=="llama-cpp")].args}',
    ])
    args = r.stdout
    # Positiv-Anker: echte args gelesen.
    assert args != ""
    assert "--embeddings" in args
    assert '"-t"' in args
