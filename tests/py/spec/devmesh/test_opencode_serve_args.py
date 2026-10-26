"""Issue #6944: Manifest-Args duerfen `serve` nicht enthalten.

Der Image-Entrypoint (smanx/opencode) stellt selbst `serve` voran
(`-> opencode serve`); ein zusaetzliches `serve`-Arg im Manifest ergibt
`opencode serve serve ...` und bricht ab mit:
  Unexpected positional argument: "serve"
"""

from pathlib import Path

import yaml


def _opencode_container(repo_root: Path) -> dict:
    comp = repo_root / "dev-local" / "components" / "opencode" / "opencode.yaml"
    assert comp.is_file(), "dev-local/components/opencode/opencode.yaml missing"
    docs = [d for d in yaml.safe_load_all(comp.read_text()) if d]
    deps = [
        d
        for d in docs
        if d.get("kind") == "Deployment" and d.get("metadata", {}).get("name") == "opencode"
    ]
    assert len(deps) == 1, "Deployment/opencode not found exactly once"
    containers = deps[0]["spec"]["template"]["spec"]["containers"]
    assert len(containers) == 1
    return containers[0]


def test_no_duplicate_serve_arg(repo_root: Path):
    container = _opencode_container(repo_root)
    args = container.get("args", [])
    assert "serve" not in args, (
        f"args enthalten `serve`, Entrypoint stellt es selbst voran: {args} (siehe #6944)"
    )


def test_serve_flags_intact(repo_root: Path):
    container = _opencode_container(repo_root)
    args = [str(a) for a in container.get("args", [])]
    for flag in ("--hostname", "0.0.0.0", "--port", "4096"):
        assert flag in args, f"erwartetes Flag fehlt: {flag} (args: {args})"
