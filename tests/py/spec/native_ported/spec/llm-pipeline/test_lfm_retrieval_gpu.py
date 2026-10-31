"""LFM2.5 retrieval on Intel iGPU plus NVIDIA MPS sharing."""

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


@pytest.fixture(scope="module")
def rendered_gpu(repo_root, tmp_path_factory):
    out = tmp_path_factory.mktemp("gpu-sharing") / "gpu-rendered.yaml"
    r = _proc(["kubectl", "kustomize", str(repo_root / "dev-local" / "gpu")])
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


@pytest.mark.parametrize("name", ["lfm-embed"])
def test_retrieval_deployments_request_exactly_one_igpu(rendered, name):
    limits = _yq(
        rendered,
        f'select(.kind == "Deployment" and .metadata.name == "{name}") '
        '| .spec.template.spec.containers[] | select(.name == "llama-cpp") '
        '| .resources.limits."gpu.intel.com/i915"',
    ).strip()
    assert limits == "1", limits
    nvidia = _yq(
        rendered,
        f'select(.kind == "Deployment" and .metadata.name == "{name}") '
        '| .spec.template.spec.containers[] | select(.name == "llama-cpp") '
        '| .resources.limits."nvidia.com/gpu"',
    ).strip()
    assert nvidia in ("", "null"), nvidia


def test_nvidia_sharing_is_mps_replicas_2(rendered_gpu):
    sharing = _yq(
        rendered_gpu,
        'select(.kind == "ConfigMap" and .metadata.name == "nvidia-plugin-configs") '
        '| .data."config.yaml"',
    )
    assert "mps:" in sharing, sharing
    assert "replicas: 2" in sharing, sharing
    assert "timeSlicing" not in sharing, sharing


@pytest.mark.parametrize("name", ["lfm-embed"])
def test_retrieval_uses_vulkan_image_and_igpu_selector(rendered, name):
    image = _yq(
        rendered,
        f'select(.kind == "Deployment" and .metadata.name == "{name}") '
        '| .spec.template.spec.containers[] | select(.name == "llama-cpp") | .image',
    ).strip()
    assert "server-vulkan" in image, image
    assert "@sha256:" in image, image
    selector = _yq(
        rendered,
        f'select(.kind == "Deployment" and .metadata.name == "{name}") '
        '| .spec.template.spec.nodeSelector."intel-igpu"',
    ).strip()
    assert selector == "true", selector


@pytest.mark.parametrize("name", ["lfm-embed"])
def test_retrieval_no_flash_attention_vulkan(rendered, name):
    args = _args(rendered, name)
    assert "-fa" not in args, args
    assert "--embeddings" in args
    assert "-ngl" in args


@pytest.mark.parametrize("name", ["lfm-embed"])
def test_retrieval_image_pinned_not_rolling(rendered, name):
    image = _yq(
        rendered,
        f'select(.kind == "Deployment" and .metadata.name == "{name}") '
        '| .spec.template.spec.containers[] | select(.name == "llama-cpp") | .image',
    ).strip()
    assert "@sha256:" in image, image


@pytest.mark.parametrize(
    "svc,deploy", [("llm-gateway-lfm-embed", "lfm-embed")],
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
