"""Issue #6949 (folgt #6944): Manifest-Args muessen ZUM offiziellen Image passen.

smanx/opencode prependete per Entrypoint selbst `serve` (#6944: kein `serve`
im Manifest). Das offizielle Image ghcr.io/anomalyco/opencode tut das NICHT —
es braucht `opencode serve --hostname ... --port ...` explizit, sonst:
  Unrecognized flag: --hostname in command opencode

Vertrag: args[0] == "serve", Flags intakt, Probes tcpSocket (mit
OPENCODE_SERVER_PASSWORD antwortet / mit 401 → httpGet wuerde ewig failen).
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


def test_serve_arg_explicit_for_official_image(repo_root: Path):
    container = _opencode_container(repo_root)
    assert container["image"].startswith("ghcr.io/anomalyco/opencode:"), (
        f"Test gilt dem offiziellen Image: {container['image']}"
    )
    args = [str(a) for a in container.get("args", [])]
    assert args and args[0] == "serve", (
        f"offizielles Image braucht explizites `serve` als erstes Arg: {args} (siehe #6949)"
    )
    for flag in ("--hostname", "0.0.0.0", "--port", "4096"):
        assert flag in args, f"erwartetes Flag fehlt: {flag} (args: {args})"


def test_probes_tcp_socket(repo_root: Path):
    container = _opencode_container(repo_root)
    for probe in ("readinessProbe", "livenessProbe"):
        spec = container.get(probe, {})
        assert "tcpSocket" in spec, f"{probe} muss tcpSocket sein (Basic-Auth → / gibt 401): {spec}"
        assert "httpGet" not in spec, f"{probe} darf kein httpGet enthalten: {spec}"
