"""LFM2.5 retrieval on gpu-metal: GPU scheduling, Maxwell-safe flags, pins."""

import os
import subprocess

import pytest


def _proc(args):
    """Prozessaufruf mit stdin=/dev/null; stderr wird wie im BATS-Original verworfen (2>/dev/null)."""
    return subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=300)


@pytest.fixture(scope="module")
def rendered(repo_root, tmp_path_factory):
    out = tmp_path_factory.mktemp("lfm-retrieval") / "k3d-rendered.yaml"
    r = _proc(["kubectl", "kustomize", str(repo_root / "k3d")])
    out.write_text(r.stdout if r.returncode == 0 else "", encoding="utf-8")
    return out


def _yq(rendered, expr):
    r = _proc(["yq", "eval-all", expr, str(rendered)])
    return r.stdout


def _args(rendered, name):
    return _yq(
        rendered,
        f'select(.kind == "Deployment" and .metadata.name == "{name}") '
        '| .spec.template.spec.containers[] | select(.name == "llama-cpp") | .args[]',
    ).splitlines()


@pytest.mark.parametrize("name", ["lfm-embed", "lfm-colbert"])
def test_retrieval_deployments_request_exactly_one_gpu(rendered, name):
    limits = _yq(
        rendered,
        f'select(.kind == "Deployment" and .metadata.name == "{name}") '
        '| .spec.template.spec.containers[] | select(.name == "llama-cpp") '
        '| .resources.limits."nvidia.com/gpu"',
    ).strip()
    assert limits == "1", limits


@pytest.mark.parametrize("name", ["lfm-embed", "lfm-colbert"])
def test_retrieval_no_flash_attention_maxwell(rendered, name):
    args = _args(rendered, name)
    assert "-fa" not in args, args
    assert "--embeddings" in args
    assert "-ngl" in args


@pytest.mark.parametrize("name", ["lfm-embed", "lfm-colbert"])
def test_retrieval_image_pinned_not_rolling(rendered, name):
    image = _yq(
        rendered,
        f'select(.kind == "Deployment" and .metadata.name == "{name}") '
        '| .spec.template.spec.containers[] | select(.name == "llama-cpp") | .image',
    ).strip()
    assert "@sha256:" in image, image


@pytest.mark.parametrize(
    "svc,deploy", [("llm-gateway-lfm-embed", "lfm-embed"),
                   ("llm-gateway-lfm-colbert", "lfm-colbert")],
)
def test_retrieval_services_route_8081(rendered, svc, deploy):
    port = _yq(
        rendered,
        f'select(.kind == "Service" and .metadata.name == "{svc}") '
        '| .spec.ports[0].port',
    ).strip()
    selector = _yq(
        rendered,
        f'select(.kind == "Service" and .metadata.name == "{svc}") '
        '| .spec.selector.app',
    ).strip()
    assert port == "8081", port
    assert selector == deploy, selector
