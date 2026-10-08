"""Native migration of tests/spec/flux-render-security/bootstrap-envsubst.bats."""

import re
from pathlib import Path


def _placeholders(bootstrap_dir: Path) -> list:
    """Distinct ${VAR} names from the bootstrap manifests (grep -rhoE + tr + sort -u)."""
    names = set()
    if not bootstrap_dir.is_dir():
        return []
    for path in sorted(bootstrap_dir.rglob("*")):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r"\$\{[A-Z_][A-Z0-9_]*\}", text):
            names.add(m.group(0)[2:-1])
    return sorted(names)


def _bootstrap_task(taskfile: Path) -> str:
    """Text block of the flux:bootstrap task up to the next task of equal indentation."""
    out = []
    active = False
    for line in taskfile.read_text(encoding="utf-8").splitlines():
        if line == "  flux:bootstrap:":
            active = True
        elif active and re.match(r"^  [a-z][a-z0-9:_-]*:$", line):
            break
        if active:
            out.append(line)
    return "\n".join(out)


def test_bootstrap_envsubst_jeder_platzhalter_wird_an_envsubst_uebergeben(repo_root):
    bootstrap_dir = repo_root / "flux/clusters/fleet/bootstrap"
    taskfile = repo_root / "taskfiles/Taskfile.platform.yml"
    assert bootstrap_dir.is_dir()

    task_text = _bootstrap_task(taskfile)
    assert task_text, "flux:bootstrap task not found"
    assert "envsubst" in task_text

    uncovered = [v for v in _placeholders(bootstrap_dir) if v not in task_text]
    assert not uncovered, (
        f"Platzhalter in flux/clusters/fleet/bootstrap ohne Deckung im flux:bootstrap-Task: {' '.join(uncovered)}\n"
        "Folge: sie werden woertlich ins Cluster appliziert — Ressource existiert, wirkt aber nicht."
    )


def test_bootstrap_envsubst_die_webhook_ingressroute_referenziert_ein_eigenes_tls_secret(repo_root):
    ir = repo_root / "flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml"
    assert ir.is_file()
    text = ir.read_text(encoding="utf-8")
    assert "secretName:" in text
    assert re.search(r"secretName:[ \t]*flux-webhook-tls", text)
    assert not re.search(r"secretName:[ \t]*\$\{TLS_SECRET_NAME\}", text)


def test_bootstrap_envsubst_ein_certificate_fuer_den_webhook_host_ist_deklariert(run_cmd, repo_root):
    cert = repo_root / "flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml"

    # Positiv-Anker: cert-manager Certificates existieren im Repo.
    res = run_cmd(
        f"grep -rl 'kind: Certificate' '{repo_root}/prod' '{repo_root}/flux' 2>/dev/null | wc -l",
        shell=True,
    )
    assert res.returncode == 0
    assert int(res.stdout.strip()) > 0

    assert cert.is_file()
    text = cert.read_text(encoding="utf-8")
    assert "kind: Certificate" in text
    assert re.search(r"secretName:[ \t]*flux-webhook-tls", text)
    assert re.search(r"flux-webhook\.", text)
