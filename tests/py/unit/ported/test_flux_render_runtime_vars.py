"""Native migration of tests/unit/flux-render-runtime-vars.bats."""
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest


def _count_lines(path: Path, needle: str) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if needle in line)


def test_t002306_renderer_filters_vardollar_vardollar_var_out_of_the_envsubst_allowlist(repo_root):
    renderer = repo_root / "scripts" / "flux-render-artifact.sh"
    assert _count_lines(renderer, "runtime_vars") >= 3


def test_t002306_fail_closed_check_exempts_declared_runtime_vars(repo_root):
    renderer = repo_root / "scripts" / "flux-render-artifact.sh"
    assert _count_lines(renderer, "leftover") >= 4


def test_t002306_vardollar_var_survives_rendering_var_is_still_substituted(monkeypatch):
    if shutil.which("envsubst") is None:
        pytest.skip("envsubst is not installed")

    rendered = 'a: "$${ARCH}"\nb: "${SUBSTITUTE_ME}"\nc: "$$BIN"'
    monkeypatch.setenv("SUBSTITUTE_ME", "ersetzt")

    # Allowlist extraction as in the renderer: ${VAR} references, minus declared runtime vars.
    vars_found = sorted(
        set(m[2:-1] for m in re.findall(r"\$\{[A-Za-z_][A-Za-z0-9_]*\}", rendered))
    )
    runtime_vars = sorted(
        set(
            re.sub(r"^\$\$\{|\}$", "", m)
            for m in re.findall(r"\$\$\{[A-Za-z_][A-Za-z0-9_]*\}", rendered)
        )
    )
    for rv in runtime_vars:
        vars_found = [v for v in vars_found if v != rv and v != ""]
    ev = "".join(f"${v} " for v in vars_found)

    result = subprocess.run(
        ["envsubst", ev],
        input=rendered + "\n",
        capture_output=True,
        text=True,
        env=os.environ.copy(),
        timeout=300,
    )
    assert result.returncode == 0, result.stderr
    out = re.sub(r"\$\$([a-zA-Z0-9_]|\{)", lambda m: "$" + m.group(1), result.stdout)

    # Runtime variable survives as ${ARCH}, not as "$" or empty.
    assert 'a: "${ARCH}"' in out
    # Build-time substitution still works.
    assert 'b: "ersetzt"' in out
    # Brace-less form was never affected and stays correct.
    assert 'c: "$BIN"' in out


def test_t002306_shared_db_keeps_its_runtime_password_placeholders(repo_root):
    # Regression guard for the spot that caused the outage.
    shared_db = repo_root / "k3d" / "shared-db.yaml"
    pattern = re.compile(r"PASSWORD .\$\$\{[A-Z_]*_DB_PASSWORD\}")
    count = sum(1 for line in shared_db.read_text(encoding="utf-8").splitlines() if pattern.search(line))
    assert count >= 4
