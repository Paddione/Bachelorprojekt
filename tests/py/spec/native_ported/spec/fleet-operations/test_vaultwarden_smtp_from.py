"""Native migration of tests/spec/fleet-operations/vaultwarden-smtp-from.bats."""
import re
import shutil
from pathlib import Path

import pytest

# Rendert den Brand-Overlay und gibt den vaultwarden-Container-Block aus.
# Exit 3: env-resolve nicht verfuegbar. Der Pipeline-Status ist der von awk (wie im Original).
RENDER_SCRIPT = (
    'source scripts/env-resolve.sh "$1" > /dev/null 2>&1 || exit 3; '
    'kubectl kustomize "prod-fleet/$1" --load-restrictor=LoadRestrictionsNone 2>/dev/null '
    "| envsubst "
    "| awk '/^  name: vaultwarden$/,/^---$/'"
)


def _grep_a1_last(lines, pattern: str):
    """Letzte Zeile von grep -A1 PATTERN | tail -1."""
    last = None
    for i, line in enumerate(lines):
        if re.search(pattern, line):
            last = i + 1 if i + 1 < len(lines) else i
    return lines[last] if last is not None else ""


def test_t900028_gerenderter_vaultwarden_deployment_traegt_smtp_from_neben_smtp_host(repo_root, run_cmd):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    if shutil.which("envsubst") is None:
        pytest.skip("envsubst not installed")

    for brand in ("mentolder", "korczewski"):
        res = run_cmd(["bash", "-c", RENDER_SCRIPT, "render", brand], cwd=repo_root, timeout=300)
        if res.returncode != 0:
            pytest.skip(f"env-resolve/kustomize unavailable for {brand}")
        rendered = res.stdout.rstrip("\n")

        # Positiv-Anker: ohne diesen wuerde ein leerer Render die Aussagen unten trivial erfuellen.
        assert "SMTP_HOST" in rendered, f"{brand}: Render enthaelt keinen vaultwarden SMTP_HOST-Block"

        # Der Guard: SMTP_FROM muss gesetzt sein; SMTP_FROM_NAME darf nicht treffen.
        assert "name: SMTP_FROM\n" in rendered, f"{brand}: SMTP_FROM fehlt im gerenderten vaultwarden-Deployment"

        # ... und einen echten Wert tragen, keinen stehengebliebenen Platzhalter.
        val = _grep_a1_last(rendered.splitlines(), r"name: SMTP_FROM$")
        assert "@" in val, f"{brand}: SMTP_FROM ohne aufgeloesten Mailwert: {val}"
        assert "${" not in val, f"{brand}: SMTP_FROM-Platzhalter nicht substituiert: {val}"


def test_t900028_smtp_from_steht_in_beiden_envsubst_vars_listen(repo_root):
    # Ohne Eintrag in workspace:deploy UND flux:render bliebe '${SMTP_FROM}' literal stehen.
    files = [repo_root / "Taskfile.yml"]
    taskfiles = repo_root / "taskfiles"
    if taskfiles.is_dir():
        files += [p for p in sorted(taskfiles.rglob("*")) if p.is_file()]
    count = 0
    for f in files:
        if not f.is_file():
            continue
        count += sum(1 for line in f.read_text(encoding="utf-8", errors="replace").splitlines()
                     if "$SMTP_FROM" in line)
    assert count >= 2, f"SMTP_FROM in nur {count} envsubst-Listen"
