"""Native migration of tests/spec/rustdesk-server/on-demand-lifecycle.bats."""

import os
import re
import shutil
from pathlib import Path

import pytest

# Guards für den task-verwalteten RustDesk-Lifecycle: Taskfile-Registrierung,
# Sleeper-Job mit minimaler RBAC und Kustomize-Isolation von on-demand.yaml.
# Prüfmodus: Konfigurations-Manifestation (Taskfile-/Manifest-Greps) +
# Build-Output — Querschnittstests, deren Ergebnis sich im Repo-Text
# manifestiert (tests/CLAUDE.md, "Output- statt Source-Verifikation" Ausnahme).


def _paths(repo_root: Path):
    stack = repo_root / "k3d/rustdesk-stack"
    return {
        "REPO_ROOT": repo_root,
        "STACK": stack,
        "TASKFILE": repo_root / "taskfiles/Taskfile.rustdesk.yml",
        "ON_DEMAND": stack / "on-demand.yaml",
    }


def _role_block(text: str) -> str:
    """awk '/^kind: Role$/,/^---$/' : every range from a 'kind: Role' line to the next '---' line."""
    out = []
    inside = False
    for line in text.splitlines():
        if not inside:
            if line == "kind: Role":
                inside = True
                out.append(line)
            continue
        out.append(line)
        if line == "---":
            inside = False
    return "\n".join(out) + ("\n" if out else "")


def test_rustdesk_on_demand_taskfile_ist_registriert_und_traegt_die_lifecycle_targets(repo_root):
    p = _paths(repo_root)
    assert p["TASKFILE"].is_file()
    # Include-Eintrag im Root-Taskfile (Registrierung)
    root_taskfile = (repo_root / "Taskfile.yml").read_text()
    assert re.search(r"^  rustdesk:", root_taskfile, re.M)
    assert "taskfiles/Taskfile.rustdesk.yml" in root_taskfile
    # Die vier Lifecycle-Targets sind deklariert (einrückungstolerant —
    # der Namespace kommt vom Include-Key des Root-Taskfiles)
    task_text = p["TASKFILE"].read_text()
    for target in ("deploy", "wake", "sleep", "status"):
        assert re.search(rf"^[^\S\n]*{target}:", task_text, re.M), target


def test_rustdesk_on_demand_sleeper_manifest_deklariert_ttl_downscale_mit_minimaler_rbac(repo_root):
    p = _paths(repo_root)
    assert p["ON_DEMAND"].is_file()
    text = p["ON_DEMAND"].read_text()
    # Job mit TTL-Wind-down (30 min Default, Scale-to-0 für hbbs+hbbr)
    assert re.search(r"^kind:[^\S\n]*Job$", text, re.M)
    assert "name: rustdesk-sleeper" in text
    assert "sleep 1800" in text
    assert "--replicas=0" in text
    # RBAC-Trio vollständig
    assert re.search(r"^kind:[^\S\n]*ServiceAccount$", text, re.M)
    assert re.search(r"^kind:[^\S\n]*Role$", text, re.M)
    assert re.search(r"^kind:[^\S\n]*RoleBinding$", text, re.M)
    # Role listet ausschließlich deployments/scale (get/update/patch) + deployments (get)
    role_block = _role_block(text)
    assert "deployments/scale" in role_block
    assert '"get", "update", "patch"' in role_block
    assert re.search(r'resources:[^\S\n]*\["deployments"\]', role_block, re.M)
    assert re.search(r'verbs:[^\S\n]*\["get"\]', role_block, re.M)
    # Negativ-Aussage: keine weitergehenden Verben im Role-Block
    bad_pattern = re.compile(r'(^|[^a-z])(delete|create|list|watch|patch-all|"\*")([^a-z]|$)')
    bad_verbs = sum(1 for line in role_block.splitlines() if bad_pattern.search(line))
    assert bad_verbs == 0


def test_rustdesk_on_demand_on_demand_yaml_bleibt_ausserhalb_des_kustomize_builds(run_cmd, repo_root):
    p = _paths(repo_root)
    # Positiv-Anker: die bewachte Datei existiert überhaupt (sonst wäre die
    # Isolations-Aussage vakuos — T002356-M1)
    assert p["ON_DEMAND"].is_file()
    if shutil.which("kustomize") is None:
        pytest.skip("kustomize not installed")
    result = run_cmd(["kustomize", "build", str(p["STACK"])])
    assert result.returncode == 0
    # Der Stack-Build liefert nach wie vor die Relay-Deployments ...
    assert re.search(r"^kind:[^\S\n]+Deployment", result.output, re.M)
    # ... aber null Treffer auf den Sleeper-Job (er rolliert nie über Flux/Kustomize)
    leaks = sum(1 for line in result.output.splitlines() if "rustdesk-sleeper" in line)
    assert leaks == 0
    # Belt-and-braces: on-demand.yaml ist in keiner Kustomization referenziert
    refs = []
    for sub in ("k3d", "prod"):
        base = repo_root / sub
        if not base.is_dir():
            continue
        for dirpath, _dirs, files in os.walk(base):
            for name in files:
                if name != "kustomization.yaml":
                    continue
                f = Path(dirpath) / name
                if re.search(r"on-demand\.yaml", f.read_text(errors="replace")):
                    refs.append(str(f))
    assert refs == []
