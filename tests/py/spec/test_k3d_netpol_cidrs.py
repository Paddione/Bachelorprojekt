"""Guards for parametrized cluster CIDRs + the no-direct-apply rule (T901777).

Before T901777 the k3s pod/service CIDRs (10.42/16, 10.43/16) were hardcoded in
the NetworkPolicies while devmesh runs 10.52/16 + 10.53/16 (ADR-008) — the next
deploy would have silently overwritten the live devmesh fix (kube-router REJECT
on new pods). The CIDRs now come from the environment (POD_CIDR/SERVICE_CIDR/
POD_VTEP_IP) and every render path must carry them; k3d manifests must only be
deployed via a Task/Flux render path (envsubst + $$-collapse).
"""

import re
import subprocess
from pathlib import Path

CIDR_FILES = ["k3d/network-policies.yaml", "k3d/website.yaml"]

# environments/<name>.yaml -> (POD_CIDR, SERVICE_CIDR). dev runs on devmesh
# (ADR-008), everything else on a k3s-default Fleet-Cluster.
# brand-trennung p5: mentolder.yaml + fleet-mentolder.yaml geloescht —
# korczewski-Pendants (gleiche CIDRs, per grep/env-resolve-Lauf verifiziert).
ENV_FILES = {
    "dev": ("10.52.0.0/16", "10.53.0.0/16"),
    "dev-cluster": ("10.42.0.0/16", "10.43.0.0/16"),
    "korczewski": ("10.42.0.0/16", "10.43.0.0/16"),
    "staging": ("10.42.0.0/16", "10.43.0.0/16"),
    "fleet-korczewski": ("10.42.0.0/16", "10.43.0.0/16"),
}

# Runtime escapes: $${VAR} / $$VAR. Bare $$ (SQL DO $$, vendored CRD docs) and
# $$(cmd)/$$!/$$? do not match — same shape as flux-render-artifact.sh.
RUNTIME_ESCAPE = re.compile(r"\$\$(\{)?[A-Za-z_]")

# A pod/service cluster CIDR sitting literally in a cidr: field.
HARDCODED_CIDR = re.compile(r"^\s*cidr:\s*10\.(42|43|52|53)\.0\.0/16")

# The exact triple appended to every static envsubst allowlist.
CIDR_TRIPLE = "\\$POD_CIDR \\$SERVICE_CIDR \\$POD_VTEP_IP"

MARKER = "NUR VIA TASK DEPLOYEN"


def _task_section(text: str, task: str) -> str:
    start = re.search(rf"^  {re.escape(task)}:\s*$", text, re.M)
    assert start is not None, f"task {task} not found"
    rest = text[start.end():]
    m = re.search(r"^  [a-z][a-z0-9:_-]*:\s*$", rest, re.M)
    return rest[: m.start()] if m else rest


def test_no_hardcoded_cluster_cidrs(repo_root: Path):
    for rel in CIDR_FILES:
        text = (repo_root / rel).read_text()
        bad = [ln for ln in text.splitlines() if HARDCODED_CIDR.match(ln)]
        assert not bad, f"{rel}: hardcoded cluster CIDR in cidr: fields: {bad}"
        assert "${POD_CIDR}" in text, f"{rel}: ${{POD_CIDR}} missing"
        assert "${SERVICE_CIDR}" in text, f"{rel}: ${{SERVICE_CIDR}} missing"
    netpol = (repo_root / "k3d/network-policies.yaml").read_text()
    assert "${POD_VTEP_IP}/32" in netpol, "traefik VTEP /32 is not parametrized"


def test_static_render_lists_cover_cidr_vars(repo_root: Path):
    ws = _task_section((repo_root / "taskfiles/Taskfile.workspace.yml").read_text(), "workspace:deploy")
    assert ws.count(CIDR_TRIPLE) == 2, "workspace:deploy needs the CIDR triple in dev + prod envsubst lists"
    assert ws.count('export POD_CIDR="${POD_CIDR:-10.42.0.0/16}"') == 2
    assert ws.count('export SERVICE_CIDR="${SERVICE_CIDR:-10.43.0.0/16}"') == 2
    assert ws.count('export POD_VTEP_IP="${POD_VTEP_IP:-${POD_CIDR%%/*}}"') == 2

    web = _task_section((repo_root / "taskfiles/Taskfile.web.yml").read_text(), "website:deploy")
    assert web.count(CIDR_TRIPLE) == 2, "website:deploy needs the CIDR triple in dev + prod envsubst lists"
    assert 'export POD_CIDR="${POD_CIDR:-10.42.0.0/16}"' in web
    assert 'export SERVICE_CIDR="${SERVICE_CIDR:-10.43.0.0/16}"' in web
    assert 'export POD_VTEP_IP="${POD_VTEP_IP:-${POD_CIDR%%/*}}"' in web

    partial = _task_section(
        (repo_root / "taskfiles/Taskfile.workspace.yml").read_text(), "workspace:partial-deploy"
    )
    assert partial.count(CIDR_TRIPLE) == 1, "workspace:partial-deploy must mirror the prod envsubst contract"
    assert 'export POD_CIDR="${POD_CIDR:-10.42.0.0/16}"' in partial
    assert 'export SERVICE_CIDR="${SERVICE_CIDR:-10.43.0.0/16}"' in partial
    assert 'export POD_VTEP_IP="${POD_VTEP_IP:-${POD_CIDR%%/*}}"' in partial


