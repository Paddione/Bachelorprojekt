"""Unit tests for _pick_probe_pod (false-red fix for wget/nc-less exec pods).

Probes used to kubectl-exec into the first Running pod unconditionally. Minimal
images (e.g. distroless agent-board: neither wget nor nc) then failed every
contract, painting live services red. _pick_probe_pod skips incapable pods and
only raises (fail-closed '-') when none provides the tool.
"""

import importlib.util
import subprocess

import pytest


@pytest.fixture
def measure_mod(repo_root):
    path = repo_root / "scripts" / "lib" / "runtime-health-measure.py"
    spec = importlib.util.spec_from_file_location("runtime_health_measure", str(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _pods(*names):
    return {"items": [
        {"metadata": {"name": n}, "status": {"phase": "Running"}} for n in names
    ]}


def test_skips_tool_less_pod_and_picks_capable_one(measure_mod, monkeypatch):
    """First Running pod is distroless (no nc) -> second pod is chosen."""
    monkeypatch.setattr(
        measure_mod, "_kube_get", lambda args: _pods("distroless-a", "dev-pod"))
    calls = []

    def fake_cmd(args):
        calls.append(args[2])
        if args[2] == "distroless-a":
            raise subprocess.CalledProcessError(1, args)
        return "/usr/bin/nc\n"

    monkeypatch.setattr(measure_mod, "_kube_cmd", fake_cmd)
    assert measure_mod._pick_probe_pod("ctx", "workspace", "nc") == "dev-pod"
    assert calls == ["distroless-a", "dev-pod"]


def test_returns_none_when_no_pod_provides_tool(measure_mod, monkeypatch):
    """All pods tool-less -> None so the caller raises (fail-closed '-')."""
    monkeypatch.setattr(
        measure_mod, "_kube_get", lambda args: _pods("distroless-a", "distroless-b"))
    monkeypatch.setattr(
        measure_mod, "_kube_cmd",
        lambda args: (_ for _ in ()).throw(subprocess.CalledProcessError(1, args)))
    assert measure_mod._pick_probe_pod("ctx", "workspace", "wget") is None


def test_returns_none_when_pod_list_unavailable(measure_mod, monkeypatch):
    """kubectl failure -> None, never a fabricated pod name."""
    monkeypatch.setattr(
        measure_mod, "_kube_get",
        lambda args: (_ for _ in ()).throw(subprocess.CalledProcessError(1, args)))
    assert measure_mod._pick_probe_pod("ctx", "workspace", "nc") is None


def test_skips_non_running_pods(measure_mod, monkeypatch):
    """Pending/Terminating pods are never probed."""
    monkeypatch.setattr(measure_mod, "_kube_get", lambda args: {"items": [
        {"metadata": {"name": "pending-a"}, "status": {"phase": "Pending"}},
        {"metadata": {"name": "good-b"}, "status": {"phase": "Running"}},
    ]})
    seen = []
    monkeypatch.setattr(
        measure_mod, "_kube_cmd",
        lambda args: (seen.append(args[2]), "/bin/nc\n")[1])
    assert measure_mod._pick_probe_pod("ctx", "workspace", "nc") == "good-b"
    assert seen == ["good-b"]


def _stub_picker(python_pod):
    """No wget anywhere; python3 only on python_pod (None = nowhere)."""
    def pick(ctx, ns, tool):
        if tool == "wget":
            return None
        if tool == "python3":
            return python_pod
        raise AssertionError(f"unexpected tool probe: {tool}")
    return pick


def test_http_falls_back_to_python3_without_wget(measure_mod, monkeypatch):
    """wget-less fleet -> python3-urllib probe still yields a verdict, not '-'."""
    monkeypatch.setattr(measure_mod, "_pick_probe_pod", _stub_picker("py-pod"))
    seen = []

    def fake_cmd(args):
        seen.extend(args)
        return "ok\n"

    monkeypatch.setattr(measure_mod, "_kube_cmd", fake_cmd)
    assert measure_mod._internal_http("http://x/", '"marker"') == 0
    joined = " ".join(seen)
    assert "urllib.request" in joined and "timeout" in joined
    # Marker with embedded double quotes must survive intact (json-escaped).
    assert '\\"marker\\"' in joined


def test_http_raises_without_wget_and_without_python3(measure_mod, monkeypatch):
    """No capable pod at all -> raise so main() emits fail-closed '-'."""
    monkeypatch.setattr(measure_mod, "_pick_probe_pod", _stub_picker(None))
    with pytest.raises(ValueError):
        measure_mod._internal_http("http://x/", '"marker"')
