"""Native migration of tests/spec/local-llm-proxy/gateway-consumer-lint.bats."""

import re
from pathlib import Path

import pytest

SURFACES = [".opencode/agent-models.jsonc"]
PORT_LITERAL = re.compile(
    r"127\.0\.0\.1:(8093|1234|8081|8095|8096)|localhost:(8093|1234|8081|8095|8096)"
)
COMMENT_LINE = re.compile(r"^[ \t]*(#|//)")


@pytest.fixture(scope="module")
def rendered_llm_services(repo_root, tmp_path_factory):
    """Mirror of the setup() render: stdout of render-stack.sh core, failures ignored."""
    import subprocess

    out = tmp_path_factory.mktemp("gateway-lint") / "llm-services-rendered.yaml"
    with open(out, "w", encoding="utf-8") as fh:
        subprocess.run(
            ["bash", str(repo_root / "scripts/devmesh/render-stack.sh"), "core"],
            cwd=str(repo_root), stdout=fh, stderr=subprocess.DEVNULL, timeout=600,
        )
    return out


def _active_port_hits(path: Path):
    """grep -nE PATTERN FILE | grep -vE '^N:[ \t]*(#|//)' ."""
    hits = []
    for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        if PORT_LITERAL.search(line) and not COMMENT_LINE.match(line):
            hits.append(f"{i}:{line}")
    return hits


def test_gateway_consumer_lint_t002582_jede_ueberwachte_gateway_konsumenten_datei_existiert_anker(repo_root, rendered_llm_services):
    missing = [f for f in SURFACES if not (repo_root / f).exists()]
    if not (rendered_llm_services.exists() and rendered_llm_services.stat().st_size > 0):
        missing.append("(render) llm-services-rendered.yaml")
    assert not missing, f"Fehlende Flaechen-Dateien: {' '.join(missing)}"


def test_gateway_consumer_lint_t002582_keine_direkten_backend_port_literale_in_den_gateway_konsumenten(repo_root, rendered_llm_services):
    hits = ""
    for f in SURFACES:
        path = repo_root / f
        if not path.exists():
            continue
        h = _active_port_hits(path)
        if h:
            hits += f"{f}:\n" + "\n".join(h) + "\n"
    if rendered_llm_services.exists() and rendered_llm_services.stat().st_size > 0:
        h = _active_port_hits(rendered_llm_services)
        if h:
            hits = "(render) llm-services-rendered.yaml:\n" + "\n".join(h) + "\n"
    else:
        pytest.skip("render-stack.sh Vorbedingung fehlt")
    assert not hits, (
        "Direkte Backend-Ports gefunden (erlaubt nur in Registry-Seeds/Migrationen und in scripts/llm/loadouts.json):\n"
        + hits
    )


def test_gateway_consumer_lint_t002582_taskfile_llm_yml_verweist_auf_kein_fehlendes_startskript(repo_root):
    lines = (repo_root / "taskfiles/Taskfile.llm.yml").read_text(encoding="utf-8").splitlines()
    active = [l for l in lines if not re.match(r"^[ \t]*#", l)]
    refs = sorted({m.group(0) for l in active for m in re.finditer(r"scripts/llm/[A-Za-z0-9_.-]+\.ps1", l)})
    missing = [r for r in refs if not (repo_root / r).exists()]
    assert not missing, "Taskfile.llm.yml nennt nicht vorhandene Skripte:\n" + "\n".join(missing)