def test_dynamic_render_paths_default_cidr_vars(repo_root: Path):
    # Flux renders extract ${VAR} dynamically: an unset var would substitute to
    # "" and ship `cidr: ""` (fail-open), so the defaults are load-bearing.
    flux = (repo_root / "scripts/flux-render-artifact.sh").read_text()
    assert 'export POD_CIDR="${POD_CIDR:-10.42.0.0/16}"' in flux
    assert 'export SERVICE_CIDR="${SERVICE_CIDR:-10.43.0.0/16}"' in flux
    assert 'export POD_VTEP_IP="${POD_VTEP_IP:-${POD_CIDR%%/*}}"' in flux

    devmesh = (repo_root / "scripts/devmesh/render-stack.sh").read_text()
    assert 'export POD_CIDR="${POD_CIDR:-10.42.0.0/16}"' in devmesh
    assert 'export SERVICE_CIDR="${SERVICE_CIDR:-10.43.0.0/16}"' in devmesh
    assert 'export POD_VTEP_IP="${POD_VTEP_IP:-${POD_CIDR%%/*}}"' in devmesh

    # build-website.yml fails closed on unset vars (MISSING check) — the var
    # must exist in the job env, not just in a Taskfile.
    ci = (repo_root / ".github/workflows/build-website.yml").read_text()
    assert 'POD_CIDR: "10.42.0.0/16"' in ci
    assert 'SERVICE_CIDR: "10.43.0.0/16"' in ci
    assert "POD_VTEP_IP=" in ci


def test_schema_and_preflight_cover_cidr_vars(repo_root: Path):
    schema = (repo_root / "environments/schema.yaml").read_text()
    assert "- name: POD_CIDR" in schema
    assert "- name: SERVICE_CIDR" in schema
    preflight = (repo_root / "scripts/pre-deploy-checks-lib.sh").read_text()
    assert preflight.count("POD_CIDR SERVICE_CIDR") == 2, "preflight must check CIDRs for dev + prod"


def test_env_files_define_cidrs(repo_root: Path):
    for env, (pod, svc) in ENV_FILES.items():
        text = (repo_root / f"environments/{env}.yaml").read_text()
        assert re.search(rf'^  POD_CIDR: "{re.escape(pod)}"\s*$', text, re.M), f"{env}.yaml: POD_CIDR"
        assert re.search(rf'^  SERVICE_CIDR: "{re.escape(svc)}"\s*$', text, re.M), f"{env}.yaml: SERVICE_CIDR"


def test_env_resolve_exports_cidrs(repo_root: Path):
    for env, (pod, svc) in ENV_FILES.items():
        res = subprocess.run(
            ["bash", "-c", f'source scripts/env-resolve.sh {env} >/dev/null 2>&1 && printf "%s %s" "$POD_CIDR" "$SERVICE_CIDR"'],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        assert res.returncode == 0, f"env-resolve.sh {env} failed: {res.stderr}"
        assert res.stdout == f"{pod} {svc}", f"{env}: got {res.stdout!r}"


def test_website_yaml_has_no_runtime_escapes(repo_root: Path):
    # The DEV branch of website:deploy renders k3d/website.yaml WITHOUT a
    # $$-collapse stage, so a $${...} escape there would reach the cluster
    # literally (PID expansion).
    text = (repo_root / "k3d/website.yaml").read_text()
    hits = RUNTIME_ESCAPE.findall(text)
    assert not hits, f"k3d/website.yaml must not contain runtime escapes: {hits[:5]}"


def test_escape_files_carry_deploy_marker(repo_root: Path):
    unmarked = []
    for yf in sorted((repo_root / "k3d").rglob("*.yaml")):
        text = yf.read_text()
        if RUNTIME_ESCAPE.search(text) and MARKER not in text:
            unmarked.append(str(yf.relative_to(repo_root)))
    assert not unmarked, f"escape files without '{MARKER}' header: {unmarked}"
    readme = (repo_root / "k3d/README.md").read_text()
    assert "Nur via Task deployen" in readme


def test_legacy_deploy_sh_is_fail_closed(repo_root: Path):
    text = (repo_root / "k3d/deploy.sh").read_text()
    assert "ALLOW_DEPLOY_SH" in text
    assert "task workspace:deploy" in text
    res = subprocess.run(["bash", "k3d/deploy.sh"], cwd=repo_root, capture_output=True, text=True, timeout=30)
    assert res.returncode == 2, "k3d/deploy.sh must refuse direct use"
    assert "task workspace:deploy" in res.stderr
