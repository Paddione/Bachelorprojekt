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


@pytest.fixture(scope="module")
def gemma_bulk(rendered, tmp_path_factory):
    """select Deployment gemma-embed-bulk aus dem Rendering (als Datei fuer yq)."""
    out = tmp_path_factory.mktemp("gemma-bulk-sel") / "gemma-bulk.yaml"
    r = _proc([
        "yq", "eval-all",
        'select(.kind == "Deployment" and .metadata.name == "gemma-embed-bulk")',
        str(rendered),
    ])
    out.write_text(r.stdout, encoding="utf-8")
    return out


def test_gemma_embed_bulk_existiert_parkt_bei_replicas_0(gemma_bulk):
    assert gemma_bulk.read_text(encoding="utf-8").strip() != ""
    assert _yq_eval(".spec.replicas", gemma_bulk) == "0"


def test_gemma_embed_bulk_pods_tragen_app_gemma_embed_service_join(rendered, gemma_bulk):
    assert _yq_eval(".spec.template.metadata.labels.app", gemma_bulk) == "gemma-embed"
    svc = _proc([
        "yq", "eval-all",
        'select(.kind == "Service" and .metadata.name == "llm-gateway-gemma-embed") | .spec.selector.app',
        str(rendered),
    ]).stdout.strip()
    assert svc == "gemma-embed"


def test_gemma_embed_bulk_emptydir_statt_rwo_pvc_t_passt_zur_cpu_quota(gemma_bulk):
    emptydir_type = _yq_eval(".spec.template.spec.volumes[0].emptyDir | type", gemma_bulk)
    assert emptydir_type != "null"
    pvc_count = _yq_eval(
        "[.spec.template.spec.volumes[].persistentVolumeClaim] | map(select(. != null)) | length",
        gemma_bulk,
    )
    assert pvc_count == "0"

    args = _proc([
        "yq", "eval",
        '.spec.template.spec.containers[] | select(.name == "llama-cpp") | .args[]',
        str(gemma_bulk),
    ]).stdout.splitlines()
    assert "-t" in args
    assert args[args.index("-t") + 1] == "2"

    limit = _yq_eval(
        '.spec.template.spec.containers[] | select(.name == "llama-cpp") | .resources.limits.cpu',
        gemma_bulk,
    )
    assert limit == "2000m"


def test_gemma_embed_nodeselector_storage_true(rendered):
    """E2E-Fund p1.5: gpu-cluster hat keinen Longhorn-Treiber — der Serving-Pool
    (RWO-PVC) darf nur auf storage=true-Nodes (sonst PVC nie attachbar)."""
    sel = _proc([
        "yq", "eval-all",
        'select(.kind == "Deployment" and .metadata.name == "gemma-embed")'
        " | .spec.template.spec.nodeSelector.storage",
        str(rendered),
    ]).stdout.strip()
    assert sel == "true"


def _llama(rendered, name, expr):
    return _proc([
        "yq", "eval-all",
        f'select(.kind == "Deployment" and .metadata.name == "{name}")'
        f' | .spec.template.spec.containers[] | select(.name == "llama-cpp") | {expr}',
        str(rendered),
    ]).stdout.strip()


def test_gemma_embed_serving_ist_ehrlich_cpu_only(rendered):
    """storage=true-Nodes haben keine GPU: Serving ohne GPU-Request und mit -ngl 0
    (kein stiller llama.cpp-Fallback hinter -ngl 99)."""
    args = _llama(rendered, "gemma-embed", ".args[]").splitlines()
    assert args[args.index("-ngl") + 1] == "0"
    assert _llama(rendered, "gemma-embed", '.resources.limits["nvidia.com/gpu"]') == "null"


def test_gemma_embed_bulk_laeuft_auf_gpu(rendered):
    """Bulk-Reindex auf der GTX 970 (gpu-metal): CUDA-Image, GPU-Slot, volles Offload,
    kein -fa (Maxwell) und kein CUDA_VISIBLE_DEVICES-Override."""
    assert "llama.cpp:server-cuda@sha256:" in _llama(rendered, "gemma-embed-bulk", ".image")
    for side in ("requests", "limits"):
        assert _llama(rendered, "gemma-embed-bulk", f'.resources.{side}["nvidia.com/gpu"]') == "1"
    args = _llama(rendered, "gemma-embed-bulk", ".args[]").splitlines()
    assert args[args.index("-ngl") + 1] == "99"
    assert "-fa" not in args
    assert _llama(rendered, "gemma-embed-bulk", '.env // [] | map(select(.name == "CUDA_VISIBLE_DEVICES")) | length') == "0"
    sel = _proc([
        "yq", "eval-all",
        'select(.kind == "Deployment" and .metadata.name == "gemma-embed-bulk")'
        " | .spec.template.spec.nodeSelector.storage",
        str(rendered),
    ]).stdout.strip()
    assert sel == "null"
