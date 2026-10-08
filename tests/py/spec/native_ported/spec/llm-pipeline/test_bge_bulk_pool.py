"""Native migration of tests/spec/llm-pipeline/bge-bulk-pool.bats."""

import subprocess

import pytest


def _proc(args, cwd=None):
    """Prozessaufruf fuer Module-Fixtures (run_cmd ist function-scoped); stdin = /dev/null."""
    return subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, text=True,
                          cwd=cwd, timeout=300)


@pytest.fixture(scope="module")
def rendered(repo_root, tmp_path_factory):
    """setup_file: kubectl kustomize k3d/ > RENDERED (Fehler -> leere Datei)."""
    out = tmp_path_factory.mktemp("bge-bulk") / "k3d-rendered.yaml"
    r = _proc(["kubectl", "kustomize", str(repo_root / "k3d")])
    out.write_text(r.stdout if r.returncode == 0 else "", encoding="utf-8")
    return out


@pytest.fixture(scope="module")
def bulk(rendered, tmp_path_factory):
    """_bulk: select Deployment bge-embed-bulk aus dem Rendering (als Datei fuer yq)."""
    out = tmp_path_factory.mktemp("bge-bulk-sel") / "bulk.yaml"
    r = _proc([
        "yq", "eval-all",
        'select(.kind == "Deployment" and .metadata.name == "bge-embed-bulk")',
        str(rendered),
    ])
    out.write_text(r.stdout, encoding="utf-8")
    return out


def _yq_eval(expr, path):
    return _proc(["yq", "eval", expr, str(path)]).stdout.strip()


def test_bge_embed_bulk_existiert_parkt_bei_replicas_0(bulk):
    assert bulk.read_text(encoding="utf-8").strip() != ""
    assert _yq_eval(".spec.replicas", bulk) == "0"


def test_bge_embed_bulk_pods_tragen_app_bge_embed_service_join(rendered, bulk):
    assert _yq_eval(".spec.template.metadata.labels.app", bulk) == "bge-embed"
    svc = _proc([
        "yq", "eval-all",
        'select(.kind == "Service" and .metadata.name == "llm-gateway-embed") | .spec.selector.app',
        str(rendered),
    ]).stdout.strip()
    assert svc == "bge-embed"


def test_bge_embed_bulk_emptydir_statt_rwo_pvc_t_passt_zur_cpu_quota(bulk):
    emptydir_type = _yq_eval(".spec.template.spec.volumes[0].emptyDir | type", bulk)
    assert emptydir_type != "null"
    pvc_count = _yq_eval(
        "[.spec.template.spec.volumes[].persistentVolumeClaim] | map(select(. != null)) | length",
        bulk,
    )
    assert pvc_count == "0"

    args = _proc([
        "yq", "eval",
        '.spec.template.spec.containers[] | select(.name == "llama-cpp") | .args[]',
        str(bulk),
    ]).stdout.splitlines()
    # grep -A1 '^-t$' | tail -n1
    after = []
    last = -2
    for i, a in enumerate(args):
        if a == "-t":
            if last >= 0 and i > last + 1:
                after.append("--")
            after.append(a)
            if i + 1 < len(args):
                after.append(args[i + 1])
            last = min(i + 1, len(args) - 1)
    threads = after[-1] if after else ""

    limit = _yq_eval(
        '.spec.template.spec.containers[] | select(.name == "llama-cpp") | .resources.limits.cpu',
        bulk,
    )
    assert threads == "2"
    assert limit == "2000m"
